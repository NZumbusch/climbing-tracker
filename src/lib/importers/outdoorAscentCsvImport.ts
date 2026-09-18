import type { OutdoorAscent } from "../types";
import { generateId } from "../utils";

/**
 * Parses an 8a.nu ascent-log CSV export into `OutdoorAscent[]` (PLAN.md
 * Phase 6). Column format confirmed against a real sample export
 * (`data.csv`, repo root, gitignored/untracked - see PROGRESS.md
 * 2026-09-17), not guessed:
 *
 *   route_boulder,name,location_name,sector_name,area_name,country_code,
 *   date,type,sub_type,rating,project,tries,repeats,difficulty,
 *   perceived_hardness,comment,height,recommended,sits
 *
 * Only a subset of these columns is used - this is deliberately a
 * lightweight log for correlating outdoor performance against training
 * load, not a pyramid-builder (PLAN.md's explicit locked-in scope note).
 */

export interface OutdoorAscentImportResult {
  ascents: OutdoorAscent[];
  skipped: { line: number; reason: string }[];
}

/**
 * Hand-rolled RFC4180-ish CSV row parser (quoted fields, "" as an escaped
 * quote, commas/newlines inside quotes, unquoted empty fields) - no new
 * dependency, matching this codebase's existing convention (see PLAN.md
 * Phase 5's `schema.ts`).
 */
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < len) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      pushField();
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      pushRow();
      i++;
      continue;
    }
    field += c;
    i++;
  }
  // Flush a trailing field/row for files that don't end in a newline.
  if (field.length > 0 || row.length > 0) pushRow();

  // Drop fully-blank lines (e.g. the artifact of a trailing newline).
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

// Only "f" and "rp" are confirmed from the real sample export. "o" is added
// as a commonly-known third 8a.nu code but wasn't observed directly -
// anything unrecognized falls back to the raw code (uppercased) rather than
// guessing further codes or dropping the field.
const ASCENT_STYLE_LABELS: Record<string, string> = {
  f: "Flash",
  rp: "Redpoint",
  o: "Onsight",
};

function resolveStyle(code: string | undefined): string | undefined {
  if (!code) return undefined;
  return ASCENT_STYLE_LABELS[code.toLowerCase()] ?? code.toUpperCase();
}

/**
 * 8a.nu exports a missing value as the literal string "null" (confirmed
 * against the real sample - see the module doc comment above), not an
 * empty field or a real JSON null. Empty/whitespace-only fields are also
 * treated as absent.
 */
function cleanField(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.toLowerCase() === "null") return undefined;
  return trimmed;
}

export function parseOutdoorAscentCsv(csvText: string): OutdoorAscentImportResult {
  const rows = parseCsvRows(csvText);
  const ascents: OutdoorAscent[] = [];
  const skipped: { line: number; reason: string }[] = [];

  if (rows.length === 0) return { ascents, skipped };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);

  const dateCol = col("date");
  const difficultyCol = col("difficulty");
  const nameCol = col("name");
  const typeCol = col("type");
  const locationCol = col("location_name");
  const commentCol = col("comment");

  if (dateCol === -1 || difficultyCol === -1) {
    skipped.push({
      line: 1,
      reason: "Missing required 'date' and/or 'difficulty' column in header - not a recognized 8a.nu export",
    });
    return { ascents, skipped };
  }

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const date = cleanField(row[dateCol]);
    const grade = cleanField(row[difficultyCol]);

    if (!date || !grade) {
      skipped.push({
        line: i + 1,
        reason: !date ? "Missing date" : "Missing difficulty/grade",
      });
      continue;
    }

    ascents.push({
      id: generateId(),
      date,
      grade,
      name: nameCol !== -1 ? cleanField(row[nameCol]) : undefined,
      style: resolveStyle(typeCol !== -1 ? cleanField(row[typeCol]) : undefined),
      crag: locationCol !== -1 ? cleanField(row[locationCol]) : undefined,
      notes: commentCol !== -1 ? cleanField(row[commentCol]) : undefined,
    });
  }

  return { ascents, skipped };
}
