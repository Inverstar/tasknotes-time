import type { EventInput } from "@fullcalendar/core";
import {
	applyBasesSortIndexesToCalendarEvents,
	getTaskNotesCalendarEventOrder,
	hasBasesCalendarSortConfig,
	TASKNOTES_CALENDAR_SORT_INDEX,
} from "../../../src/bases/CalendarView";

describe("Issue #1411: Agenda Calendar Bases respect Bases sort order", () => {
	it("orders overlapping events by priority, then by FullCalendar's default order", () => {
		expect(hasBasesCalendarSortConfig(undefined)).toBe(false);
		expect(hasBasesCalendarSortConfig([])).toBe(false);
		expect(getTaskNotesCalendarEventOrder(undefined)).toBe(
			"-tasknotesPriorityRank,start,-duration,allDay,title"
		);
	});

	it("falls back to the TaskNotes sort index when priorities are equal", () => {
		const sortConfig = [{ column: "note.status", direction: "ASC" }];

		expect(hasBasesCalendarSortConfig(sortConfig)).toBe(true);
		expect(getTaskNotesCalendarEventOrder(sortConfig)).toBe(
			`-tasknotesPriorityRank,${TASKNOTES_CALENDAR_SORT_INDEX},start,-duration,allDay,title`
		);
	});

	it("adds Bases result indexes to task and property-based events", () => {
		const events: EventInput[] = [
			{
				id: "scheduled-task-b",
				title: "B",
				extendedProps: {
					taskInfo: { path: "Tasks/B.md" },
				},
			},
			{
				id: "property-a",
				title: "A",
				extendedProps: {
					eventType: "property-based",
					filePath: "Tasks/A.md",
				},
			},
			{
				id: "external",
				title: "External",
				extendedProps: {
					eventType: "ics",
				},
			},
		];

		applyBasesSortIndexesToCalendarEvents(
			events,
			new Map([
				["Tasks/A.md", 0],
				["Tasks/B.md", 1],
			])
		);

		expect(events[0].extendedProps?.[TASKNOTES_CALENDAR_SORT_INDEX]).toBe(1);
		expect(events[1].extendedProps?.[TASKNOTES_CALENDAR_SORT_INDEX]).toBe(0);
		expect(events[2].extendedProps?.[TASKNOTES_CALENDAR_SORT_INDEX]).toBeUndefined();
	});
});
