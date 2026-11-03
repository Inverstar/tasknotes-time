/**
 * Staircase layout for overlapping timed events.
 *
 * FullCalendar lays overlapping events out in side-by-side columns, but an event
 * that only partially overlaps another one keeps the narrowed width for its whole
 * duration. To get the "staircase" look - full width where the task is alone and
 * an equal share where it overlaps - the event is split into one event per
 * interval where the set of overlapping events changes. FullCalendar then sizes
 * every segment on its own: segments that share a time range are split evenly,
 * segments that are alone keep the full column width.
 *
 * The synthetic segments carry metadata so that drag/resize operations can be
 * mapped back onto the original event.
 */

import type { EventInput } from "@fullcalendar/core";
import { format } from "date-fns";

export const TASKNOTES_STAIRCASE_PROP = "tasknotesStaircase";
export const TASKNOTES_PRIORITY_RANK_PROP = "tasknotesPriorityRank";
export const TASKNOTES_STAIRCASE_SEGMENT_CLASS = "tn-staircase-segment";

const DEFAULT_EVENT_DURATION_MS = 30 * 60 * 1000;

export type StaircaseSegmentMeta = {
	/** Id of the event the segment was split from. */
	originalId: string;
	/** Start of the original event (ISO string). */
	originalStart: string;
	/** End of the original event (ISO string). */
	originalEnd: string;
	/** Offset of the segment start from the original event start, in milliseconds. */
	offsetMs: number;
	isFirst: boolean;
	isLast: boolean;
	segmentIndex: number;
	segmentCount: number;
};

type TimedRange = {
	start: Date;
	end: Date;
	dayKey: string;
};

type IntervalSignature = {
	start: number;
	end: number;
	signature: string;
};

type PendingSplit = {
	index: number;
	event: EventInput;
	range: TimedRange;
	intervals: IntervalSignature[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function toDate(value: unknown): Date | null {
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? null : value;
	}

	if (typeof value === "string") {
		const parsed = new Date(value);
		return Number.isNaN(parsed.getTime()) ? null : parsed;
	}

	return null;
}

function getTimedRange(event: EventInput): TimedRange | null {
	if (event.allDay) {
		return null;
	}

	const start = toDate(event.start);
	if (!start) {
		return null;
	}

	const end = toDate(event.end) ?? new Date(start.getTime() + DEFAULT_EVENT_DURATION_MS);
	if (end.getTime() <= start.getTime()) {
		return null;
	}

	const dayKey = format(start, "yyyy-MM-dd");
	// Multi-day timed events are rendered as separate day columns by
	// FullCalendar; splitting them here would break that behaviour.
	if (format(end, "yyyy-MM-dd") !== dayKey) {
		return null;
	}

	return { start, end, dayKey };
}

function hasTaskInfo(event: EventInput): boolean {
	const extendedProps = event.extendedProps;
	return isRecord(extendedProps) && isRecord(extendedProps.taskInfo);
}

function looksLikeCalendarEvent(value: unknown): value is StaircaseSegmentMeta {
	return (
		isRecord(value) &&
		typeof value.originalId === "string" &&
		typeof value.originalStart === "string" &&
		typeof value.originalEnd === "string" &&
		typeof value.offsetMs === "number"
	);
}

export function readStaircaseSegmentMeta(extendedProps: unknown): StaircaseSegmentMeta | null {
	if (!isRecord(extendedProps)) {
		return null;
	}

	const candidate = extendedProps[TASKNOTES_STAIRCASE_PROP];
	return looksLikeCalendarEvent(candidate)
		? {
				originalId: candidate.originalId,
				originalStart: candidate.originalStart,
				originalEnd: candidate.originalEnd,
				offsetMs: candidate.offsetMs,
				isFirst: candidate.isFirst !== false,
				isLast: candidate.isLast !== false,
				segmentIndex:
					typeof candidate.segmentIndex === "number" ? candidate.segmentIndex : 0,
				segmentCount:
					typeof candidate.segmentCount === "number" ? candidate.segmentCount : 1,
			}
		: null;
}

function buildSegmentEvent(
	original: EventInput,
	index: number,
	segment: IntervalSignature,
	segmentIndex: number,
	segmentCount: number,
	range: TimedRange
): EventInput {
	const originalId = original.id === undefined ? `${index}` : String(original.id);
	const meta: StaircaseSegmentMeta = {
		originalId,
		originalStart: range.start.toISOString(),
		originalEnd: range.end.toISOString(),
		offsetMs: segment.start - range.start.getTime(),
		isFirst: segmentIndex === 0,
		isLast: segmentIndex === segmentCount - 1,
		segmentIndex,
		segmentCount,
	};

	const existingClassNames = Array.isArray(original.classNames) ? original.classNames : [];
	const classNames = [
		...existingClassNames,
		TASKNOTES_STAIRCASE_SEGMENT_CLASS,
		meta.isFirst ? `${TASKNOTES_STAIRCASE_SEGMENT_CLASS}--first` : "",
		meta.isLast ? `${TASKNOTES_STAIRCASE_SEGMENT_CLASS}--last` : "",
	].filter(Boolean);

	return {
		...original,
		id: `${originalId}::tnseg${segmentIndex}`,
		start: new Date(segment.start),
		end: new Date(segment.end),
		classNames,
		extendedProps: {
			...(isRecord(original.extendedProps) ? original.extendedProps : {}),
			[TASKNOTES_STAIRCASE_PROP]: meta,
		},
	};
}

function mergeIntervals(intervals: IntervalSignature[]): IntervalSignature[] {
	const merged: IntervalSignature[] = [];

	for (const interval of intervals) {
		const previous = merged[merged.length - 1];
		if (
			previous &&
			previous.signature === interval.signature &&
			previous.end === interval.start
		) {
			previous.end = interval.end;
			continue;
		}

		merged.push({ ...interval });
	}

	return merged;
}

/**
 * Split partially overlapping timed events so that every event keeps the full
 * column width outside of overlapping ranges. Events that never overlap are
 * returned untouched.
 */
export function splitOverlappingCalendarEvents(events: EventInput[]): EventInput[] {
	const candidates: PendingSplit[] = [];

	events.forEach((event, index) => {
		if (!hasTaskInfo(event)) {
			return;
		}

		const range = getTimedRange(event);
		if (!range) {
			return;
		}

		candidates.push({ index, event, range, intervals: [] });
	});

	if (candidates.length < 2) {
		return events;
	}

	const candidatesByDay = new Map<string, PendingSplit[]>();
	for (const candidate of candidates) {
		const bucket = candidatesByDay.get(candidate.range.dayKey);
		if (bucket) {
			bucket.push(candidate);
		} else {
			candidatesByDay.set(candidate.range.dayKey, [candidate]);
		}
	}

	for (const bucket of candidatesByDay.values()) {
		if (bucket.length < 2) {
			continue;
		}

		const boundaries = new Set<number>();
		for (const entry of bucket) {
			boundaries.add(entry.range.start.getTime());
			boundaries.add(entry.range.end.getTime());
		}
		const sortedBoundaries = [...boundaries].sort((a, b) => a - b);

		for (let i = 0; i < sortedBoundaries.length - 1; i += 1) {
			const intervalStart = sortedBoundaries[i];
			const intervalEnd = sortedBoundaries[i + 1];
			if (intervalStart === intervalEnd) {
				continue;
			}

			const active = bucket.filter(
				(entry) =>
					entry.range.start.getTime() <= intervalStart &&
					entry.range.end.getTime() >= intervalEnd
			);
			if (active.length === 0) {
				continue;
			}

			const signature = active
				.map((entry) => bucket.indexOf(entry))
				.sort((a, b) => a - b)
				.join(",");

			for (const entry of active) {
				entry.intervals.push({ start: intervalStart, end: intervalEnd, signature });
			}
		}
	}

	const replacements = new Map<number, EventInput[]>();
	for (const candidate of candidates) {
		const segments = mergeIntervals(candidate.intervals);
		if (segments.length <= 1) {
			continue;
		}

		replacements.set(
			candidate.index,
			segments.map((segment, index) =>
				buildSegmentEvent(
					candidate.event,
					candidate.index,
					segment,
					index,
					segments.length,
					candidate.range
				)
			)
		);
	}

	if (replacements.size === 0) {
		return events;
	}

	const result: EventInput[] = [];
	events.forEach((event, index) => {
		const replacement = replacements.get(index);
		if (replacement) {
			result.push(...replacement);
			return;
		}

		result.push(event);
	});

	return result;
}

/**
 * Rank task events by priority weight so overlapping events are laid out left to
 * right in priority order (FullCalendar orders overlap columns by `eventOrder`).
 */
export function applyCalendarEventPriorityRanks(
	events: EventInput[],
	getPriorityWeight: (priority: string | undefined) => number | undefined
): void {
	for (const event of events) {
		const extendedProps = event.extendedProps;
		if (!isRecord(extendedProps) || !isRecord(extendedProps.taskInfo)) {
			continue;
		}

		const priority = extendedProps.taskInfo.priority;
		const weight = getPriorityWeight(typeof priority === "string" ? priority : undefined);
		if (typeof weight !== "number" || !Number.isFinite(weight)) {
			continue;
		}

		extendedProps[TASKNOTES_PRIORITY_RANK_PROP] = weight;
	}
}

/**
 * Translate the new start of a dragged segment back to the new start of the whole
 * original event.
 */
export function resolveStaircaseDropStart(
	meta: StaircaseSegmentMeta,
	segmentStart: Date | null | undefined
): Date | null {
	if (!segmentStart || Number.isNaN(segmentStart.getTime())) {
		return null;
	}

	return new Date(segmentStart.getTime() - meta.offsetMs);
}

/**
 * Translate a resize of a segment into the new range of the whole event.
 *
 * Only the first segment exposes a start resizer and only the last segment
 * exposes an end resizer (see `trimStaircaseResizers`), so a start change always
 * means "the event starts earlier/later" and an end change means "the event ends
 * earlier/later".
 */
export function resolveStaircaseResizeRange(
	meta: StaircaseSegmentMeta,
	previous: { start?: Date | null; end?: Date | null },
	next: { start?: Date | null; end?: Date | null }
): { start: Date; end: Date } | null {
	const originalStart = new Date(meta.originalStart);
	const originalEnd = new Date(meta.originalEnd);
	if (Number.isNaN(originalStart.getTime()) || Number.isNaN(originalEnd.getTime())) {
		return null;
	}

	const previousStart = previous.start?.getTime();
	const nextStart = next.start?.getTime();
	const startMoved =
		typeof previousStart === "number" && typeof nextStart === "number"
			? previousStart !== nextStart
			: false;

	if (startMoved) {
		if (!next.start) {
			return null;
		}

		return {
			start: next.start,
			end: originalEnd,
		};
	}

	if (!next.end) {
		return null;
	}

	return {
		start: originalStart,
		end: next.end,
	};
}
