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
 * Returns the start and end dates (as a formatted string) for a given ISO week ID.
 */
export function getWeekDateRange(weekId: string): string {
  if (!weekId) return '';
  const match = weekId.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return '';

  const year = parseInt(match[1]);
  const week = parseInt(match[2]);

  // January 4th is always in week 1.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = (jan4.getUTCDay() + 6) % 7; // Monday = 0
  const firstMonday = new Date(Date.UTC(year, 0, 4 - dayOfWeek));

  const startOfWeek = new Date(firstMonday.getTime() + (week - 1) * 7 * 24 * 60 * 60 * 1000);
  const endOfWeek = new Date(startOfWeek.getTime() + 6 * 24 * 60 * 60 * 1000);

  const formatOpts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${startOfWeek.toLocaleDateString(undefined, formatOpts)} - ${endOfWeek.toLocaleDateString(undefined, formatOpts)}`;
}

