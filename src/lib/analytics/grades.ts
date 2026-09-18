/**
 * Pure grade-ordering helper for the Analytics "Outdoor Ascents" panel
 * (UI_PLAN.md §4.6, Stage 5). `OutdoorAscent.grade` (`types.ts`) is a free
 * string with no grade-system field - it's populated only by the 8a.nu CSV
 * importer today (`outdoorAscentCsvImport.ts`), and the real confirmed
 * sample export (`data.csv`, repo root) uses the Fontainebleau bouldering
 * scale exclusively ("5C", "6A", "6A+", "7B", ...). There's no existing
 * grade table anywhere in this codebase to build on, so this is a
 * best-effort ordering for a chart's y-axis, not a certified multi-system
 * grade-conversion table - a grade that doesn't match the Font pattern
 * (e.g. a V-scale or YDS value) returns `undefined` rather than being
 * silently misplaced; callers must handle that rather than assume every
 * grade parses. **Known limitation:** French route grades ("7a", "6c+")
 * share Font's exact `<number><letter><+>` shape and are
 * case-insensitively indistinguishable from it here, so a route ascent
 * logged in French grades would be misread as a Font grade rather than
 * rejected. `OutdoorAscent` has no `type`/grade-system field to
 * disambiguate (`types.ts`), and the CSV importer doesn't carry the
 * source's `route_boulder` column through either - fixing this needs a
 * schema addition, out of scope for this stage (UI_PLAN.md §7's tripwire).
 */

/**
 * Approximate numeric rank for a Fontainebleau grade string, monotonically
 * increasing with difficulty - not evenly spaced, and not meaningful
 * outside this module (it exists only to order/position points on a chart
 * axis). Case-insensitive, tolerates surrounding whitespace.
 */
export function parseFontGrade(grade: string): number | undefined {
  const match = grade.trim().match(/^(\d+)([A-C])?(\+)?$/i);
  if (!match) return undefined;

  const num = parseInt(match[1], 10);
  const letterOffset = match[2] ? (match[2].toUpperCase().charCodeAt(0) - 65) * 10 : -10;
  const plusOffset = match[3] ? 5 : 0;

  return num * 100 + letterOffset + plusOffset;
}
