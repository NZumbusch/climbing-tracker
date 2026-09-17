# Boulder Tracker — Professional Training Refactor Plan

## How to use this file

This plan is split into 8 phases (0–7). **Implement them in order, one at a
time.** Do not skip ahead or combine phases, even if a later phase looks
easy — later phases depend on invariants established by earlier ones.

For each phase:
1. Read the whole phase section before writing any code.
2. Implement the scope described. If something is flagged under
   "Assumptions / open questions," make the stated default choice unless the
   user says otherwise — don't block on it, but don't silently pick a
   *different* answer either.
3. Run the checks listed under "Definition of done." All of them must pass.
4. Commit with a message referencing the phase number
   (e.g. `git commit -m "Phase 1: core data model — ID refs, prescribed/logged split"`).
5. Only then move to the next phase.

This file is written to be self-contained: a fresh session with no memory of
prior conversation should be able to open this file, read one phase, and
implement it correctly without needing the rest of this project's chat
history. If you are that fresh session: read the "Context & conventions"
section below first, then jump to whichever phase is next (check `git log`
for the last "Phase N: ..." / "Prerequisite: ..." commit to find where to
resume).

There is a **Prerequisite** step below, before Phase 0 — do that first.
There is also a `PROGRESS.md` file in the repo root: a running log of
implementation notes, findings, and decisions made *during* implementation
(as opposed to this file, which is the plan decided *before* implementation
started). Read it alongside this file when resuming work, and append to it
— don't rewrite past entries — whenever you make a non-obvious judgment
call, discover something about the real data that changes scope, or
perform a safety check this plan asked you to log.

---

## Context & conventions

**Stack:** Svelte 5 (runes/`$state`), Vite 8, TypeScript, Tailwind 4,
Capacitor 8 (iOS/Android), `localforage` (web storage) +
`@capacitor/filesystem` (native storage), no backend — fully local-first,
single-athlete, no accounts.

**Current data version:** `DATA_EXPORT_VERSION` in `src/lib/constants.ts` is
`"3.12"`. There is an existing, working, hand-written linear migration chain
in `src/lib/storage.ts` (`runDataMigrations`, ~550 lines, 22 historical
steps) that has correctly carried real user data through 22 schema changes.
**Never break this chain's discipline**: every schema change ships as (a) an
additive/optional field in `src/lib/types.ts`, (b) one migration step, (c) a
`DATA_EXPORT_VERSION` bump, (d) a test. This plan formalizes that discipline
with tooling (Phase 0) rather than replacing it.

**Design principles established for this refactor** (referenced by phase
number below — read these once, they explain *why* later phases are shaped
the way they are):

1. **Reference definitions by ID, never by name.** `Benchmark.typeId` →
   `BenchmarkTypeDef.id` is the existing correct pattern; `Exercise.type`
   (a name string) is the existing incorrect one. Phase 1 fixes this.
2. **Definitions are archived, never hard-deleted, once referenced.** Every
   user-editable catalog (exercise types, categories, phases, benchmark
   types) gets an `archived?: boolean` flag instead of deletion once
   anything historical references it.
3. **Separate "the goal" from "the log," once, structurally, not per-field.**
   The recurring bug class in this codebase: `plannedDuration`/`duration`
   and `reps`/`actualReps` are ad hoc, one-off instances of this same
   problem, and most fields (`sets`, `weight`, `grades`, ...) never got the
   treatment at all, so editing a workout during/after a session silently
   overwrites the plan it should be compared against. Phase 1 fixes this
   once, generally, via `ExerciseSlot.prescribed` / `ExerciseSlot.logged`.
4. **"What can be tracked" is data; "what was tracked" is a record —
   applied consistently.** Already true for `ExerciseTypeDef`/`ParameterBlock`
   and `BenchmarkTypeDef`/`Benchmark`. Phase 1 extends it to daily metrics
   (`MetricDef`/`DailyMetricEntry` replacing the fixed-shape
   `DailyReadiness`) and Phase 3 extends it to training phases (`PhaseDef`
   replacing the closed `PhaseType` union). **Deliberately not extended** to
   the 4-axis fatigue formula (fingers/arms/core/systemic stay fixed,
   documented fields — see Phase 1) or to pain tracking (stays a dedicated
   `PainLog` entity, not a generic metric — see Phase 1).
5. **Every schema change is additive + one migration + one fixture test.**
   The enforcement mechanism for all four principles above.

**Product scope locked in for this plan** (from prior discussion — don't
relitigate these):
- Local-first, single-athlete. No accounts, no cloud sync, no coach/athlete
  multi-user.
- Real periodization science: concurrent training blocks, competition
  peaking calendar, load-management analytics (ACWR-style).
- AI integration stays copy/paste-based (no direct LLM API key/calls) —
  paste data out, paste validated JSON back in.
- No indoor grade-pyramid/ticklist feature (Kilter/gym apps already cover
  this, and it's gym-grading-dependent/confusing per user). A lightweight
  *optional* 8a.nu outdoor-ascent CSV import is in scope instead (Phase 6),
  since 8a.nu has no public API but does support CSV export.
- "Garmin integration" was originally scoped as Apple Health / Health
  Connect import (Phase 7), on the theory that Garmin Connect syncs into
  both platforms so this would cover Garmin without needing Garmin-specific
  API access. **Dropped 2026-09-17** (see Phase 7): the user's phone
  doesn't support syncing Garmin into Health Connect, so that path doesn't
  work for their actual device, and no maintained plugin candidate covered
  the needed metrics (sleep/HRV/RHR) anyway. No health-platform import is
  in scope for this plan. Readiness metrics stay manual-entry only via
  Phase 1's `MetricDef`/`DailyMetricEntry` system.

---

## Prerequisite — Baseline migration test suite (do this before Phase 0)

**Goal / why:** There is currently no test suite at all (`npm run test` fails
with "Missing script," zero `*.test.*`/`*.spec.*` files exist). Phase 0
refactors the 550-line migration if-chain into a registry; that refactor can
only be verified as behavior-preserving if tests exist against the
**current, untouched** migration code *first*. Writing tests before the
refactor (characterization testing) rather than alongside it is the point
of splitting this out as its own step.

A real historical backup (`old_backup.json`, repo root, `exportVersion:
"2.1"`, 16 workouts, 5 exercise types, real periodization/templates) was
inspected while scoping this step. Running it conceptually through the
current migration chain surfaced two real, confirmed bugs in *shipped*
migration code — not hypothetical edge cases. Fixing them is now in scope
for this prerequisite (decided 2026-09-16, see `PROGRESS.md`):

1. **Data loss (confirmed):** the `3.8 → 3.9` migration step
   (`storage.ts`, grade-field-merge step) unconditionally does
   `delete e.variant` after only handling `activeParameters` filtering. It
   was written assuming `variant` only mattered for
   `e.type === "Boulder Intervals"` exercises (which get converted first,
   in the `3.4 → 3.5` step). `old_backup.json` has 5 `"Non-Free
   Bouldering"`-type exercises with a `variant` value — a type the newer
   Boulder-Intervals conversion never touches — so their `variant` value is
   silently dropped today, with no way to recover it after the fact.
   **Fix:** amend the existing `3.8 → 3.9` step (don't add a new version —
   this doesn't change what shape 3.9 data has, it just stops discarding
   information while getting there) so that before deleting `e.variant`, if
   it's still present, fold it into `e.notes` (e.g. append
   `[Variant: 4x4]`) instead of dropping it. Add a test with data that
   already lacks `variant` (post-migration data) to confirm the amendment
   is a no-op for already-migrated records.
2. **Schema drift (confirmed, no data lost yet):** `old_backup.json`'s
   `exerciseTypes` declare parameters `"boulderingStyle"` and
   `"hangboardTimes"` — neither exists in the current `ParameterBlock`
   union (`"climbingStyle"` and `"timeOn"`/`"timeOff"` are the current
   names), and no migration step ever renamed them. No logged exercise
   instance currently has a value set for either (checked — 0 instances),
   so nothing is lost yet, but importing old data like this today would
   make those parameter inputs silently vanish from the UI.
   **Fix:** add a new migration step, `3.12 → 3.13`: rename
   `"boulderingStyle"` → `"climbingStyle"` and `"hangboardTimes"` →
   `"timeOn"` wherever they appear in `exerciseTypes[].parameters`,
   `exerciseTypes[].possibleParameters`, and any `activeParameters` arrays
   on workout/template exercises.
3. **Unmapped legacy phase names (confirmed, product decision needed —
   now decided):** `old_backup.json`'s `periodization`/`templates` use
   phase names `"Maintenance"` and `"Endurance"`, absent from the current
   7-phase list, with no migration mapping. **Decided mapping:**
   `"Maintenance"` → `"Deload"`, `"Endurance"` → `"Power Endurance"`.
   **Fix:** add a new migration step, `3.13 → 3.14`: rename these phase
   values in `periodization[].phase` and rekey `templates`. If a target key
   already exists (e.g. a real `templates.Deload` already present
   alongside a legacy `templates.Maintenance`), **concatenate the arrays**
   — never let one silently overwrite/drop the other.

**Concrete scope:**
- Add `vitest` as a devDependency; add `"test": "vitest run"` to
  `package.json`; add minimal `vitest.config.ts`.
- Export `runDataMigrations` from `storage.ts` so it's callable from tests.
  **Before making this change**, re-read the current function in full and
  confirm: (a) it only reads its `data` parameter plus module-level
  imported constants (`DEFAULT_BENCHMARK_TYPES`, `DEFAULT_TEMPLATES`,
  `DEFAULT_EXERCISE_TYPES`, `DEFAULT_ANALYTICS_CATEGORIES`, `generateId`) —
  it does **not** close over or mutate `_dbState` or any other module-private
  state; (b) both call sites (`runStartupMigrations`, which has an
  early-return guard *around* the call, and `importData`, which has none)
  keep exactly the behavior they have today — adding `export` to the
  function declaration changes nothing about either caller. Log this check
  — what you verified and confirmed — as a `PROGRESS.md` entry when you
  make this change, per the instruction that prompted it.
- Add the two new migration steps described above (`3.12→3.13`,
  `3.13→3.14`) and amend the existing `3.8→3.9` step, all in the *current*
  if-chain form (do not do the Phase 0 registry refactor here — that's
  still Phase 0's job, now with a bigger baseline to refactor against).
  Bump `DATA_EXPORT_VERSION` in `constants.ts` to `"3.14"`.
- Fixture tests:
  - **Primary fixture:** `old_backup.json` itself, copied into a test
    fixtures folder (e.g. `src/lib/__fixtures__/backup-2.1.json`). Run the
    full chain on it and assert: no throw; all 16 workouts present; every
    workout/exercise `id` is a string (`2.6→2.7` step); the 5 `variant`
    values from the `"Non-Free Bouldering"` exercises are now findable in
    the corresponding exercises' `notes`; no `exerciseTypes` entry still
    lists `"boulderingStyle"` or `"hangboardTimes"` as a parameter, and
    `"Free Bouldering"`/`"Hangboard"` list `"climbingStyle"`/`"timeOn"`
    instead; no `periodization` entry has `phase: "Maintenance"` or
    `"Endurance"`, and `templates` has no leftover `"Maintenance"`/
    `"Endurance"` keys.
  - A small **hand-built 1.0/2.0-era fixture** for the one branch
    `old_backup.json` doesn't exercise (the `!exportVersion || "2.0" ||
    "1.0"` → `2.1` step, which only adds default `benchmarks`/
    `benchmarkTypes`) — low complexity, safe to hand-construct rather than
    needing a real file.
  - Targeted boundary tests (isolated small fixtures, not the full
    `old_backup.json`) for: `2.1→2.2` field renames (`addedWeight`,
    `rungSize`, `boulderingType`), `2.8→2.9` (`climbingStyle` string→array),
    `3.4→3.5` (Boulder Intervals split), the amended `3.8→3.9` (grade merge
    + variant preservation, both the lossy-before-fix case and the
    already-migrated no-op case), the new `3.12→3.13` (parameter rename),
    the new `3.13→3.14` (phase rename with and without a colliding target
    key, to test the concatenation rule).
  - Full-chain test: minimal `"1.0"`-shaped fixture run to the new
    `"3.14"`, asserting no throw and a valid `TrainingData` shape.
  - No-op test: fixture already at `"3.14"`, asserting migrations don't
    touch it.
  - Round-trip test: small in-memory dataset through export→import,
    asserting counts/fields survive.
- **Not in scope** (stays in Phase 0 proper): the if-chain → registry
  refactor, `calculateLoadFactor`/`calculatePlannedLoad` tests, auto-backup/
  invariant-check implementation.

**Dependencies on earlier phases:** None.

**Risk level: Low.** Test-writing plus small, additive, data-preserving
migration fixes (stop deleting a value, add two rename steps) — no
restructuring, no change to already-migrated data (the amended `3.8→3.9`
step is a no-op for data that's already past that version and no longer has
`variant`).

**Definition of done:**
- `npm run test` passes, covering everything listed above.
- `npm run check` passes.
- Manual check: run `old_backup.json` through the (now-fixed) import flow
  in the actual running app, confirm the 5 variant-carrying exercises show
  the preserved info in their notes, confirm "Free Bouldering"/"Hangboard"
  show the renamed parameters correctly in the exercise form, confirm the
  weeks that were `"Maintenance"`/`"Endurance"` now show as
  `"Deload"`/`"Power Endurance"` in the plan calendar.
- `PROGRESS.md` updated with the export-safety-check note (see above) and
  a summary of the fixture findings.
- Git commit made (recommend committing this as its own commit, separate
  from Phase 0's commit, since it's a distinct prerequisite step).

**Assumptions / open questions:**
- If older backups than `old_backup.json` (true `1.0`/`2.0`-era files)
  turn up later, they'd be a nice-to-have addition to the fixture set but
  are not required to proceed — the one branch they'd cover
  (`1.0`/`2.0`→`2.1`) is low-complexity and already covered by a hand-built
  fixture.
- The `variant` preservation format (appending `[Variant: X]` to `notes`)
  is a reasonable default, not a carefully designed feature — if this data
  turns out to matter enough to deserve a real field, that's a Phase 1
  conversation (structured data vs. a notes-string breadcrumb), not this
  prerequisite's job.

---

## Phase 0 — Migration safety net

**Goal / why:** Every later phase makes schema changes. The existing
migration chain works but is an untested 550-line if-chain with no rollback
and no invariant checking. Before touching the schema at all, make bad
migrations detectable and recoverable, and make the migration mechanism
testable in isolation. This phase is pure infrastructure — it changes no
user-visible behavior.

**Concrete scope:**
- `vitest` is already set up by the Prerequisite step — nothing to add here.
- Refactor `runDataMigrations` in `src/lib/storage.ts` (already exported by
  the Prerequisite step, already including the `3.8→3.9` amendment and the
  new `3.12→3.13`/`3.13→3.14` steps) from a linear if-chain into an
  ordered, data-driven registry:
  ```ts
  interface MigrationStep {
    from: string;         // exportVersion this step applies to
    to: string;            // exportVersion after this step
    describe: string;
    migrate: (data: any) => void; // mutates in place, same as today
  }
  const MIGRATIONS: MigrationStep[] = [ /* one entry per existing historical step, extracted verbatim */ ];
  function runDataMigrations(data: any): void {
    let version = data.exportVersion || "1.0";
    for (const step of MIGRATIONS) {
      if (version !== step.from) continue;
      // walk in registry order starting from wherever `version` currently is
    }
    data.exportVersion = version;
  }
  ```
  This must be a **behavior-preserving refactor** — extract each existing
  `if (importVersion === "X.Y")` block into one `MigrationStep` verbatim,
  don't rewrite migration logic while doing this. Run it as a loop over the
  registry in order rather than re-testing string equality by hand each
  time.
- Re-run the fixture tests written in the Prerequisite step against the new
  registry-based implementation — they must pass unchanged (same
  assertions, same fixtures, including the `old_backup.json`-based test).
  If any assertion needs to change to pass, that's a signal the refactor
  changed behavior, not that the test was wrong — stop and investigate
  before proceeding.
- Add a pre-migration auto-backup: before `runStartupMigrations` mutates
  `_dbState`, write a snapshot copy (e.g. `localforage.setItem('backup_pre_migration_<fromVersion>', ...)` on web, or a sibling file like
  `boulder_tracker_db.backup.json` via `Filesystem` on native). Keep only the
  most recent backup (overwrite, don't accumulate).
- Add a post-migration invariant check function, e.g.
  `assertMigrationInvariants(before, after)`: workout count preserved,
  benchmark count preserved, every `workout.exercises[].type` (pre-Phase-1)
  still resolves to a known exercise type name. If it fails: restore from
  the backup snapshot, surface a blocking in-app error (don't silently
  continue on corrupted data), and log details to console for debugging.
- Add unit tests for `calculateLoadFactor` and `calculatePlannedLoad`
  (`src/lib/types.ts`) — currently completely untested pure functions that
  every other analytics feature in this plan builds on.

**Dependencies on earlier phases:** The Prerequisite step above (baseline
migration test suite) must be complete — this phase's registry refactor
needs to be verified against those characterization tests, and the two
migration fixes made in the Prerequisite step (`3.8→3.9` amendment,
`3.12→3.13`, `3.13→3.14`) need to already be extracted into the registry
along with everything else, not layered on afterward.

**Risk level: Low–Medium.** Touches the migration code path, which is
critical, but this is explicitly a behavior-preserving extraction plus
additive safety nets — no schema changes, no new fields, no changed
migration semantics. The main risk is introducing a subtle bug while
extracting the if-chain into the registry; the fixture tests exist
specifically to catch that.

**Definition of done:**
- `npm run test` passes: the Prerequisite step's migration tests unchanged,
  plus new tests for `calculateLoadFactor`/`calculatePlannedLoad`.
- `npm run check` (svelte-check) passes.
- Manually verify: export data from the app as it exists today, then import
  it back in — round-trips without error or data loss.
- Manually verify the backup-and-restore path: temporarily force an
  invariant check to fail, confirm the app restores the pre-migration
  snapshot instead of proceeding with bad data, then revert the forced
  failure.
- Git commit made.

**Assumptions / open questions:**
- Writing a full fixture test for *all 22* historical migration steps is
  ideal but not required to consider this phase done — prioritize the steps
  that restructure data (renames, splits, merges) over the steps that only
  bump a version or add a default value. Add more fixtures opportunistically
  later if a regression is ever found in an untested step.
- Where exactly to store the pre-migration backup on native (Capacitor
  `Filesystem`) vs web (`localforage`) is left to whoever implements this —
  match the existing `initDB`/`flushDB` dual-path pattern already in
  `storage.ts`.

---

## Phase 1 — Core data model: ID references, archivable definitions, prescribed/logged split

**Goal / why:** This is the phase that fixes the "biggest flaw" the user
identified (editing a workout overwrites the plan it should be compared
against) and the related name-based-reference fragility. It's the
highest-risk phase in this plan because it restructures the shape of every
workout and template exercise, but it's also the foundational fix that every
later phase (analytics, AI import, adherence tracking) depends on being
correct. Do this once, thoroughly, rather than patching it further later.

**Concrete scope — type changes (`src/lib/types.ts`):**

```ts
// Replaces the old flat Exercise interface for storage purposes.
// ExerciseValues holds whichever ParameterBlock fields are relevant —
// same field list as today's Exercise (minGrade, maxGrade, cadence,
// climbingStyle, boardType, boardAngle, leadStyle, sets, reps, weight,
// holdType, timeOn, timeOff, timeBetweenSets, holdSize, distance,
// campusType, difficulty, routeDifficulty, bodyweightPercent,
// maxWeightPercent, mobilityType, movesPerRoute, duration, plannedLoad,
// notes). Do not split notes or plannedLoad differently than other
// fields — the whole set moves together.
interface ExerciseValues { /* ...existing Exercise parameter fields... */ }

interface ExerciseSlot {
  id: string;                     // stable for the life of this slot
  typeId: string;                 // -> ExerciseTypeDef.id (was: type: string, by name)
  categoryId?: string;            // -> AnalyticsCategory.id, overrides the type's default category
                                   // (was: category?: string, by name). Added during implementation:
                                   // this code block originally omitted it, but the migration scope
                                   // below always required resolving Exercise.category the same way
                                   // as typeId - see PROGRESS.md 2026-09-16 "Phase 1 scope gap-fills".
  activeParameters?: ParameterBlock[];
  prescribed?: ExerciseValues;    // the goal, set at plan time, stable
  logged?: ExerciseValues;        // what happened, edited during/after session
}

interface Workout {
  id: string;
  status: "planned" | "completed";
  date: string | null;
  startTime?: string;
  dayOfWeek?: DayOfWeek;
  notes?: string;
  description?: string;
  weekId: string;
  loadFactor: number;             // derived from logged exercises + fatigue
  plannedLoad?: number;           // derived from prescribed exercises
  exercises: ExerciseSlot[];      // was: Exercise[]
  fingers?: number; arms?: number; core?: number; systemic?: number; // unchanged, fixed axes — see principle 4
}

// Definition registries gain archived flags (principle 2):
interface ExerciseTypeDef { /* ...existing fields... */ archived?: boolean; }
interface AnalyticsCategory { /* ...existing fields... */ archived?: boolean; }
interface BenchmarkTypeDef { /* ...existing fields... */ archived?: boolean; }

// Replaces the fixed-shape DailyReadiness (principle 4):
interface MetricDef {
  id: string;          // e.g. "sleep-score", "hrv", "rhr", "bodyweight"
  name: string;
  unit: string;
  archived?: boolean;
}
interface DailyMetricEntry {
  id: string;
  metricId: string;    // -> MetricDef.id
  date: string;         // YYYY-MM-DD
  value: number;
  note?: string;
}

// New dedicated entity (principle 4 — NOT folded into the generic metric system):
interface PainLog {
  id: string;
  date: string;
  weekId: string;
  bodyPart: string;    // free text or a small fixed vocabulary — implementer's call, see below
  severity: number;    // 1-10
  notes?: string;
}

interface TrainingData {
  workouts: Workout[];
  periodization: PeriodizationWeek[]; // unchanged in this phase, see Phase 3/4
  exerciseTypes: ExerciseTypeDef[];
  templates: Record<PhaseType, Partial<Workout>[]>; // unchanged in this phase, see Phase 3
  benchmarks: Benchmark[];
  benchmarkTypes: BenchmarkTypeDef[];
  analyticsCategories: AnalyticsCategory[];
  metricDefs: MetricDef[];         // new
  dailyMetrics: DailyMetricEntry[]; // new, replaces dailyReadiness
  painLogs: PainLog[];             // new, empty by default
}
```

Drop the redundant cached exercise-type-name field — do **not** keep a
`type: string` display cache alongside `typeId`. Anywhere that needs the
display name (UI, CSV export) resolves it via lookup against the current
`exerciseTypes` list by `typeId`. This is deliberate: a cached copy
reintroduces the exact "two sources of truth" problem this phase exists to
remove.

**Concrete scope — storage/migration changes (`src/lib/storage.ts`,
using the Phase 0 registry):**
- New migration step: resolve every `Exercise.type` (name) to the matching
  `ExerciseTypeDef.id`, producing `typeId`. If a name doesn't resolve (a
  type was renamed/deleted in a way the old rename-sync didn't catch),
  create an `archived: true` placeholder `ExerciseTypeDef` for it so history
  still resolves cleanly — never drop the reference silently.
- New migration step: same for `Exercise.category` → resolve against
  `AnalyticsCategory.id`.
- New migration step: restructure every `Workout.exercises[]` (flat
  `Exercise[]`) into `ExerciseSlot[]`. Best-effort rules:
  - If `plannedDuration` exists (i.e. the workout already went through the
    3.11→3.12 migration), use it to build `prescribed`, and `duration` to
    build `logged`.
  - If `actualReps` exists, it becomes part of `logged`; `reps` becomes part
    of `prescribed`.
  - For `status === "planned"` workouts with no logged data yet: populate
    `prescribed` only, leave `logged` undefined.
  - For older `status === "completed"` workouts that predate the
    duration/reps split (no `plannedDuration`, no `actualReps`): set
    `prescribed = logged = <same values>`. This is an honest limitation —
    a plan that was never captured separately can't be reconstructed. Do
    not fabricate a different "prescribed" value.
  - Regenerate a fresh `id` for the `ExerciseSlot` only if the old
    `Exercise.id` collides with another slot's id in the same migration run
    (fixes the `duplicateWorkout` ID-collision bug below) — otherwise keep
    existing ids stable.
- New migration step: `dailyReadiness: DailyReadiness[]` → seed three
  built-in `MetricDef`s (`sleep-score`, `hrv`, `rhr`) and convert each
  `DailyReadiness` record into up to three `DailyMetricEntry` rows (skip
  fields that were `undefined`).
- New migration step: add `painLogs: []` (empty default) — purely additive,
  no data to migrate.
- Bump `DATA_EXPORT_VERSION` once per structural change above (follow the
  existing convention of granular version bumps, e.g. one per bullet, not
  one giant migration) and add a fixture test per bump, per Phase 0's
  pattern.
- Update `calculatePlannedLoad`/`calculateLoadFactor` call sites throughout
  `storage.ts` and `state.svelte.ts` to operate on `slot.prescribed` /
  `slot.logged` instead of the old flat `Exercise`.
- Fix `duplicateWorkout` (`state.svelte.ts`) to regenerate a new `id` for
  every `ExerciseSlot` when duplicating a workout, not just for the workout
  itself.
- **`src/data/defaults.json`'s `templates` must also convert to the new
  `typeId`/`prescribed` shape** (added during implementation - see
  PROGRESS.md 2026-09-16 "Phase 1 scope gap-fills"). This file isn't just
  seed content: `DEFAULT_TEMPLATES` (built from it) is live fallback data
  for fresh installs, "Reset to Default Library," and two *existing*
  historical migration steps (`2.3→2.4`'s "Ensure Deload is in templates"
  and `3.7→3.8`'s per-phase fallback fill). Those two steps reference the
  live `DEFAULT_TEMPLATES` constant as a fallback source for **old-shape**
  data - once `defaults.json` moves to the new shape, that reference would
  inject new-shape `ExerciseSlot`s mid-chain into what the rest of that
  historical step still assumes is a flat `Exercise[]`, corrupting the
  result (double-nested `prescribed`). Confirmed reachable, not
  theoretical: the real `backup-2.1.json` fixture is missing a `"Deload"`
  key and hits exactly this fallback. Fix: freeze the *current* (pre-this-
  change) old-shape `"Deload"` template content as an inline constant used
  only by that one historical step, decoupling it from the live
  `DEFAULT_TEMPLATES`/`defaults.json`. (The `3.7→3.8` step's own fallback
  for `Capacity`/`Strength`/`Performance`/`Taper` turns out to already be
  dead today - `defaults.json` has never had those post-rename key names,
  so it already resolves to `[]` before and after this change - so no fix
  needed there, just noted.)
- **`DailyReadiness`'s shape isn't declared anywhere in the currently
  committed `types.ts`** (it predates being typed - `dailyReadiness` is
  untyped `any[]`, and no committed UI reads or writes it today). Use
  `{ date: string; sleepScore?: number; hrv?: number; rhr?: number }` -
  confirmed via the stashed/deferred dashboard WIP's own (unmerged)
  `DailyReadiness` interface, which matches this plan's own `sleep-score`/
  `hrv`/`rhr` `MetricDef` ids. This is used only to confirm field-name
  shape for the migration, not to reuse any stashed code.

**Concrete scope — component changes:**
- `ExerciseForm.svelte`, `WorkoutForm.svelte`: read/write `typeId` instead
  of `type` name; read/write `slot.prescribed` when in "Planning" mode and
  `slot.logged` when in "Active Session" mode (`WorkoutForm.svelte:230`
  already distinguishes these two modes in the UI — wire that existing
  distinction to the two new fields instead of one shared object). When a
  workout transitions from `planned` to `completed` and `logged` is still
  empty for a slot, initialize `logged` as a copy of `prescribed` as the
  starting point for editing, rather than leaving it undefined.
- Anywhere `exercise.type` was rendered as a display string: resolve via
  `exerciseTypes.find(t => t.id === slot.typeId)?.name` (or an archived
  lookup if not found in the active list).
- `state.svelte.ts`, CSV export in particular: update column generation to
  resolve names via `typeId` lookup and to pull from `prescribed`/`logged`
  as appropriate for "planned" vs "actual" columns.

**Dependencies on earlier phases:** Phase 0 must be complete — this phase
produces the largest, highest-stakes migration in the whole plan, and must
run through the registry + fixture-test + auto-backup/invariant-check
machinery Phase 0 built, not the old untested if-chain.

**Risk level: High.** This is a structural migration touching every
workout and template exercise ever recorded. Data loss or silent corruption
here is the single worst outcome in this entire plan. Mitigations: Phase 0's
auto-backup/rollback, exhaustive fixture testing specifically for this
phase's migration steps (not just "nice to have" — required, see DoD below),
and the explicit best-effort rules above so behavior on ambiguous old data
is deterministic and documented rather than improvised at migration time.

**Definition of done:**
- `npm run test` passes, **including new fixture tests that specifically
  cover**: (a) a pre-3.12 completed workout with no `plannedDuration`, (b) a
  post-3.12 workout with `plannedDuration`/`actualReps` present, (c) a
  planned (not yet completed) workout, (d) an exercise whose type name no
  longer matches any current `ExerciseTypeDef` (tests the archived-
  placeholder fallback), (e) the full old-to-new roundtrip invariant check
  (workout/benchmark counts preserved, every slot has a resolvable
  `typeId`), (f) a dedicated fresh-install/reset-to-default-library test
  asserting `DEFAULT_TEMPLATES` (from `defaults.json`, no migration
  involved) already has valid `typeId`/`prescribed` shaped exercises
  resolving against `DEFAULT_EXERCISE_TYPES`, and (g) the frozen-`Deload`-
  fallback regression test described above (old data missing a `"Deload"`
  template key migrates to a valid, non-double-nested `ExerciseSlot`).
- `npm run check` passes.
- Manual test: export your real current backup, run it through the new
  migration chain, re-import, and manually spot-check several historical
  completed workouts still show correct duration/reps/sets values.
- Manual test: create a new planned workout, "complete" it while editing
  values to differ from the plan, confirm the plan values are still visible
  somewhere (e.g. in raw data / a temporary debug view is fine at this
  phase — the UI to actually *display* the diff is Phase 4's job) and were
  not overwritten.
- Git commit made.

**Assumptions / open questions:**
- `PainLog.bodyPart` — left as free text rather than a fixed vocabulary
  (e.g. `"Finger" | "Elbow" | "Shoulder" | ...`) for simplicity in this
  phase. If a fixed vocabulary is wanted for cleaner analytics grouping in
  Phase 4, that's a small additive change to make then, not a blocker now.
- The three seeded `MetricDef`s (`sleep-score`, `hrv`, `rhr`) use those
  exact ids — later phases (7, for health platform import) should treat
  these ids as fixed/well-known rather than re-inventing them.
- No new UI is built in this phase for `painLogs`, `metricDefs`, or
  `dailyMetrics` beyond what's needed to migrate `dailyReadiness` — entry
  UI for these comes in Phases 4 and 6. This phase is data-model-only by
  design, to keep it reviewable and testable in isolation.

---

## Phase 2 — State & storage decomposition

**Goal / why:** `state.svelte.ts` (438 lines) and `storage.ts` (1000+
lines, larger after Phase 1) are both doing too many unrelated things —
persistence, migration, and domain logic (e.g. `assignPhaseToWeek`
generates workouts from templates *inside* the storage layer). This phase
is a pure refactor with no schema or behavior change, done now so that
Phases 3–7 (which each add new domain concepts) have a clean place to add
code instead of growing these two files further.

**Concrete scope:**
- Split `src/lib/storage.ts` into:
  - `src/lib/storage/persistence.ts` — pure get/set of the raw DB blob
    (the `localforage`/`Capacitor Filesystem` adapters, `initDB`/`flushDB`),
    no domain knowledge.
  - `src/lib/storage/migrations/` — the Phase 0 registry, moved here as its
    own module, unit-tested independently of persistence.
  - `src/lib/storage/index.ts` — re-exports the public `storage` object for
    backward-compatible imports elsewhere in the app, now composed from the
    above.
  - Move `assignPhaseToWeek`'s "generate workouts from templates" logic out
    of storage and into a new `src/lib/planning/generateWorkoutsFromTemplate.ts`
    domain service — storage should only persist, not decide what a phase
    assignment implies.
- Split `src/lib/state.svelte.ts` into domain stores, each a small class or
  module using Svelte 5 runes, composed together:
  - `src/lib/stores/workoutStore.svelte.ts` — workout CRUD, load calc calls.
  - `src/lib/stores/planningStore.svelte.ts` — periodization, templates,
    phase assignment.
  - `src/lib/stores/catalogStore.svelte.ts` — exerciseTypes,
    analyticsCategories, benchmarkTypes (the archivable definition
    registries from Phase 1).
  - `src/lib/stores/benchmarkStore.svelte.ts`
  - `src/lib/stores/metricsStore.svelte.ts` — `metricDefs`, `dailyMetrics`,
    `painLogs` from Phase 1.
  - `src/lib/stores/uiStore.svelte.ts` — view/navigation, theme, dashboard
    settings, modal visibility.
  - `src/lib/stores/backupStore.svelte.ts` — import/export/CSV.
  - Keep a thin `src/lib/state.svelte.ts` facade re-exporting
    `trainingState` composed from the above **only if** many existing
    components import `trainingState` directly and rewriting every import
    site isn't worth doing in this phase — otherwise, prefer updating call
    sites to import the specific store they need.

**Dependencies on earlier phases:** Phase 1 must be complete — this phase
organizes storage/state around the Phase 1 entities (`ExerciseSlot`,
`MetricDef`, `PainLog`, archivable definitions), so doing this first would
mean redoing it.

**Risk level: Low.** No schema change, no migration, no change to what data
means — purely moving code between files/modules. The main risk is
introducing import cycles or missing a call site during the split; both are
caught by `npm run check` and manual smoke testing.

**Definition of done:**
- `npm run test` and `npm run check` both pass with no behavior change.
- Manual smoke test: run the dev server, exercise every view (plan, home,
  add workout, history, settings, analytics) and confirm nothing regressed.
- Git commit made.

**Assumptions / open questions:**
- Whether to keep a `trainingState` compatibility facade or do a full
  rewrite of every component's imports is left to the implementer's
  judgment based on how many call sites exist at the time — either is
  acceptable, the goal is just that the *domain logic* is decomposed, not
  necessarily every import statement in every component.

---

## Phase 3 — Modular phases & templates

**Goal / why:** `PhaseType` is a closed 7-value TypeScript union — adding or
renaming a training phase requires shipping code, not just data. This
blocks the periodization-science work in Phase 4 (which needs to represent
overlapping/concurrent blocks with arbitrary phase labels) and blocks the
"pre-built periodization template library" feature. This phase also gives
`Settings.svelte` (1084 lines) a long-overdue split, since the phase/
template editors it contains are being rewritten anyway.

**Concrete scope:**
- New type in `src/lib/types.ts`:
  ```ts
  interface PhaseDef {
    id: string;      // e.g. "phase-capacity" — stable, migrated from the old union
    name: string;
    color?: string;
    order?: number;  // for consistent display ordering
    archived?: boolean;
  }
  ```
  Fixed id mapping for the migration (use exactly these ids):
  `Capacity` → `phase-capacity`, `Strength` → `phase-strength`,
  `Power` → `phase-power`, `Power Endurance` → `phase-power-endurance`,
  `Performance` → `phase-performance`, `Taper` → `phase-taper`,
  `Deload` → `phase-deload`.
- `PeriodizationWeek.phase: PhaseType` → `PeriodizationWeek.phaseId: string`
  (migration uses the mapping above).
- Replace `Partial<Workout>` template shape with a dedicated type:
  ```ts
  interface WorkoutTemplate {
    id: string;
    name?: string;         // was `notes` on the old Partial<Workout>
    dayOfWeek?: DayOfWeek;
    exercises: ExerciseSlot[]; // `logged` always undefined for templates
  }
  ```
  `templates: Record<PhaseType, Partial<Workout>[]>` →
  `templates: Record<string, WorkoutTemplate[]>` keyed by `phaseId`. This
  removes the old conflation where a template technically allowed
  workout-only fields (`status`, `date`, `loadFactor`, fatigue) that never
  made sense on a template.
- Migration steps (in order): create the 7 built-in `PhaseDef`s; remap
  `PeriodizationWeek.phase` → `phaseId`; remap `templates` keys from phase
  names to `phaseId`s and convert each template's `Partial<Workout>` shape
  into `WorkoutTemplate` (drop any workout-only fields that leaked in;
  convert `exercises` into `ExerciseSlot[]` using the Phase 1 conversion
  rules, `prescribed`-only).
- New seed content: a small library of pre-built periodization template
  sets (e.g. a finger-strength block, a classic power/power-endurance
  cycle) added to `src/data/defaults.json` as selectable starter template
  sets, distinct from the user's own customized templates. Exact program
  content is a training-science content-writing task, not a schema change —
  flagged below.
- Split `Settings.svelte` into:
  - `src/components/settings/ExerciseTypeSettings.svelte`
  - `src/components/settings/PhaseSettings.svelte` (new — was implicit)
  - `src/components/settings/TemplateSettings.svelte`
  - `src/components/settings/BenchmarkTypeSettings.svelte`
  - `src/components/settings/AnalyticsCategorySettings.svelte`
  - `src/components/settings/BackupSettings.svelte`
  - `src/components/settings/PreferencesSettings.svelte` (theme, dashboard
    toggles)
  - `Settings.svelte` itself becomes a thin shell/tab router over these.

**Dependencies on earlier phases:** Phases 1 and 2 complete (`ExerciseSlot`,
archivable definitions, and the decomposed `catalogStore`/`planningStore`
this phase builds on).

**Risk level: Medium.** Real schema change (phase representation, template
shape) but a small, fully-enumerable mapping (only 7 built-in phases to
migrate) rather than an open-ended one like Phase 1's exercise restructure.

**Definition of done:**
- `npm run test` passes, including a migration fixture test asserting all 7
  legacy phase names map to the correct `phaseId`s and that templates keyed
  by old phase names are correctly rekeyed.
- `npm run check` passes.
- Manual test: open the app with existing data, confirm the training plan
  calendar still shows the correct phase for weeks that were already
  assigned one, and that assigning a new phase still generates workouts
  from the right template set.
- Git commit made.

**Assumptions / open questions:**
- **Content of the pre-built periodization template library is a product/
  training-science decision, not an engineering one** — this plan does not
  specify exact exercises, sets/reps, or progressions for the starter
  programs. Implementer should either stub this with 1 placeholder template
  set and flag it for the user to review, or ask the user for specific
  program content before writing it into `defaults.json`. Don't invent
  detailed training programs unprompted.

---

## Phase 4 — Periodization science: concurrent blocks, peaking calendar, load analytics

**Goal / why:** This is the core "professional training" feature work: the
current model allows exactly one phase per week, with no concept of
concurrent training emphases, competition peaking, or any analysis of the
load/readiness/fatigue data already being collected. This phase also
delivers the payoff for Phase 1's `prescribed`/`logged` split (adherence
analytics finally become possible) and for the `PainLog` entity (injury-vs-
load correlation).

**Concrete scope:**
- New types:
  ```ts
  interface TrainingBlock {
    id: string;
    name: string;
    phaseId: string;      // -> PhaseDef.id, primary focus of this block
    startWeekId: string;
    endWeekId: string;
    priority?: number;    // for overlapping blocks, which dominates template selection/display
    color?: string;
  }
  interface CompetitionEvent {
    id: string;
    name: string;
    date: string;         // ISO date
    priority: "A" | "B" | "C";
  }
  ```
  Add `blockId?: string` to `Workout` — set at creation time from whichever
  `TrainingBlock` covers the workout's `weekId` (if any), so block-level
  analytics are a direct filter instead of a date-range recompute per
  query.
- Migration: convert each existing `PeriodizationWeek` entry into a
  single-week `TrainingBlock` (`startWeekId === endWeekId === weekId`).
  Decide what happens to `PeriodizationWeek.customized` — see "Assumptions"
  below, this needs a product decision during implementation.
- New analytics module `src/lib/analytics/loadAnalytics.ts` (pure,
  independently testable functions):
  - Acute:chronic workload ratio (7-day rolling `loadFactor` / 28-day
    rolling `loadFactor`), with a standard ramp-rate spike flag (commonly
    >10% week-over-week increase — implementer should verify this threshold
    is reasonable rather than treating it as gospel; cite it in a comment).
  - Planned-vs-actual adherence: per workout and per week, diff
    `ExerciseSlot.prescribed` vs `.logged` (completion %, load variance) —
    this is the feature the user specifically asked for, now unblocked by
    Phase 1.
  - Recovery/rest-day warnings: flag when consecutive training days or
    rising load trend + declining `DailyMetricEntry` readiness values
    (sleep score, HRV, RHR from Phase 1's metric system) suggest recovery
    is being skipped.
  - Injury/pain correlation: correlate `PainLog` entries against load
    spikes from the ACWR calculation above.
- New UI:
  - Pain logging entry point (e.g. a small form in the workout completion
    flow or a dedicated quick-add, writing to `PainLog` via
    `metricsStore`).
  - Competition/peaking calendar view — countdown to the next A-priority
    `CompetitionEvent`, surfaced on the dashboard.
  - Analytics panels in `Analytics.svelte` (split per Phase 2/3's component
    conventions) for: adherence, ACWR/ramp-rate, recovery warnings,
    injury-vs-load correlation.
  - `TrainingPlan.svelte` calendar updated to render overlapping blocks
    (extract the calendar grid/DnD logic into a `WeekCalendar.svelte`
    presentational component as part of this work, since the rendering
    logic is growing regardless).

**Dependencies on earlier phases:** Phases 1–3 complete. This phase
specifically depends on: `ExerciseSlot.prescribed`/`.logged` (Phase 1),
`MetricDef`/`DailyMetricEntry`/`PainLog` (Phase 1), `PhaseDef` (Phase 3),
and the decomposed `planningStore`/`metricsStore` (Phase 2).

**Risk level: Medium–High.** New entities and a migration
(`PeriodizationWeek` → `TrainingBlock`), plus a genuine product-behavior
ambiguity (see below) that affects how "protect my manual edits" behaves
once blocks can overlap. Not a data-loss risk on the scale of Phase 1 (this
is additive/restructuring existing periodization data, not exercise
history), but real complexity in the analytics correctness (ACWR-style
calculations are easy to get subtly wrong) and in the block-overlap UX.

**Definition of done:**
- `npm run test` passes, including: the `PeriodizationWeek` → `TrainingBlock`
  migration fixture test, and unit tests for every function in
  `loadAnalytics.ts` with hand-computed expected values (not just "doesn't
  throw" — these numbers need to be actually correct, since they're the
  basis for training decisions).
- `npm run check` passes.
- Manual test: assign overlapping blocks to the same week range, confirm
  the calendar renders both, confirm workout generation from templates
  still behaves sensibly (see assumption below).
- Manual test: complete a workout with logged values different from
  prescribed, confirm the new adherence view reflects the difference
  correctly.
- Git commit made.

**Assumptions / open questions — flagging explicitly, needs a product
decision at implementation time:**
- **What "customized" means once blocks can overlap.** Today,
  `PeriodizationWeek.customized` is a per-week flag meaning "the user
  manually edited this week's auto-generated workouts, don't regenerate
  them if the phase is reassigned." Blocks are date-ranged and can overlap,
  so this flag doesn't map cleanly onto a block. **Recommended default**:
  keep a separate, lightweight `WeekOverride { weekId: string; customized: boolean }[]`
  table independent of `TrainingBlock` definitions, so "has this week been
  manually edited" stays a per-week concern while "what training emphasis
  covers this week" becomes a per-block concern. Implement this default,
  but flag it to the user for confirmation rather than treating it as
  final — this is a real UX decision (what exactly triggers "don't
  overwrite my edits" protection when two overlapping blocks both generate
  template workouts for the same week) that's easier to validate by using
  the feature than by speccing it further in writing.
- The exact ramp-rate spike threshold (10% week-over-week is a common
  sports-science rule of thumb, not a fixed constant from this codebase) —
  implementer should treat it as a tunable default, not a hardcoded truth.

---

## Phase 5 — AI import/export pipeline

**Goal / why:** `AIPromptModal.svelte` already generates copy/paste prompts
for "Generate Plan" and "Analyze Past," but there is no import path back —
the user has to manually retype whatever the AI suggests. This phase closes
that loop: a context-only export mode for free-form Q&A, a strict JSON
contract for AI-generated plans, and a validated import pipeline with a
preview/diff before anything is written to real data.

**Concrete scope:**
- New file `src/lib/ai/schema.ts`: hand-rolled runtime validators (no new
  dependency — keep this lightweight; a full schema library like `zod` is a
  reasonable alternative if the implementer prefers it, but isn't required)
  for two JSON contracts:
  - `AIPlanOutput`: week-by-week phase/block assignments + workouts, each
    exercise referencing exercise types **by name** (the AI won't know your
    internal `typeId`s) — the importer resolves names to `typeId`s, and any
    unresolved name is surfaced to the user to either map to an existing
    type or create a new one. Never silently invent a new exercise type
    without the user seeing it happen.
  - `AIWorkoutLogOutput`: a single/multi workout log for the "paste free-
    text training notes, get structured exercises" flow, same
    name-resolution rule.
- Update `AIPromptModal.svelte`:
  - Add a third mode/tab: "Context Only" — exports the same condensed
    training profile as today's modes but with **no embedded prompt/
    instructions**, for pasting into any LLM to ask free-form questions.
  - Update the "Generate Plan" prompt text to include the `AIPlanOutput`
    JSON schema/shape inline and explicitly instruct the AI to return
    **only** JSON matching it (replacing today's "JSON or clear text
    format" instruction, which is too loose to validate against).
- New component `src/components/plan/AIImportModal.svelte`: paste JSON →
  validate against `schema.ts` → show a preview/diff (which weeks/workouts
  will be added or changed, which exercise-type names need mapping) →
  confirm → commit via the normal `planningStore`/`workoutStore` services
  from Phase 2 (never a special-cased write path that bypasses the domain
  services other flows use).
- Reuse the same paste-validate-preview-commit pipeline for AI workout-log
  parsing, targeting a single workout's exercises instead of a whole plan.

**Dependencies on earlier phases:** Phases 1–4 complete — the import
pipeline writes `ExerciseSlot`s (Phase 1) tagged with `blockId`/`phaseId`
(Phase 3/4) via the domain services from Phase 2, so all of those need to
exist and be stable first.

**Risk level: Low–Medium.** No new persisted schema beyond what Phase 1–4
already defined — this phase is new UI/validation code, not a data-model
change. The risk is scoped and mitigated by construction: untrusted LLM
JSON never writes directly to storage, it always goes through validation +
a user-reviewed preview + the same domain services every other write path
uses.

**Definition of done:**
- `npm run test` passes, including unit tests for the validators in
  `schema.ts` against both well-formed and deliberately malformed/
  adversarial JSON (LLMs don't reliably follow strict JSON contracts —
  test missing fields, wrong types, extra fields, and unresolvable
  exercise-type names).
- `npm run check` passes.
- Manual test: run an actual "Generate Plan" prompt through a real LLM,
  paste the result back into the new import flow, confirm the preview
  accurately reflects what will change, confirm nothing is written until
  you confirm, confirm an unresolvable exercise-type name is surfaced
  rather than silently dropped or invented.
- Git commit made.

**Assumptions / open questions:**
- Whether to use a schema-validation library (`zod`) vs hand-rolled
  validators is left to the implementer; hand-rolled is the default to
  avoid a new dependency, but this is a low-stakes choice either way.

---

## Phase 6 — Extended reporting & logs

**Goal / why:** Lower-risk, additive features that build on the analytics
and data-model work from earlier phases: a bodyweight log, a richer PDF
report for sharing with a coach, and an optional outdoor-ascent import.

**Concrete scope:**
- Bodyweight tracking: seed a `bodyweight` `MetricDef` (Phase 1's generic
  metric system already supports this — no new entity needed). New UI: a
  simple entry form + time-series chart, likely in
  `src/components/settings/` or a new `src/components/health/` folder.
  Wire `bodyweightPercent`-based exercise calculations (already present in
  `types.ts`) to optionally reference the latest logged bodyweight instead
  of requiring manual entry each time, if convenient.
- Extend `PDFExportModal.svelte` to add report sections built on Phase 4's
  `loadAnalytics.ts`: adherence summary, ACWR/load trend, injury/pain
  summary — in addition to whatever it already exports.
- Optional: 8a.nu outdoor-ascent CSV import.
  - New entity: `OutdoorAscent { id: string; date: string; name?: string; grade: string; style?: string; notes?: string; }`
    added to `TrainingData` (additive migration, empty array default).
  - New file `src/lib/importers/outdoorAscentCsvImport.ts` parsing an
    exported 8a.nu CSV into `OutdoorAscent[]`.
  - This is explicitly a lightweight log for correlating outdoor
    performance against training blocks in analytics — **not** a pyramid-
    builder or gym-grade tool (see locked-in scope at the top of this
    file).

**Dependencies on earlier phases:** Phase 1 (metric system, migration
pattern) and Phase 4 (`loadAnalytics.ts`, for the PDF report sections).

**Risk level: Low.** All additive — new optional entity, new UI, no
restructuring of existing data.

**Definition of done:**
- `npm run test` and `npm run check` pass, including a migration fixture
  test for the additive `OutdoorAscent` field and a parser test for the
  8a.nu CSV importer (see assumption below).
- Manual test: log a bodyweight entry, confirm it appears in the chart and
  is available to exercises using `bodyweightPercent`.
- Manual test: generate a PDF report, confirm the new sections render
  sensibly with real data.
- Git commit made.

**Assumptions / open questions:**
- **8a.nu's exact CSV column format is not something to guess/hallucinate.**
  Before implementing `outdoorAscentCsvImport.ts`, get an actual sample
  export from 8a.nu (the user has an account and outdoor sends there per
  earlier discussion) and write the parser against real column names, not
  assumed ones. Treat this as a required research step within the phase,
  not an implementation detail to invent.

---

## Phase 7 — Mobile integration: local notifications

**Goal / why:** A local reminder to log fatigue/RPE after a session, so
readiness/load data (Phase 1/4) doesn't depend on the user remembering to
open the app.

**Descoped 2026-09-17 (user decision, see `PROGRESS.md`):** this phase
originally also included importing readiness data (sleep, HRV, resting HR)
from Apple Health / Health Connect, framed as an indirect way to cover
Garmin data (since Garmin Connect syncs into both platforms). The user's
phone does not support syncing Garmin into Health Connect, so that framing
doesn't hold for their actual device, and the feature is dropped rather
than built speculatively. A maintenance-status check was still done before
dropping it (per this plan's own instruction not to skip that check): the
most current unified candidate, `capacitor-health` (mley/capacitor-health,
npm, actively maintained — v8.2.0, tracks Capacitor's major version,
published via CI 4 weeks prior to this check), was inspected and found to
**not** support sleep score, HRV, or resting heart rate at all — only
steps, active calories, mindfulness minutes, body composition, and
workout-embedded heart-rate samples. So even absent the Garmin constraint,
this would have needed a different/less-maintained plugin (e.g. the
iOS-only, not-updated-since-2025 `@perfood/capacitor-healthkit`, or the
Capacitor-5-targeted, not-updated-since-2024 `capacitor-health-connect`) to
cover the three metrics this plan actually wants. Not pursued further.
**If this is revisited later**, treat plugin selection as unresolved again
— re-run the maintenance-status check rather than reusing this note, since
findings will likely be stale by then.

**Concrete scope:**
- Local push notifications: add `@capacitor/local-notifications` (official
  first-party Capacitor plugin). Schedule a notification when a planned
  workout's `startTime` has likely passed without the workout being marked
  completed, prompting the user to log fatigue. Needs iOS/Android
  permission-request UX (first-run prompt, respect denial gracefully).

**Dependencies on earlier phases:** None structurally (this phase no
longer writes into the `MetricDef`/`DailyMetricEntry` system now that
health import is dropped) — sequenced after Phase 1/2 in this plan only
because it was originally scoped alongside health import.

**Risk level: Low–Medium.** Not a data-migration risk — no schema change
at all now that health import is dropped. Remaining risk is native
permission-flow/scheduling correctness, which can't be fully validated
outside a real device.

**Definition of done:**
- `npm run test` and `npm run check` both pass; native-specific code is
  guarded appropriately (mirroring the existing `Capacitor.isNativePlatform()`
  pattern already used in `storage.ts`/`storage/persistence.ts`) so the web
  build isn't broken by the native-only plugin.
- Manual test on an actual iOS and/or Android device (not just the browser
  dev server, since this phase is inherently native): notification fires
  as expected when a planned workout's start time passes uncompleted,
  denying permissions doesn't crash the app. (Per this session's working
  agreement, this manual device test is left to the user — not attempted
  via browser automation, since it needs a real native runtime anyway.)
- Git commit made.

**Assumptions / open questions:**
- None remaining — the one open question this phase had (which health
  plugin to use) is moot now that health import is dropped.

---

## Summary table

| Phase | Title | Risk | Depends on |
|---|---|---|---|
| Prereq | Baseline migration test suite | Low | — |
| 0 | Migration safety net | Low–Medium | Prereq |
| 1 | Core data model: IDs, archiving, prescribed/logged | **High** | 0 |
| 2 | State & storage decomposition | Low | 1 |
| 3 | Modular phases & templates | Medium | 1, 2 |
| 4 | Periodization science & load analytics | Medium–High | 1, 2, 3 |
| 5 | AI import/export pipeline | Low–Medium | 1, 2, 3, 4 |
| 6 | Extended reporting & logs | Low | 1, 4 |
| 7 | Mobile: local notifications (health import descoped, see Phase 7) | Low–Medium | — |
