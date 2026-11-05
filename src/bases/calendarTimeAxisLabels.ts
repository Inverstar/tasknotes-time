/**
 * Time axis boundary labels.
 *
 * FullCalendar labels the first slot of a time grid but never renders a label
 * for the end of the configured range, so the last visible time is off by one
 * slot. These helpers add that missing label without touching the labels that
 * FullCalendar already renders.
 */

export const CALENDAR_AXIS_END_LABEL_CLASS = "tasknotes-calendar-axis-end-label";
export const CALENDAR_AXIS_END_HOST_CLASS = "tasknotes-calendar-axis-end-host";

/** Fallback label spacing when only one native axis label is measurable. */
const AXIS_END_LABEL_FALLBACK_GAP = 24;

/**
 * Parse a `HH:MM(:SS)` value into minutes from midnight. Values above 24:00 are
 * supported on purpose, because `slotMaxTime` may extend into the next day.
 */
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

/**
 * Format a time axis boundary label.
 *
 * In 24-hour mode the raw clock time is preserved, so a `slotMaxTime` of 24:00
 * stays `24:00` and 26:00 stays `26:00` instead of wrapping to the next day.
 */
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

/**
 * Resolve the element the end-of-range label should be positioned against.
 *
 * Day views render a dedicated axis chunk that spans the whole time grid. Week
 * and multi-day views render the axis as a single grid column cell (`fc-timegrid-col`)
 * that likewise spans the whole grid, plus a few shrink cells in the header, so
 * the spanning column is preferred and the last axis cell is only a fallback.
 */
function resolveAxisEndLabelHost(calendarEl: HTMLElement): HTMLElement | null {
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

/**
 * Append a single label at the bottom of the time axis that mirrors the axis
 * styling. It is safe to call repeatedly: previous labels are replaced.
 */
export function applyCalendarAxisEndLabel(options: {
	calendarEl: HTMLElement | null;
	viewType: string | null | undefined;
	slotMaxTime: string;
	timeFormat: string;
	locale?: string;
}): void {
	const { calendarEl, viewType, slotMaxTime, timeFormat, locale = "" } = options;
	if (!calendarEl) {
		return;
	}

	calendarEl
		.querySelectorAll<HTMLElement>(`.${CALENDAR_AXIS_END_LABEL_CLASS}`)
		.forEach((element) => element.remove());
	// Start from an unmodified scroll area; the extra row is measured below.
	calendarEl.querySelectorAll<HTMLElement>(".fc-scroller").forEach((element) => {
		element.style.removeProperty("padding-bottom");
	});
	calendarEl
		.querySelectorAll<HTMLElement>(`.${CALENDAR_AXIS_END_HOST_CLASS}`)
		.forEach((element) => element.style.removeProperty("padding-bottom"));

	if (!isCalendarTimeGridView(viewType)) {
		return;
	}

	const maxMinutes = parseCalendarTimeToMinutes(slotMaxTime);
	if (maxMinutes === null || maxMinutes <= 0) {
		return;
	}

	const host = resolveAxisEndLabelHost(calendarEl);
	if (!host) {
		return;
	}

	// The label is absolutely positioned, so the host needs to be a containing
	// block. The class is idempotent and harmless when FullCalendar already
	// positioned the element.
	host.classList.add(CALENDAR_AXIS_END_HOST_CLASS);

	const labelEl = calendarEl.ownerDocument.createElement("div");
	labelEl.className = `${CALENDAR_AXIS_END_LABEL_CLASS} fc-timegrid-slot-label-cushion`;
	labelEl.dataset.tnAxisBoundary = "end";
	labelEl.textContent = formatCalendarAxisBoundaryLabel(maxMinutes, timeFormat, locale);
	host.appendChild(labelEl);

	// FullCalendar labels the axis every 30 minutes with 15-minute slots, so its
	// last native label ends up right next to the end label. Reserve one more
	// label row: the label moves down by one label interval and the scroll area
	// grows by the same amount so the extra row is actually visible. FullCalendar
	// may render the native labels after this call, so the measurement is repeated
	// after the render settles.
	const reserveEndRow = () => {
		if (!labelEl.parentElement) {
			return;
		}

		const tops = [
			...calendarEl.querySelectorAll<HTMLElement>(".fc-timegrid-slot-label-cushion"),
		]
			.filter((element) => !element.classList.contains(CALENDAR_AXIS_END_LABEL_CLASS))
			.map((element) => element.getBoundingClientRect().top)
			.filter((top) => top > 0)
			.sort((a, b) => a - b);

		const endTop = labelEl.getBoundingClientRect().top;
		if (tops.length === 0 || endTop <= 0) {
			return;
		}

		const lastTop = tops[tops.length - 1];
		const gap =
			tops.length >= 2
				? lastTop - tops[tops.length - 2]
				: AXIS_END_LABEL_FALLBACK_GAP;
		if (gap <= 0) {
			return;
		}

		const currentExtra =
			Number.parseFloat(labelEl.style.getPropertyValue("--tn-axis-end-extra")) || 0;
		const nextExtra = Math.max(0, currentExtra + Math.round(lastTop + gap - endTop));
		if (Math.abs(nextExtra - currentExtra) <= 0.5) {
			return;
		}

		labelEl.style.setProperty("--tn-axis-end-extra", `${nextExtra}px`);
		// The axis lives in the main time-grid scroller, not the header's scroller.
		const scroller = host.closest<HTMLElement>(".fc-scroller");
		if (scroller) {
			scroller.style.paddingBottom = `${nextExtra}px`;
		}
	};

	reserveEndRow();
	const view = calendarEl.ownerDocument.defaultView;
	view?.requestAnimationFrame?.(reserveEndRow);
	view?.setTimeout?.(reserveEndRow, 120);
}
