/**
 * Time axis start label.
 *
 * FullCalendar renders a label for the first labelled slot of a time grid. When
 * the configured start time does not fall on a label interval, the first visible
 * label belongs to a later slot and the configured start time is missing. This
 * helper adds that single label at the top of the axis. It never changes the
 * grid height, adds a row, or grows the scroll area.
 */

export const CALENDAR_AXIS_START_LABEL_CLASS = "tasknotes-calendar-axis-start-label";
export const CALENDAR_AXIS_START_HOST_CLASS = "tasknotes-calendar-axis-start-host";

/** Parse an `HH:MM(:SS)` value into minutes from midnight. */
export function parseCalendarTimeToMinutes(value: string | null | undefined): number | null {
	if (typeof value !== "string") {
		return null;
	}

	const match = /^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/.exec(value.trim());
	if (!match) {
		return null;
	}

	return Number(match[1]) * 60 + Number(match[2]);
}

function formatClockTime(hours: number, minutes: number): string {
	const pad = (value: number) => String(value).padStart(2, "0");
	return `${pad(hours)}:${pad(minutes)}`;
}

/** Format a time axis boundary label in the calendar's 12/24-hour notation. */
export function formatCalendarAxisBoundaryLabel(
	totalMinutes: number,
	timeFormat: string,
	locale = ""
): string {
	if (!Number.isFinite(totalMinutes)) {
		return "";
	}

	const rounded = Math.round(totalMinutes);
	const minutes = ((rounded % 60) + 60) % 60;
	const rawHours = Math.floor(rounded / 60);

	if (timeFormat === "12") {
		const hoursInDay = ((rawHours % 24) + 24) % 24;
		try {
			return new Intl.DateTimeFormat(locale || undefined, {
				hour: "2-digit",
				minute: "2-digit",
				hour12: true,
			}).format(new Date(2000, 0, 1, hoursInDay, minutes));
		} catch {
			const hour12 = hoursInDay % 12 === 0 ? 12 : hoursInDay % 12;
			return `${formatClockTime(hour12, minutes)} ${hoursInDay < 12 ? "AM" : "PM"}`;
		}
	}

	return formatClockTime(rawHours, minutes);
}

export function isCalendarTimeGridView(viewType: string | null | undefined): boolean {
	return typeof viewType === "string" && viewType.startsWith("timeGrid");
}

/** Resolve the axis element that spans the whole time grid. */
function resolveAxisHost(calendarEl: HTMLElement): HTMLElement | null {
	const axisChunk = calendarEl.querySelector<HTMLElement>(".fc-timegrid-axis-chunk");
	if (axisChunk) {
		return axisChunk;
	}

	const axisColumn = calendarEl.querySelector<HTMLElement>(".fc-timegrid-axis.fc-timegrid-col");
	if (axisColumn) {
		return axisColumn;
	}

	const axisCells = calendarEl.querySelectorAll<HTMLElement>(".fc-timegrid-axis");
	return axisCells.length > 0 ? axisCells[axisCells.length - 1] : null;
}

/** Read the time shown by a native FullCalendar slot label. */
function nativeLabelMinutes(text: string): number | null {
	const match = /(\d{1,2}):(\d{2})/.exec(text);
	if (!match) {
		return null;
	}

	const hours = Number(match[1]);
	const minutes = Number(match[2]);
	if (/\s*[ap]\.?m\.?/i.test(text)) {
		const isAfternoon = /p\.?m\.?/i.test(text);
		return (hours % 12) * 60 + (isAfternoon ? 720 : 0) + minutes;
	}

	return hours * 60 + minutes;
}

/**
 * Add the configured start time at the top of the axis when FullCalendar does
 * not already show it. Safe to call repeatedly: previous labels are replaced.
 */
export function applyCalendarAxisStartLabel(options: {
	calendarEl: HTMLElement | null;
	viewType: string | null | undefined;
	slotMinTime: string;
	timeFormat: string;
	locale?: string;
}): void {
	const { calendarEl, viewType, slotMinTime, timeFormat, locale = "" } = options;
	if (!calendarEl) {
		return;
	}

	calendarEl
		.querySelectorAll<HTMLElement>(`.${CALENDAR_AXIS_START_LABEL_CLASS}`)
		.forEach((element) => element.remove());

	if (!isCalendarTimeGridView(viewType)) {
		return;
	}

	const startMinutes = parseCalendarTimeToMinutes(slotMinTime);
	if (startMinutes === null) {
		return;
	}

	const text = formatCalendarAxisBoundaryLabel(startMinutes, timeFormat, locale);
	if (!text) {
		return;
	}

	// FullCalendar already labels the first slot. Only add a label when the
	// visible one belongs to a different time, otherwise it would be duplicated.
	const firstNative = [
		...calendarEl.querySelectorAll<HTMLElement>(".fc-timegrid-slot-label-cushion"),
	]
		.map((element) => element.textContent?.trim() ?? "")
		.find((label) => label.length > 0);

	if (firstNative) {
		if (firstNative === text) {
			return;
		}
		const shownMinutes = nativeLabelMinutes(firstNative);
		if (shownMinutes === null || shownMinutes === startMinutes % 1440) {
			return;
		}
	}

	const host = resolveAxisHost(calendarEl);
	if (!host) {
		return;
	}

	host.classList.add(CALENDAR_AXIS_START_HOST_CLASS);
	const labelEl = calendarEl.ownerDocument.createElement("div");
	labelEl.className = `${CALENDAR_AXIS_START_LABEL_CLASS} fc-timegrid-slot-label-cushion`;
	labelEl.dataset.tnAxisBoundary = "start";
	labelEl.textContent = text;
	host.appendChild(labelEl);
}
