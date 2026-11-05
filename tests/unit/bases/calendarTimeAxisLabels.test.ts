import {
	applyCalendarAxisStartLabel,
	CALENDAR_AXIS_START_HOST_CLASS,
	CALENDAR_AXIS_START_LABEL_CLASS,
	formatCalendarAxisBoundaryLabel,
	isCalendarTimeGridView,
	parseCalendarTimeToMinutes,
} from "../../../src/bases/calendarTimeAxisLabels";

describe("calendar time axis boundary labels", () => {
	it("parses HH:MM and HH:MM:SS values, including times past midnight", () => {
		expect(parseCalendarTimeToMinutes("08:30")).toBe(510);
		expect(parseCalendarTimeToMinutes("24:00:00")).toBe(1440);
		expect(parseCalendarTimeToMinutes("26:00")).toBe(1560);
		expect(parseCalendarTimeToMinutes("nope")).toBeNull();
	});

	it("keeps cross-day notation in 24-hour mode", () => {
		expect(formatCalendarAxisBoundaryLabel(1440, "24")).toBe("24:00");
		expect(formatCalendarAxisBoundaryLabel(1560, "24")).toBe("26:00");
		expect(formatCalendarAxisBoundaryLabel(570, "24")).toBe("09:30");
	});

	it("uses 12-hour notation when the calendar uses it", () => {
		expect(formatCalendarAxisBoundaryLabel(1440, "12", "en-US")).toBe("12:00 AM");
		expect(formatCalendarAxisBoundaryLabel(1560, "12", "en-US")).toBe("02:00 AM");
		expect(formatCalendarAxisBoundaryLabel(780, "12", "en-US")).toBe("01:00 PM");
	});

	it("detects time grid views", () => {
		expect(isCalendarTimeGridView("timeGridWeek")).toBe(true);
		expect(isCalendarTimeGridView("timeGridCustom")).toBe(true);
		expect(isCalendarTimeGridView("dayGridMonth")).toBe(false);
		expect(isCalendarTimeGridView(undefined)).toBe(false);
	});
});

describe("applyCalendarAxisStartLabel", () => {
	function createCalendarEl(firstLabel = "08:00", withScroller = false): HTMLElement {
		const calendarEl = document.createElement("div");
		const axis = `
			<div class="fc-timegrid-axis-chunk">
				<table><tbody><tr><td class="fc-timegrid-slot-label">
					<div class="fc-timegrid-slot-label-cushion">${firstLabel}</div>
				</td></tr></tbody></table>
			</div>
		`;
		calendarEl.innerHTML = withScroller
			? `<div class="fc-scroller">${axis}</div>`
			: axis;
		return calendarEl;
	}

	function apply(
		calendarEl: HTMLElement,
		slotMinTime = "08:00:00",
		viewType = "timeGridWeek"
	): void {
		applyCalendarAxisStartLabel({
			calendarEl,
			viewType,
			slotMinTime,
			timeFormat: "24",
		});
	}

	it("does not duplicate the label when FullCalendar already shows the start time", () => {
		const calendarEl = createCalendarEl("08:00");

		apply(calendarEl);

		expect(calendarEl.querySelector(`.${CALENDAR_AXIS_START_LABEL_CLASS}`)).toBeNull();
	});

	it("adds the start label when the first native label is a later time", () => {
		const calendarEl = createCalendarEl("09:00");

		apply(calendarEl, "08:10:00");

		const label = calendarEl.querySelector<HTMLElement>(
			`.${CALENDAR_AXIS_START_LABEL_CLASS}`
		);
		expect(label?.textContent).toBe("08:10");
		expect(label?.parentElement?.classList.contains(CALENDAR_AXIS_START_HOST_CLASS)).toBe(
			true
		);
	});

	it("does not add a row or grow the scroll area", () => {
		const calendarEl = createCalendarEl("09:00", true);

		apply(calendarEl, "08:10:00");

		const label = calendarEl.querySelector<HTMLElement>(
			`.${CALENDAR_AXIS_START_LABEL_CLASS}`
		);
		const scroller = calendarEl.querySelector<HTMLElement>(".fc-scroller");
		expect(scroller?.style.paddingBottom).toBe("");
		expect(label?.style.getPropertyValue("--tn-axis-end-extra")).toBe("");
		expect(calendarEl.querySelector(".tasknotes-calendar-axis-end-label")).toBeNull();
	});

	it("replaces a previously injected label instead of duplicating it", () => {
		const calendarEl = createCalendarEl("09:00");

		apply(calendarEl, "08:10:00");
		apply(calendarEl, "08:20:00");

		const labels = calendarEl.querySelectorAll(`.${CALENDAR_AXIS_START_LABEL_CLASS}`);
		expect(labels).toHaveLength(1);
		expect(labels[0].textContent).toBe("08:20");
	});

	it("removes the label for non time-grid views", () => {
		const calendarEl = createCalendarEl("09:00");

		apply(calendarEl, "08:10:00");
		apply(calendarEl, "08:10:00", "dayGridMonth");

		expect(calendarEl.querySelector(`.${CALENDAR_AXIS_START_LABEL_CLASS}`)).toBeNull();
	});

	it("ignores invalid start times", () => {
		const calendarEl = createCalendarEl("09:00");

		apply(calendarEl, "not-a-time");

		expect(calendarEl.querySelector(`.${CALENDAR_AXIS_START_LABEL_CLASS}`)).toBeNull();
	});
});
