/**
 * Overlap column ordering for calendar events.
 *
 * FullCalendar lays overlapping events out in side-by-side columns and derives
 * their left-to-right order from the `eventOrder` option. This module attaches a
 * priority weight to task events so the highest priority task claims the left
 * column. Events are kept whole: each task keeps its column width for its entire
 * duration, and tasks that do not overlap keep the full width of the column.
 */

import type { EventInput } from "@fullcalendar/core";

export const TASKNOTES_PRIORITY_RANK_PROP = "tasknotesPriorityRank";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
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
