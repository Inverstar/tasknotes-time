import type { EventInput } from "@fullcalendar/core";
import {
	applyCalendarEventPriorityRanks,
	readStaircaseSegmentMeta,
	resolveStaircaseDropStart,
	resolveStaircaseResizeRange,
	splitOverlappingCalendarEvents,
	TASKNOTES_PRIORITY_RANK_PROP,
	TASKNOTES_STAIRCASE_PROP,
	TASKNOTES_STAIRCASE_SEGMENT_CLASS,
	type StaircaseSegmentMeta,
} from "../../../src/bases/calendarOverlapLayout";

function createTaskEvent(
	id: string,
	start: string,
	end: string,
	overrides: Partial<EventInput> = {}
): EventInput {
	return {
		id,
		title: id,
		start,
		end,
		allDay: false,
		eventType: "scheduled",
		extendedProps: {
			taskInfo: { path: `${id}.md`, priority: "normal" },
			eventType: "scheduled",
		},
		...overrides,
	} as EventInput;
}

function getSegments(events: EventInput[], id: string): EventInput[] {
	return events.filter((event) => String(event.id).startsWith(`${id}::tnseg`));
}

function getRange(event: EventInput): { start: string; end: string } {
	const start = event.start instanceof Date ? event.start : new Date(String(event.start));
	const end = event.end instanceof Date ? event.end : new Date(String(event.end));
	return { start: start.toISOString(), end: end.toISOString() };
}

describe("splitOverlappingCalendarEvents", () => {
	it("leaves non-overlapping events untouched", () => {
		const events = [
			createTaskEvent("a", "2026-01-05T09:00:00", "2026-01-05T10:00:00"),
			createTaskEvent("b", "2026-01-05T11:00:00", "2026-01-05T12:00:00"),
		];

		expect(splitOverlappingCalendarEvents(events)).toBe(events);
	});

	it("splits a partially overlapping task into full-width and shared segments", () => {
		const events = [
			createTaskEvent("a", "2026-01-05T09:00:00", "2026-01-05T11:00:00"),
			createTaskEvent("b", "2026-01-05T10:00:00", "2026-01-05T10:30:00"),
		];

		const result = splitOverlappingCalendarEvents(events);
		const segments = getSegments(result, "a");

		expect(segments).toHaveLength(3);
		expect(segments.map(getRange)).toEqual([
			{
				start: new Date("2026-01-05T09:00:00").toISOString(),
				end: new Date("2026-01-05T10:00:00").toISOString(),
			},
			{
				start: new Date("2026-01-05T10:00:00").toISOString(),
				end: new Date("2026-01-05T10:30:00").toISOString(),
			},
			{
				start: new Date("2026-01-05T10:30:00").toISOString(),
				end: new Date("2026-01-05T11:00:00").toISOString(),
			},
		]);

		const firstMeta = readStaircaseSegmentMeta(segments[0].extendedProps);
		const lastMeta = readStaircaseSegmentMeta(segments[2].extendedProps);
		expect(firstMeta).toMatchObject({ segmentIndex: 0, segmentCount: 3, isFirst: true });
		expect(lastMeta).toMatchObject({ segmentIndex: 2, segmentCount: 3, isLast: true });
		expect(segments[0].classNames).toEqual(
			expect.arrayContaining([
				TASKNOTES_STAIRCASE_SEGMENT_CLASS,
				`${TASKNOTES_STAIRCASE_SEGMENT_CLASS}--first`,
			])
		);

		// The fully covered event is not split, it is already laid out side by side
		expect(getSegments(result, "b")).toHaveLength(0);
		expect(result).toHaveLength(4);
	});

	it("keeps an event that is fully covered by another one unsplit", () => {
		const events = [
			createTaskEvent("a", "2026-01-05T10:00:00", "2026-01-05T11:00:00"),
			createTaskEvent("b", "2026-01-05T09:00:00", "2026-01-05T12:00:00"),
		];

		const result = splitOverlappingCalendarEvents(events);

		// "a" is overlapped for its whole duration, so there is nothing to gain
		expect(getSegments(result, "a")).toHaveLength(0);
		// "b" is alone before and after "a"
		expect(getSegments(result, "b")).toHaveLength(3);
		expect(result).toHaveLength(4);
	});

	it("handles chained overlaps independently per interval", () => {
		const events = [
			createTaskEvent("a", "2026-01-05T09:00:00", "2026-01-05T10:00:00"),
			createTaskEvent("b", "2026-01-05T09:30:00", "2026-01-05T10:30:00"),
			createTaskEvent("c", "2026-01-05T10:00:00", "2026-01-05T11:00:00"),
		];

		const result = splitOverlappingCalendarEvents(events);

		expect(getSegments(result, "a")).toHaveLength(2);
		expect(getSegments(result, "b")).toHaveLength(2);
		expect(getSegments(result, "c")).toHaveLength(2);
		expect(result).toHaveLength(6);
	});

	it("ignores all-day, multi-day and non-task events", () => {
		const allDay = createTaskEvent("all-day", "2026-01-05", "2026-01-06", { allDay: true });
		const multiDay = createTaskEvent(
			"multi-day",
			"2026-01-05T22:00:00",
			"2026-01-06T02:00:00"
		);
		const ics = {
			id: "ics",
			title: "External",
			start: "2026-01-05T09:00:00",
			end: "2026-01-05T12:00:00",
			allDay: false,
			extendedProps: { eventType: "ics" },
		} as EventInput;
		const events = [
			createTaskEvent("a", "2026-01-05T09:00:00", "2026-01-05T11:00:00"),
			allDay,
			multiDay,
			ics,
		];

		const result = splitOverlappingCalendarEvents(events);

		expect(result).toHaveLength(4);
		expect(getSegments(result, "a")).toHaveLength(0);
	});

	it("splits events on different days independently", () => {
		const events = [
			createTaskEvent("a", "2026-01-05T09:00:00", "2026-01-05T11:00:00"),
			createTaskEvent("b", "2026-01-05T10:00:00", "2026-01-05T10:30:00"),
			createTaskEvent("c", "2026-01-06T09:00:00", "2026-01-06T11:00:00"),
		];

		const result = splitOverlappingCalendarEvents(events);

		expect(getSegments(result, "a")).toHaveLength(3);
		expect(getSegments(result, "c")).toHaveLength(0);
	});
});

describe("staircase segment metadata", () => {
	function createMeta(): StaircaseSegmentMeta {
		return {
			originalId: "task-a",
			originalStart: new Date("2026-01-05T09:00:00").toISOString(),
			originalEnd: new Date("2026-01-05T11:00:00").toISOString(),
			offsetMs: 60 * 60 * 1000,
			isFirst: false,
			isLast: false,
			segmentIndex: 1,
			segmentCount: 3,
		};
	}

	it("maps a dragged segment back to the original event start", () => {
		const meta = createMeta();

		const start = resolveStaircaseDropStart(
			meta,
			new Date("2026-01-05T11:00:00") // segment start, one hour after the event start
		);

		expect(start?.toISOString()).toBe(new Date("2026-01-05T10:00:00").toISOString());
		expect(resolveStaircaseDropStart(meta, null)).toBeNull();
	});

	it("maps an end resize back to the original event range", () => {
		const meta = createMeta();
		const originalStart = new Date(meta.originalStart);
		const originalEnd = new Date(meta.originalEnd);

		const resized = resolveStaircaseResizeRange(
			meta,
			{ start: originalStart, end: originalEnd },
			{ start: originalStart, end: new Date("2026-01-05T12:00:00") }
		);

		expect(resized?.start.toISOString()).toBe(originalStart.toISOString());
		expect(resized?.end.toISOString()).toBe(new Date("2026-01-05T12:00:00").toISOString());
	});

	it("maps a start resize back to the original event range", () => {
		const meta = { ...createMeta(), offsetMs: 0, isFirst: true };
		const originalEnd = new Date(meta.originalEnd);

		const resized = resolveStaircaseResizeRange(
			meta,
			{ start: new Date("2026-01-05T09:00:00"), end: originalEnd },
			{ start: new Date("2026-01-05T08:30:00"), end: originalEnd }
		);

		expect(resized?.start.toISOString()).toBe(new Date("2026-01-05T08:30:00").toISOString());
		expect(resized?.end.toISOString()).toBe(originalEnd.toISOString());
	});

	it("ignores metadata that is not a staircase segment", () => {
		expect(readStaircaseSegmentMeta({})).toBeNull();
		expect(readStaircaseSegmentMeta({ [TASKNOTES_STAIRCASE_PROP]: { foo: "bar" } })).toBeNull();
	});
});

describe("applyCalendarEventPriorityRanks", () => {
	it("stores the priority weight on task events so overlap columns follow priority", () => {
		const events = [
			createTaskEvent("high", "2026-01-05T09:00:00", "2026-01-05T10:00:00", {
				extendedProps: { taskInfo: { path: "high.md", priority: "high" } },
			}),
			createTaskEvent("low", "2026-01-05T09:00:00", "2026-01-05T10:00:00", {
				extendedProps: { taskInfo: { path: "low.md", priority: "low" } },
			}),
			{
				id: "ics",
				title: "External",
				start: "2026-01-05T09:00:00",
				extendedProps: { eventType: "ics" },
			} as EventInput,
		];

		applyCalendarEventPriorityRanks(events, (priority) =>
			priority === "high" ? 3 : priority === "low" ? 1 : undefined
		);

		expect(events[0].extendedProps?.[TASKNOTES_PRIORITY_RANK_PROP]).toBe(3);
		expect(events[1].extendedProps?.[TASKNOTES_PRIORITY_RANK_PROP]).toBe(1);
		expect(events[2].extendedProps?.[TASKNOTES_PRIORITY_RANK_PROP]).toBeUndefined();
	});
});
