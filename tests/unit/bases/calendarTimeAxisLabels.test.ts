import {
	applyCalendarAxisEndLabel,
	CALENDAR_AXIS_END_LABEL_CLASS,
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

describe("applyCalendarAxisEndLabel", () => {
	function createCalendarEl(): HTMLElement {
		const calendarEl = document.createElement("div");
		calendarEl.innerHTML = `
			<div class="fc-timegrid-axis-chunk">
				<table><tbody><tr><td class="fc-timegrid-slot-label">23:00</td></tr></tbody></table>
			</div>
		`;
		return calendarEl;
	}

	it("appends the end-of-day label to the time axis", () => {
		const calendarEl = createCalendarEl();

		applyCalendarAxisEndLabel({
			calendarEl,
			viewType: "timeGridWeek",
			slotMaxTime: "24:00:00",
			timeFormat: "24",
		});

		const label = calendarEl.querySelector<HTMLElement>(`.${CALENDAR_AXIS_END_LABEL_CLASS}`);
		expect(label).not.toBeNull();
		expect(label?.textContent).toBe("24:00");
		expect(label?.parentElement?.classList.contains("fc-timegrid-axis-chunk")).toBe(true);
	});

	it("replaces a previously injected label instead of duplicating it", () => {
		const calendarEl = createCalendarEl();

		applyCalendarAxisEndLabel({
			calendarEl,
			viewType: "timeGridWeek",
			slotMaxTime: "24:00:00",
			timeFormat: "24",
		});
		applyCalendarAxisEndLabel({
			calendarEl,
			viewType: "timeGridWeek",
			slotMaxTime: "22:00:00",
			timeFormat: "24",
		});

		const labels = calendarEl.querySelectorAll(`.${CALENDAR_AXIS_END_LABEL_CLASS}`);
		expect(labels).toHaveLength(1);
		expect(labels[0].textContent).toBe("22:00");
	});

	it("removes the label for non time-grid views", () => {
		const calendarEl = createCalendarEl();

		applyCalendarAxisEndLabel({
			calendarEl,
			viewType: "timeGridWeek",
			slotMaxTime: "24:00:00",
			timeFormat: "24",
		});
		applyCalendarAxisEndLabel({
			calendarEl,
			viewType: "dayGridMonth",
			slotMaxTime: "24:00:00",
			timeFormat: "24",
		});

		expect(calendarEl.querySelector(`.${CALENDAR_AXIS_END_LABEL_CLASS}`)).toBeNull();
	});
});
