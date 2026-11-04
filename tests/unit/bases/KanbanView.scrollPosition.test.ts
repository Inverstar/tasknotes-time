import { KanbanView } from "../../../src/bases/KanbanView";
import * as basesHelpers from "../../../src/bases/helpers";
import * as goalPanel from "../../../src/ui/goals/GoalProgressPanel";
import type { TaskInfo } from "../../../src/types";

const task = { path: "task.md", title: "Task", status: "open", tags: [] } as TaskInfo;

function setup() {
	const container = document.body.createDiv();
	const root = container.createDiv();
	const board = root.createDiv();
	const view = new KanbanView({}, container, {
		settings: { calendarViewSettings: { firstDay: 1 } },
		goalService: { listGoals: jest.fn().mockResolvedValue([]) },
	} as any);
	const internal = view as any;
	Object.assign(internal, {
		rootElement: root,
		boardEl: board,
		data: { data: [] },
		dataAdapter: { extractDataItems: () => [] },
	});
	jest.spyOn(internal, "setupSearch").mockImplementation(() => {});
	jest.spyOn(internal, "setupTimeFilterControls").mockImplementation(() => {});
	jest.spyOn(internal, "applySearchFilter").mockImplementation((tasks) => tasks);
	jest.spyOn(internal, "setExpandedRelationshipTaskScope").mockImplementation(() => {});
	jest.spyOn(internal, "getTopLevelRenderTasks").mockImplementation((tasks) => tasks);
	jest.spyOn(internal, "getGroupByPropertyId").mockReturnValue("note.status");
	jest.spyOn(internal, "groupTasks").mockReturnValue(new Map([["open", [task]]]));
	jest.spyOn(goalPanel, "renderGoalProgressPanel").mockResolvedValue(undefined);
	const identify = jest
		.spyOn(basesHelpers, "identifyTaskNotesFromBasesData")
		.mockResolvedValue([task]);

	function populate(virtual = true) {
		const flat = board
			.createDiv({ cls: "kanban-view__column", attr: { "data-group": "open" } })
			.createDiv({ cls: "kanban-view__cards" });
		const cell = board
			.createDiv({
				cls: "kanban-view__swimlane-column",
				attr: { "data-column": "done", "data-swimlane": "project" },
			})
			.createDiv({ cls: "kanban-view__tasks-container" });
		if (virtual) {
			internal.columnScrollers.set("open", { scrollContainer: flat, destroy: jest.fn() });
			internal.columnScrollers.set("project:done", {
				scrollContainer: cell,
				destroy: jest.fn(),
			});
		}
		return { flat, cell };
	}
	let lists = populate();
	// jsdom does not clamp offsets when content disappears. Model the browser's
	// reset when the live board is emptied, which caused the reported jump.
	const empty = board.empty.bind(board);
	jest.spyOn(board, "empty").mockImplementation(() => {
		empty();
		board.scrollTop = board.scrollLeft = root.scrollTop = container.scrollTop = 0;
	});
	let nextVirtual = true;
	jest.spyOn(internal, "renderFlat").mockImplementation(async () => {
		lists = populate(nextVirtual);
	});
	const renderError = jest.spyOn(view, "renderError");
	const render = jest.spyOn(view, "render");
	function scroll(offset: number) {
		container.scrollTop = offset + 1;
		root.scrollTop = offset + 2;
		board.scrollTop = offset + 3;
		board.scrollLeft = offset + 4;
		lists.flat.scrollTop = offset + 5;
		lists.cell.scrollTop = offset + 6;
	}
	function expectScroll(offset: number) {
		expect(renderError).not.toHaveBeenCalled();
		expect(container.scrollTop).toBe(offset + 1);
		expect(root.scrollTop).toBe(offset + 2);
		expect(board.scrollTop).toBe(offset + 3);
		expect(board.scrollLeft).toBe(offset + 4);
		expect(lists.flat.scrollTop).toBe(offset + 5);
		expect(lists.cell.scrollTop).toBe(offset + 6);
	}
	return {
		view,
		internal,
		identify,
		render,
		scroll,
		expectScroll,
		setVirtual: (value: boolean) => {
			nextVirtual = value;
		},
	};
}

describe("Kanban task refresh scroll positions", () => {
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => {
		jest.useRealTimers();
		document.body.replaceChildren();
	});

	it.each(["add", "edit date", "delete"])(
		"preserves every scroll surface after a slow Bases update (%s)",
		async (operation) => {
			const fixture = setup();
			let finish!: (tasks: TaskInfo[]) => void;
			fixture.identify.mockReturnValueOnce(
				new Promise((resolve) => {
					finish = resolve;
				})
			);
			fixture.scroll(200);
			fixture.view.onDataUpdated();
			// Data loading lasts longer than an animation frame, so restoring on
			// the next frame before the async render completes cannot fix this.
			jest.advanceTimersByTime(100);
			fixture.scroll(400);
			finish(operation === "delete" ? [] : [{ ...task, scheduled: "2026-11-05" }]);
			await fixture.render.mock.results[0].value;
			fixture.expectScroll(400);
			fixture.scroll(600);
			jest.advanceTimersByTime(100);
			fixture.expectScroll(600);
		}
	);

	it("uses the position at commit time for debounced task notifications", async () => {
		const fixture = setup();
		fixture.scroll(100);
		fixture.internal.debouncedRefresh();
		jest.advanceTimersByTime(100);
		fixture.scroll(300);
		fixture.internal.debouncedRefresh();
		jest.advanceTimersByTime(150);
		fixture.scroll(500);
		await fixture.render.mock.results[0].value;
		expect(fixture.render).toHaveBeenCalledTimes(1);
		fixture.expectScroll(500);
	});

	it.each([false, true])(
		"preserves positions across virtual-list threshold changes (next virtual: %s)",
		async (nextVirtual) => {
			const fixture = setup();
			fixture.setVirtual(false);
			await fixture.view.render();
			fixture.scroll(700);
			fixture.setVirtual(nextVirtual);
			await fixture.view.render();
			fixture.expectScroll(700);
			fixture.setVirtual(!nextVirtual);
			await fixture.view.render();
			fixture.expectScroll(700);
		}
	);
});
