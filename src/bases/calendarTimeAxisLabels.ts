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
export const CALENDAR_AXIS_LABEL_SUPPRESSED_CLASS =
	"tasknotes-calendar-axis-label-suppressed";

/** Minimum overlap (px) before a native axis label is hidden to make room for the end label. */
const AXIS_END_LABEL_OVERLAP_THRESHOLD = 4;

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
	calendarEl
		.querySelectorAll<HTMLElement>(`.${CALENDAR_AXIS_LABEL_SUPPRESSED_CLASS}`)
		.forEach((element) => element.classList.remove(CALENDAR_AXIS_LABEL_SUPPRESSED_CLASS));

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

	// With short slots FullCalendar labels the axis more often (30 minutes for a
	// 15-minute grid) while the end label sits on the bottom edge of the grid.
	// The last native label can then overlap it; hide that one label so the axis
	// ends with a readable "...23:00, 24:00" instead of two colliding labels.
	// FullCalendar may render the native labels after this call, so the check is
	// repeated on the next frame and once more after the render settles.
	const suppressCollidingLabel = () => {
		if (!labelEl.parentElement) {
			return;
		}

		const nativeLabels = [
			...calendarEl.querySelectorAll<HTMLElement>(".fc-timegrid-slot-label-cushion"),
		]
			.filter((element) => !element.classList.contains(CALENDAR_AXIS_END_LABEL_CLASS))
			.map((element) => ({ element, rect: element.getBoundingClientRect() }))
			.filter((entry) => entry.rect.top > 0)
			.sort((a, b) => a.rect.top - b.rect.top);

		const lastNative = nativeLabels[nativeLabels.length - 1];
		if (!lastNative) {
			return;
		}

		// The label frame is collapsed to zero height to keep tiny slot rows
		// uniform, so its rectangle may have no height; fall back to the text's
		// line height when measuring how far the label extends.
		const lineHeight =
			Number.parseFloat(getComputedStyle(lastNative.element).lineHeight) || 15;
		const labelBottom = Math.max(
			lastNative.rect.bottom,
			lastNative.rect.top + lineHeight
		);

		if (
			labelBottom - labelEl.getBoundingClientRect().top >
			AXIS_END_LABEL_OVERLAP_THRESHOLD
		) {
			lastNative.element.classList.add(CALENDAR_AXIS_LABEL_SUPPRESSED_CLASS);
		}
	};

	suppressCollidingLabel();
	const view = calendarEl.ownerDocument.defaultView;
	view?.requestAnimationFrame(suppressCollidingLabel);
	view?.setTimeout(suppressCollidingLabel, 120);
}
