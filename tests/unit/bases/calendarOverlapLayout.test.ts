import type { EventInput } from "@fullcalendar/core";
import {
	applyCalendarEventPriorityRanks,
	TASKNOTES_PRIORITY_RANK_PROP,
} from "../../../src/bases/calendarOverlapLayout";

function createTaskEvent(id: string, priority: string): EventInput {
	return {
		id,
		title: id,
		start: "2026-01-05T09:00:00",
		end: "2026-01-05T10:00:00",
		allDay: false,
		extendedProps: {
			taskInfo: { path: `${id}.md`, priority },
			eventType: "scheduled",
		},
	} as EventInput;
}

describe("calendar overlap column order", () => {
	it("stores the priority weight on task events so overlap columns follow priority", () => {
		const events = [
			createTaskEvent("high", "high"),
			createTaskEvent("low", "low"),
			createTaskEvent("none", ""),
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
		expect(events[3].extendedProps?.[TASKNOTES_PRIORITY_RANK_PROP]).toBeUndefined();
	});

	it("does not create or split any events", () => {
		const events = [createTaskEvent("a", "high"), createTaskEvent("b", "low")];
		const ids = events.map((event) => event.id);

		applyCalendarEventPriorityRanks(events, () => 2);

		expect(events).toHaveLength(2);
		expect(events.map((event) => event.id)).toEqual(ids);
		expect(
			events.every((event) => !String(event.id).includes("tnseg"))
		).toBe(true);
	});
});
