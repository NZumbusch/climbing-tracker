/**
 * Utility for standardizing date and week calculations.
 * Uses ISO-8601 standard for week numbers:
 * - Weeks start on Monday.
 * - Week 01 is the week with the first Thursday of the year.
 */

/**
 * Returns a unique string identifier for a week (e.g., "2024-W01").
 * Correctly handles year-end transitions where a week may belong to 
 * the previous or next year according to ISO-8601.
 */
export function getWeekId(date: Date): string {
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  const weekNo = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  const year = new Date(firstThursday).getFullYear();
  return `${year}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Returns the week id immediately following `weekId`. Approximates every
 * year as 52 weeks (matches the pre-existing week-range loop this was
 * extracted from in `AIPromptModal.svelte` - see PROGRESS.md) rather than
 * computing true ISO week counts (52 or 53 depending on the year): a 53-week
 * year can produce one extra, slightly-early rollover to next year. Low-risk
 * here - only used for week-range generation/grouping, not for `getWeekId`
 * itself (which is exact).
 */
export function incrementWeekId(weekId: string): string {
  const match = weekId.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return weekId;
  let year = parseInt(match[1], 10);
  let week = parseInt(match[2], 10) + 1;
  if (week > 52) {
    week = 1;
    year++;
  }
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/**
 * Returns every week id from `startWeekId` to `endWeekId` inclusive.
 * Relies on "YYYY-Www" sorting correctly as a plain string (confirmed
 * elsewhere in this codebase, e.g. `trainingBlocks.ts`). Returns an empty
 * array if `startWeekId` is after `endWeekId`. Capped at 500 iterations as a
 * guard against a malformed id that never reaches `endWeekId`.
 */
export function getWeekIdRange(startWeekId: string, endWeekId: string): string[] {
  const ids: string[] = [];
  let current = startWeekId;
  for (let i = 0; i < 500 && current <= endWeekId; i++) {
    ids.push(current);
    if (current === endWeekId) break;
    current = incrementWeekId(current);
  }
  return ids;
}

/**
 * Formats an ISO date string into a user-friendly display date.
 */
export function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'No Date';
  return new Date(dateStr).toLocaleDateString(undefined, { 
    month: 'short', 
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Returns the UTC start (Monday) and end (Sunday) `Date`s of a given ISO
 * week ID, or `null` if `weekId` isn't in `YYYY-Www` shape. Extracted out of
 * `getWeekDateRange` (below) so callers that need an actual sample `Date` -
 * e.g. the rolling-ACWR window arithmetic in `loadAnalytics.ts`, which
 * samples the ratio "as of" a week's end date - don't have to re-parse a
 * formatted display string back into one.
 */
export function getWeekDates(weekId: string): { start: Date; end: Date } | null {
  const match = weekId.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return null;

  const year = parseInt(match[1]);
  const week = parseInt(match[2]);

  // January 4th is always in week 1.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = (jan4.getUTCDay() + 6) % 7; // Monday = 0
  const firstMonday = new Date(Date.UTC(year, 0, 4 - dayOfWeek));

  const start = new Date(firstMonday.getTime() + (week - 1) * 7 * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  return { start, end };
}

/**
 * Returns the start and end dates (as a formatted string) for a given ISO week ID.
 */
export function getWeekDateRange(weekId: string): string {
  if (!weekId) return '';
  const dates = getWeekDates(weekId);
  if (!dates) return '';

  const formatOpts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${dates.start.toLocaleDateString(undefined, formatOpts)} - ${dates.end.toLocaleDateString(undefined, formatOpts)}`;
}

/**
 * Converts an ISO date or datetime string to a UTC calendar-day index (whole
 * days since the Unix epoch). Every `date` this codebase stores is either a
 * bare `YYYY-MM-DD` (parsed by JS as UTC midnight already) or a
 * `.toISOString()` output (always UTC, `Z`-suffixed) - so extracting UTC
 * calendar components here is safe and DST-proof for both shapes actually in
 * use. Exists specifically so day-window arithmetic (rolling ACWR, see
 * `loadAnalytics.ts`) can do plain integer day-index subtraction instead of
 * the `new Date(t - n * 86400000)` + `.toISOString().split('T')[0]` pattern
 * UI_PLAN.md §5.3 explicitly warns drifts across DST boundaries by mixing
 * local and UTC time.
 */
export function toUtcDayIndex(isoDate: string): number {
  const d = new Date(isoDate);
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86400000);
}

