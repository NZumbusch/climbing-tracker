# Progress Log

Running log of implementation notes, findings, and decisions made *during*
work on `PLAN.md`. `PLAN.md` is the plan decided before implementation
started; this file is what actually happened, in order, as it happens.

Append new entries at the bottom. Don't rewrite or delete past entries —
if a decision changes later, add a new entry saying so and referencing the
old one, don't edit history. Each entry: date, phase/step it belongs to,
what happened.

---

## 2026-09-16 — Prerequisite step scoped, before any code written

While scoping the "Baseline migration test suite" prerequisite (see
`PLAN.md`), a real historical backup (`old_backup.json`, repo root,
`exportVersion: "2.1"`, 16 workouts, 5 exercise types) was inspected by
running it conceptually through the current migration chain in
`src/lib/storage.ts`. This surfaced two confirmed bugs in shipped migration
code, not hypothetical cases:

1. **Data loss:** the `3.8 → 3.9` migration step unconditionally
   `delete e.variant`s, assuming `variant` only ever appeared on
   `"Boulder Intervals"`-type exercises. `old_backup.json` has 5
   `"Non-Free Bouldering"`-type exercises (a type the Boulder-Intervals
   conversion never touches) with a `variant` value that gets silently
   dropped today.
2. **Schema drift, no data lost yet:** `old_backup.json`'s `exerciseTypes`
   declare parameters `"boulderingStyle"` and `"hangboardTimes"`, neither
   of which exists in the current `ParameterBlock` union
   (`"climbingStyle"`/`"timeOn"` are the current names). No logged instance
   currently has a value set for either (checked directly against the
   file), so nothing is lost yet, but those parameter inputs would silently
   vanish from the UI on import today.

Also found (not a bug, a gap): `old_backup.json` uses phase names
`"Maintenance"` and `"Endurance"`, which don't exist in the current
7-phase list and have no migration mapping.

**Decisions made (asked of the user, approved 2026-09-16):**
- Fix both confirmed bugs now, as part of the Prerequisite step, rather
  than deferring to Phase 1. Both are small, additive, data-preserving
  fixes (stop deleting a value; add two rename steps), not structural
  changes, so there's no reason to wait.
- Legacy phase mapping: `"Maintenance"` → `"Deload"`, `"Endurance"` →
  `"Power Endurance"`.

Full detail of the fixes (which migration steps, exact scope, test list)
is written into `PLAN.md`'s Prerequisite section — not duplicated here.
No code has been written yet as of this entry; `PLAN.md` was updated to
reflect this scope, and implementation has not started.

**Still to do when the Prerequisite step is actually implemented:** before
adding `export` to `runDataMigrations` in `storage.ts`, re-verify (don't
assume from this note) that the function only depends on its `data`
parameter and module-level constants, not on `_dbState` or other
module-private state, and that neither call site's behavior
(`runStartupMigrations`'s early-return guard, `importData`'s lack of one)
changes as a result of adding the export keyword. Log that verification
here, in its own dated entry, when it's done — this note is the
instruction to do it, not the record that it happened.

---

## 2026-09-16 — Prerequisite: `export` safety check on `runDataMigrations`

Re-read `runDataMigrations` in full (`src/lib/storage.ts`, current lines
~111-664) before adding `export` to its declaration, per the instruction
above. Confirmed:

- **No closure over `_dbState` or other module-private state.** The
  function body only ever references its own `data: any` parameter (and
  values derived from it, e.g. `importVersion`). It never reads or writes
  `_dbState`, `initDB`, or `flushDB`. The only free variables it references
  are module-level imports: `DEFAULT_BENCHMARK_TYPES` (pre-2.1 step),
  `DEFAULT_TEMPLATES` (3.7→3.8 step, filling in missing phase template
  arrays), `DEFAULT_ANALYTICS_CATEGORIES` (2.9→3.0 step, seeding the
  category list), `generateId` (2.9→3.0 step, assigning ids to newly
  discovered categories), and `calculatePlannedLoad` (several steps,
  recomputing `plannedLoad`). `DEFAULT_EXERCISE_TYPES` is imported into the
  module but is **not** referenced inside `runDataMigrations` itself (only
  used by `initDB`) — noted since the Prerequisite section of `PLAN.md`
  listed it as a constant the function "reads"; it doesn't, but this
  doesn't change the safety conclusion since it's still just a module-level
  constant, not mutable state.
- **Call site 1 — `storage.runStartupMigrations()`:** has an early-return
  guard (`if (currentVersion === DATA_EXPORT_VERSION) return;`) *before*
  calling `runDataMigrations(_dbState)`. Adding `export` to the function
  declaration doesn't touch this call site's code at all — the guard is
  unchanged, and passing `_dbState` still passes the same live object by
  reference (mutated in place), same as today.
- **Call site 2 — `storage.importData()`:** calls `runDataMigrations(data)`
  unconditionally (no version guard — it always runs migrations on
  imported data regardless of its version, including already-current
  data, which is a no-op given the if-chain's structure). Adding `export`
  doesn't change this call site either.

Conclusion: adding `export` to the `function runDataMigrations(data: any): void`
declaration is a pure visibility change with no behavioral effect on either
caller. Proceeding with the export change, the two migration-chain bugfixes,
and the two new migration steps as scoped in `PLAN.md`.

---

## 2026-09-16 — Prerequisite step implemented

**Changes made** (all in `src/lib/storage.ts` unless noted):
- Exported `runDataMigrations` (see safety-check entry above).
- Amended the `3.8 → 3.9` step: before `delete e.variant`, if a value is
  still present it's folded into `e.notes` as `[Variant: X]` (appended with
  a leading space if notes already has content, otherwise notes is set to
  just the tag). This is unconditional on any exercise carrying `variant`
  at that point in the chain, not gated to a specific `type` — matches the
  plan's framing that the original bug was an unwarranted assumption about
  which types carry `variant`.
- Added migration step `3.12 → 3.13`: renames `boulderingStyle` →
  `climbingStyle` and `hangboardTimes` → `timeOn` across
  `exerciseTypes[].parameters`, `.possibleParameters`, and
  `activeParameters` on workout/template exercises (de-duping after
  rename, matching the existing pattern used by the `3.8→3.9` step for
  similar array renames).
- Added migration step `3.13 → 3.14`: renames periodization `phase` values
  `Maintenance` → `Deload`, `Endurance` → `Power Endurance`, and rekeys
  `templates` accordingly. When the target key already has templates, the
  legacy array is concatenated onto the end rather than overwriting.
- Bumped `DATA_EXPORT_VERSION` (`src/lib/constants.ts`) to `"3.14"`.
- Added `vitest` + `@types/node` as devDependencies, `"test": "vitest run"`
  script, `vitest.config.ts`, and `"node"` to `tsconfig.json`'s `types`
  array (needed for the test file's `fs`/`path`/`url` imports under
  `svelte-check`, which type-checks the whole `src/` tree including
  `*.test.ts` files).
- Fixtures: `src/lib/__fixtures__/backup-2.1.json` (copy of
  `old_backup.json`). All other fixtures (hand-built 1.0/2.0-era, and the
  targeted boundary cases) are constructed inline in
  `src/lib/storage.migrations.test.ts` rather than as separate files, per
  the plan's "safe to hand-construct" allowance for low-complexity cases.
- All 21 tests in `src/lib/storage.migrations.test.ts` pass. Coverage:
  primary `old_backup.json` fixture (6 assertions: no-throw, 16 workouts
  preserved, ids stringified, all 5 variant values preserved in notes with
  none left as raw `variant`, parameter rename with no leftovers, phase
  rename with no leftover template keys), hand-built 1.0/2.0 fixture (2
  cases: no version at all, and `"2.0"`), targeted boundary tests for
  `2.1→2.2`, `2.8→2.9`, `3.4→3.5` (both interval-split branches), the
  amended `3.8→3.9` (fresh notes, appended-to-existing notes, and the
  already-migrated no-op case), the new `3.12→3.13`, the new `3.13→3.14`
  (both the no-collision and colliding-target-key/concatenation cases),
  a full-chain minimal-1.0-fixture test, a no-op-at-current-version test,
  and a round-trip (JSON stringify/parse + migrate) test.

**Fixture finding, out of scope, not fixed:** running `old_backup.json`
(`exportVersion: "2.1"`) through the chain leaves `data.benchmarks` and
`data.benchmarkTypes` as `undefined` rather than defaulted arrays. Cause:
the pre-2.1 step that seeds those defaults only fires when
`importVersion` is falsy, `"1.0"`, or `"2.0"` — data that already reports
`"2.1"` skips it, and no later step ever defaults `benchmarks`. This is a
**pre-existing 4th latent issue**, distinct from the 3 confirmed/scoped in
this step. It isn't currently a real-world data-loss risk: `importData`'s
caller only overwrites `_dbState.benchmarks` `if (data.benchmarks)` is
truthy, so `undefined` just means the existing local benchmarks are left
alone rather than being clobbered by an assumed-empty array. Not fixed
here since it wasn't part of the 3 issues the user approved fixing in this
step's scope (see the first entry above) — flagging for a Phase 0/1
conversation rather than silently expanding scope.

**Unrelated pre-existing type errors fixed to unblock `npm run check`:**
`src/components/history/WorkoutShareImage.svelte` (untracked, pre-existing
before this session, wired into `History.svelte`) had two implicit-`any`
errors on a `.reduce` callback, unrelated to migrations. Added explicit
`(acc: number, e: any)` parameter types — a type-annotation-only change,
no logic touched. Did not touch the two remaining `Dashboard.svelte` a11y
*warnings* (also pre-existing/untracked) since `svelte-check` reports
those as warnings, not errors, and fixing them is unrelated UI work outside
this step's scope.

**Verification performed:**
- `npm run test` → 21/21 pass.
- `npm run check` → 0 errors, 2 pre-existing unrelated a11y warnings.
- `npx vite build` → production build succeeds (sanity check that nothing
  is fundamentally broken app-wide).
- **Manual in-app verification was not performed** — this session has no
  display/browser available (headless CLI environment), so the plan's
  "Manual check" bullet (import `old_backup.json` in the actual running
  app, visually confirm notes/parameters/phase labels) could not be done
  as written. In its place: the fixture test suite runs the *actual*
  `runDataMigrations` function (the same code path `storage.importData`
  calls) against the *actual* `old_backup.json` file and asserts, at the
  data layer, exactly the three things the manual check asks for (variant
  preserved in notes, `climbingStyle`/`timeOn` present on the renamed
  types, `Deload`/`Power Endurance` phases with no leftover legacy keys).
  This is real coverage of the same code path, just not a visual/UI
  confirmation. Flagging this gap explicitly rather than claiming the
  manual step was done.

**Commit:** made as its own commit, separate from any later Phase 0 work,
per the plan's recommendation.

---

## 2026-09-16 — Pre-Phase-0: stashed unreviewed working-tree WIP

Before starting Phase 0, `git status` showed a large uncommitted diff
sitting in the working tree (15 modified files + 3 untracked: `old_backup.json`,
`src/components/dashboard/`, `src/components/workout/TimerWidget.svelte`).
Inspected file-by-file (via `git diff`, not applied) rather than assumed
away, since Phase 0 needs a clean baseline and this diff was substantial
enough to risk contaminating Phase 0's commit if left in place.

**Finding:** the diff is two things tangled together in the same files,
not one:

1. **Schema-prep work that overlaps Phase 0/1's own scope** — `types.ts`
   changes (merge `boulderingGrades`/`routeGrades` → `grades`, drop
   `variant` param, add `arms` fatigue axis + `plannedDuration` +
   `actualReps`, rename `PhaseType` values `Work Capacity`→`Capacity`,
   `Max Strength`→`Strength`, `Performance / Taper` split into
   `Performance`+`Taper`, rework `calculateLoadFactor`/`calculatePlannedLoad`
   to a 4-axis/single-arg-object signature) plus the matching call-site
   updates in `defaults.json`, `AIPromptModal.svelte`, `FatigueModal.svelte`,
   and parts of `TrainingPlan.svelte`/`ExerciseForm.svelte`/`state.svelte.ts`.
   This matches shapes the **already-committed** `storage.ts` migration
   chain (steps 3.1→3.9, 3.7→3.8, 3.10→3.12) already produces at runtime
   but that `types.ts` never caught up to declare — and matches PLAN.md's
   own stated assumption (Context section, Phase 1 code block) that `arms`
   is already a fixed fourth fatigue axis going into Phase 1.
2. **Unrelated, unreviewed feature work**, not described anywhere in
   PLAN.md: a new dashboard/home view (`src/components/dashboard/Dashboard.svelte`,
   untracked — daily biometric entry, HRV baseline, ACWR sparklines,
   readiness scoring, wired into `App.svelte`'s new `'home'` view) built on
   top of the *old* `DailyReadiness` shape that Phase 1 is about to delete
   in favor of `MetricDef`/`DailyMetricEntry`; a workout timer widget
   (`TimerWidget.svelte`, untracked); drag-and-drop day-of-week scheduling
   in `TrainingPlan.svelte` (`svelte-dnd-action`); a "log actual reps per
   set" + "similar past sets" lookup UI in `ExerciseForm.svelte`; a
   history "Share" button + exercise-type filter in `History.svelte`;
   settings UI polish and category/benchmark-type rename propagation in
   `Settings.svelte`; a large `Analytics.svelte` diff (179+/42-, presumably
   radar-chart/ACWR display changes, not read in full); a new
   "Sports Science Engine" doc section in `README.md` describing the
   dashboard feature; and unrelated app-config tweaks in
   `capacitor.config.json`/`vite.config.js` (display name, deploy base
   path).

   One line in the `state.svelte.ts` portion looked like leftover/unfinished
   debugging code rather than finished work:
   `this.dailyReadiness = arguments[0]?.[7] || await storage.getDailyReadiness();`
   inside `refresh()` — using `arguments[0]` against what should be a
   destructured `Promise.all` result. Flagged, not fixed, since the whole
   diff is being deferred, not merged.

   Because (1) and (2) share files (`ExerciseForm.svelte`, `state.svelte.ts`,
   `TrainingPlan.svelte`), they couldn't be cleanly separated with a
   per-file stash — would need per-hunk surgery to extract just the
   schema-prep parts.

**Decision (user, 2026-09-16):** stash the entire diff as-is (`git stash -u`,
covering both tracked and untracked files) rather than cherry-pick or
reuse any part of it. Commit: `63395c3db3015a9b7e37ffacd50259b28b7f4860`
(`stash@{0}` at time of stashing — message: "Unreviewed pre-refactor WIP:
schema-prep tangled with dashboard/timer/features (deferred, see
PROGRESS.md)"). This is a deliberate deferral, not a discard: the stash is
recoverable (`git stash list` / `git stash show -p stash@{0}`) and is
intended to be revisited **after Phase 1 lands** — at that point the
schema-prep portions will either already be superseded by Phase 1's own
(properly migrated + tested) equivalent, or can be diffed against Phase
1's result to see what's left to cherry-pick from the feature-work portion.
Phase 0 proceeds from a clean tree; any `types.ts` changes Phase 0/1 need
are being written fresh as part of those phases' own scope, not copied
from this stash.

---

## 2026-09-16 — Pre-Phase-0: fixed a pre-existing type/schema drift bug (predates this plan)

While confirming Phase 0's `npm run check` DoD on the now-clean tree,
found 10 `svelte-check` errors. Verified (by reverting the in-progress
Phase 0 `storage.ts` refactor and re-running check) that **none of these
are caused by Phase 0's registry extraction** — same 10 errors, same
logical spots, at the pre-Phase-0 committed state. Also confirmed they
exist on `main` (`4486826`, the exact commit this branch forked from), so
this predates the whole refactor plan and has been sitting unnoticed on
the public release branch. It was invisible during the Prerequisite step
only because the stashed WIP diff (see entry above) happened to patch
exactly these gaps in `types.ts` while it sat uncommitted.

**Root cause:** already-committed code in `storage.ts`/`constants.ts`
assumed a newer schema than `types.ts` declared:
- `calculatePlannedLoad` was called with a single `Exercise`-like object at
  **7 real call sites** (`storage.ts`: 4 inside the migration chain, 1 in
  `applyTemplate`; `state.svelte.ts`: 2), but its committed signature was
  `calculatePlannedLoad(duration, plannedIntensity)` — two required
  numbers. At runtime this passed the whole object as `duration`, so
  `Number(duration)` → `NaN`, meaning **every one of those 7 call sites was
  already producing `NaN` planned-load values in production**, not just a
  type error.
- `constants.ts`'s `PARAMETER_LABELS` had a `grades` key with no matching
  `ParameterBlock` member (`boulderingGrades`/`routeGrades` existed
  instead).
- `storage.ts`'s committed `3.7→3.8` migration step writes phase values
  `"Capacity"`/`"Strength"`/`"Performance"`/`"Taper"`, but `PhaseType`
  only had the old 6 values — so a user whose data has already run this
  migration step would render with no color band in `TrainingPlan.svelte`
  (`phaseColors[week.phase]` → `undefined` for those keys), a second latent
  UI bug found while fixing this.

**Fix (kept strictly minimal, no schema rework — that stays Phase 1's job,
decided with the user 2026-09-16):**
- `calculatePlannedLoad` (`types.ts`) now takes the exercise object itself
  (`{ duration?: number; plannedLoad?: number }`) instead of two positional
  numbers — matching what every real call site already passed. Same
  formula, same defaults (60/5), same rounding; only the parameter shape
  changed. Updated the 2 call sites in `state.svelte.ts` that were using
  the old two-arg form (the other 5, in `storage.ts`, already called it
  the new way — that's what exposed the bug).
- Added `"grades"` to `ParameterBlock` (`types.ts`) alongside the existing
  `"boulderingGrades"`/`"routeGrades"`/`"variant"` — not replacing them,
  since the currently-committed `ExerciseForm.svelte` still reads/writes
  the old names. Filled in the 3 resulting missing keys
  (`boulderingGrades`, `routeGrades`, `variant`) in `PARAMETER_LABELS`
  (`constants.ts`) — `Record<ParameterBlock, string>` requires every
  member present, so adding `"grades"` without also backfilling those 3
  would just trade one compile error for three.
- Added `"Capacity"`, `"Strength"`, `"Performance"`, `"Taper"` to
  `PhaseType` (`types.ts`) alongside the existing 6 — same reasoning
  (existing UI, e.g. `TrainingPlan.svelte`'s phase-picker, still keys off
  the old names). Filled in colors for the 4 new keys in
  `TrainingPlan.svelte`'s `phaseColors` map (reusing the equivalent old
  phase's color for `Capacity`/`Strength`/`Performance`; `Taper` didn't
  have a prior equivalent — assigned `bg-cyan-500`, a starting-point color
  choice, not a considered design decision). Deliberately left the
  `phases` picker array (`TrainingPlan.svelte`) and `Settings.svelte`'s
  phase list untouched — arrays aren't exhaustiveness-checked by
  `Record<PhaseType,...>`, so this was not required to make `check` pass,
  and touching the phase-picker UI itself is out of this fix's scope.
- Added `src/lib/types.test.ts`: a regression test that calls
  `calculatePlannedLoad` the way the real call sites do (single object
  arg) and asserts the result isn't `NaN`, plus tests for the documented
  formula/defaults and (per Phase 0's own DoD, see PLAN.md) tests for
  `calculateLoadFactor`.

**Verification:** `npm run check` → 0 errors (was 10, all pre-existing).
`npm run test` → 28/28 pass (21 prior + 7 new in `types.test.ts`).

**Explicitly not done here** (deferred to Phase 1, per PLAN.md's own
framing and the user's direction to keep this fix minimal): reconciling
`ExerciseForm.svelte`/`Settings.svelte`/`defaults.json` to use the new
`grades`/`Capacity`-style names instead of the old ones (that's the
ID-reference/schema work Phase 1 already owns); removing the now-dead old
`ParameterBlock`/`PhaseType` members once nothing references them; giving
`Taper` a properly chosen color instead of the placeholder above.

Committed separately from Phase 0's migration-registry refactor, since
this bug predates and is independent of Phase 0's own scope.

---

## 2026-09-16 — Phase 0: migration safety net

**Changes made** (`src/lib/storage.ts` unless noted):
- Extracted `runDataMigrations`'s if-chain (24 historical steps, including
  the Prerequisite step's 2 new ones and its `3.8→3.9` amendment) into an
  ordered `MigrationStep[]` registry (`{ from, to, describe, migrate }`),
  matching `PLAN.md`'s Phase 0 spec. Each step's `migrate` body is the
  original `if` block's contents, extracted verbatim - no migration logic
  was rewritten. One deliberate mechanical decomposition, noted inline and
  here for transparency: the original pre-2.1 step was a single `if` with
  a compound condition (missing / `"1.0"` / `"2.0"` all → one action); since
  a registry step has exactly one `from`, and `runDataMigrations`'s initial
  `version = data.exportVersion || "1.0"` already folds "missing" into
  `"1.0"`, this became two registry entries (`from: "1.0"` and
  `from: "2.0"`) sharing one `migrate` function reference - same action,
  same two remaining input states, not a behavior change.
- `runDataMigrations` now walks `MIGRATIONS` in a single loop (advance
  `version` on each match, `continue` past non-matches) instead of a chain
  of hand-written `if (importVersion === "X.Y")` checks. Confirmed
  behavior-preserving: all 21 Prerequisite-step fixture tests pass
  unchanged (same assertions, same fixtures) against the new
  implementation - see verification below.
- Added `assertMigrationInvariants(before, after)` (exported for direct
  testing, same reasoning as `runDataMigrations`'s existing export): checks
  workout count preserved, benchmark count preserved, and every
  (pre-Phase-1, still name-based) `Exercise.type` resolves against the
  migrated `exerciseTypes` list. Throws one `Error` listing every problem
  found (not just the first) if any check fails.
- Added `writeMigrationBackup(fromVersion, data)`: writes a pre-migration
  snapshot before `runStartupMigrations` mutates `_dbState` - a single
  fixed localforage key (`backup_pre_migration`) on web, a single fixed
  sibling file (`boulder_tracker_db.backup.json`) on native, both always
  overwritten so exactly one backup exists at a time (per PLAN.md's "keep
  only the most recent, don't accumulate"). Implementer's-call decision
  (left open by PLAN.md): rather than encode `fromVersion` into the
  storage key/filename (which would need extra cleanup logic to avoid
  accumulating across different `fromVersion`s), it's stored *inside* the
  payload (`{ fromVersion, backedUpAt, data }`) alongside a fixed key -
  overwriting is then automatic, no cleanup step needed. A failed backup
  write is logged and swallowed (doesn't block migration) since it's a
  safety net, not a hard dependency.
- Wired both into `runStartupMigrations`: snapshot + backup before
  migrating, then `assertMigrationInvariants(before, _dbState)` after. On
  failure: restore `_dbState` to the pre-migration snapshot (in-memory,
  same data just persisted to the backup - no re-read needed), log details
  to console, `await showAlert(...)` (via `./utils`, already used
  elsewhere in the app, backed by `@capacitor/dialog` so it works on both
  web and native) to surface a blocking error, then re-throw so the caller
  doesn't proceed as if migration succeeded. `flushDB()` (persisting the
  migrated data) only runs if the invariant check passes.
- Added unit tests for `calculateLoadFactor`/`calculatePlannedLoad`
  (`src/lib/types.test.ts` - already created in the prior entry's bugfix,
  covers this DoD item too) and for `assertMigrationInvariants`
  (`src/lib/storage.invariants.test.ts`, new): pass-through case, each of
  the three invariant violations individually, a case confirming multiple
  violations are all reported together, and a real-data case (running
  `old_backup.json` through the full registry-based chain and confirming
  the result satisfies all invariants).

**Verification performed:**
- `npm run test` → 34/34 pass (21 Prerequisite fixture tests unchanged +
  7 `types.test.ts` + 6 new `storage.invariants.test.ts`).
- `npm run check` → 0 errors (see prior entry for the 10 pre-existing ones
  fixed separately before this).
- `npx vite build` → production build succeeds.

**Manual verification not performed, flagged explicitly (same reason as
the Prerequisite step - this session has no browser/display):** PLAN.md's
Phase 0 DoD asks to (a) manually export/import data in the running app and
confirm a round-trip with no loss, and (b) manually force an invariant
check to fail and confirm the app restores the pre-migration snapshot
rather than proceeding, then revert the forced failure. Neither was done
as literally written. In their place: `storage.invariants.test.ts`
exercises `assertMigrationInvariants` directly (the function that decides
pass/fail) including the real `old_backup.json` fixture case, and the
existing migration fixture tests exercise the same `runDataMigrations`
function `importData` calls. What remains genuinely unverified by
automated tests is the *integration* inside `runStartupMigrations` itself -
the backup write, the `_dbState` rollback assignment, and the `showAlert`
call - since that function also touches `localforage`/`Capacitor`, which
aren't meaningful to exercise under vitest's plain `node` test environment
(no IndexedDB/localStorage, no native bridge, `Dialog.alert`'s web fallback
likely expects a DOM). This is a real coverage gap, not a claim that it
was checked - flagging it rather than asserting the manual step was done.

**Commit:** made as its own commit, separate from the pre-existing-bug fix
above and from the Prerequisite step, per the plan's convention.

---

## 2026-09-16 — Phase 1 scope gap-fills (decided with user before implementation)

Before writing any Phase 1 code, read the full surface area the phase
touches: `types.ts`, `storage.ts`, `state.svelte.ts`, `App.svelte`,
`ics.ts`, and every component that reads/writes exercises (`ExerciseForm`,
`WorkoutForm`, `Settings` (template editor), `TrainingPlan`, `Analytics`,
`History`, `WorkoutShareImage`, `AIPromptModal`, `PDFExportModal`,
`BenchmarkForm`). Four real gaps in `PLAN.md`'s Phase 1 section surfaced;
all four were confirmed with the user and `PLAN.md` itself has been
updated in place (not just this log) since they're gaps in the plan, not
just implementation choices:

1. **`ExerciseSlot.categoryId`** - `PLAN.md`'s own code block omitted a
   category field, but its migration scope explicitly requires resolving
   `Exercise.category` (a name) to `AnalyticsCategory.id`, same as
   `typeId`. Added `categoryId?: string` to `ExerciseSlot`.
2. **`defaults.json`'s `templates` must convert to the new shape too**,
   and doing so uncovered a real, confirmed-reachable bug: two *existing*
   migration steps (`2.3→2.4` "Ensure Deload is in templates",
   `3.7→3.8`'s per-phase fallback fill) reference the live
   `DEFAULT_TEMPLATES` constant as an old-shape fallback. Checked
   concretely (not just reasoned abstractly) via
   `node -e "console.log(Object.keys(require('./src/lib/__fixtures__/backup-2.1.json').templates))"`
   → `[ 'Maintenance', 'Endurance', 'Strength', 'Power', 'Power Endurance' ]`.
   No `"Deload"` key, and no `"Work Capacity"` key either (so `"Capacity"`
   also ends up missing after the 3.7→3.8 rename pass). This means the
   real backup fixture *does* hit the `2.3→2.4` step's
   `DEFAULT_TEMPLATES["Deload"]` fallback.
   - Checked whether the `3.7→3.8` step's own
     `DEFAULT_TEMPLATES["Capacity"/"Strength"/"Performance"/"Taper"]`
     fallbacks are similarly live: they are not, and this is a
     **pre-existing, unrelated latent bug, left unfixed** -
     `defaults.json`'s `templates` object has never had keys named
     `"Capacity"`/`"Strength"`/`"Performance"`/`"Taper"` (only the
     pre-3.7 names), so `DEFAULT_TEMPLATES["Capacity"]` etc. already
     silently resolve to `undefined → []` today, before any Phase 1
     change. Converting `defaults.json`'s shape doesn't change that
     (still `[]` either way) - only `"Deload"` (which *does* exist as a
     key in `defaults.json` today, with real content) is a live landmine.
   - **Fix:** froze the current (pre-this-change) old-shape `"Deload"`
     template content as an inline constant used only by the `2.3→2.4`
     step, decoupled from `DEFAULT_TEMPLATES`/`defaults.json`. This keeps
     that historical step's output byte-identical to what it produces
     today, regardless of future `defaults.json` shape changes - matching
     Phase 0's own "migration steps are frozen, behavior-preserving"
     discipline. Added a fixture test (old data missing `"Deload"`)
     specifically to confirm this.
   - Per the user's explicit ask: added a **separate, dedicated** fixture
     test asserting `DEFAULT_TEMPLATES` itself (no migration involved -
     this is what a fresh install / "Reset to Default Library" actually
     uses) already has valid `typeId`-resolving, `prescribed`-shaped
     exercises.
3. **`DailyReadiness` has no typed shape today** (`dailyReadiness` is
   untyped `any[]`; no committed UI reads/writes it - `state.svelte.ts`'s
   `refresh()` never even loads it). Used
   `{ date: string; sleepScore?: number; hrv?: number; rhr?: number }`,
   confirmed via the stashed/deferred dashboard WIP's own unmerged
   `DailyReadiness` interface (`git stash show -p stash@{0}`) - matches
   the plan's own `sleep-score`/`hrv`/`rhr` `MetricDef` ids exactly. Used
   only to confirm field-name shape for the migration step, not reusing
   any stashed code.
4. **`calculateLoadFactor` stays 3-arg** (fingers/core/systemic), formula
   unchanged, even though `arms` becomes a formally typed `Workout` field.
   Confirmed via `FatigueModal.svelte`: its fatigue slider is already
   labeled "Fingers/Arms" as one combined input and never captures `arms`
   separately - matches `PLAN.md`'s explicit "not extended" framing for
   the 4-axis formula. No code change beyond adding the typed field.

**Additional judgment calls made while implementing (not asked about
individually, flagged here rather than silently decided):**
- **Category-placeholder creation on unresolved names.** `PLAN.md`'s
  migration bullet for `typeId` explicitly says to create an
  `archived: true` placeholder `ExerciseTypeDef` when a name doesn't
  resolve; it doesn't repeat this instruction for the `categoryId`
  migration bullet. Applied the same archived-placeholder pattern to
  unresolved `AnalyticsCategory` names too, since principle 2 ("archived,
  never hard-deleted, once referenced") is stated as applying to "every
  user-editable catalog," not just exercise types.
- **`saveExerciseTypes`'s rename-propagation block becomes dead code and
  was removed**, not just left in place. It used to find-and-replace
  `Exercise.type` (name) across workouts/templates whenever a type's
  `name` changed - but post-Phase-1, exercises reference `typeId`, which
  doesn't change on rename, so propagation is structurally unnecessary
  (this is the actual payoff of principle 1). Keeping the block would
  also fail to compile (`ExerciseSlot` has no `.type` field), so removal
  wasn't optional.
- **No archive-toggle UI was added to `Settings.svelte`.** The `archived`
  flag now exists on `ExerciseTypeDef`/`AnalyticsCategory`/
  `BenchmarkTypeDef`, and migration-created placeholders set it
  automatically, but `PLAN.md`'s Phase 1 "concrete scope — component
  changes" list never itemizes converting Settings' hard-delete buttons
  into archive toggles, and doing so well (filtering archived items out
  of "add new" pickers everywhere, etc.) is a real, non-trivial feature in
  its own right. Treated this the same way as `painLogs`/`metricDefs`:
  the field exists and the migration writes it correctly, but building
  UI around it is left for a later phase. Flagging so a future session
  doesn't assume this was overlooked.
- **No public `storage.getMetricDefs()`/`saveDailyMetrics()`-style
  accessors were added.** `metricDefs`/`dailyMetrics`/`painLogs` are
  persisted (read/written in `initDB`/`flushDB`/`exportData`/
  `importData`) so export/import round-trips don't drop them, but no
  convenience getter/setter was added to the `storage` object since
  nothing calls one yet (Phase 4/6's job). This intentionally does *not*
  follow the precedent of the pre-existing (now-removed) `dailyReadiness`
  getters, which were already-dead code inherited from before this
  refactor - not a pattern worth extending.

---

## 2026-09-16 — Phase 1 implemented: core data model, ID references, prescribed/logged split

**Types (`src/lib/types.ts`):** Added `ExerciseValues` (the tracked
parameter fields, minus `id`/`type`/`category`/`activeParameters`) and
`ExerciseSlot` (`id`, `typeId`, `categoryId?`, `activeParameters?`,
`prescribed?`, `logged?`), replacing the old flat `Exercise` interface
everywhere (`Workout.exercises: ExerciseSlot[]`). Added `archived?:
boolean` to `ExerciseTypeDef`/`AnalyticsCategory`/`BenchmarkTypeDef`.
Added `arms?: number` to `Workout` (the 4th fatigue axis, already written
by the committed `3.10→3.11` migration step but never typed until now -
`calculateLoadFactor`'s formula deliberately untouched, see gap-fill #4
above). Added `MetricDef`/`DailyMetricEntry`/`PainLog` and extended
`TrainingData` with `metricDefs`/`dailyMetrics`/`painLogs`. New helper
module `src/lib/exerciseSlot.ts`: `slotValues(slot)` (`logged ?? prescribed
?? {}`, the "best available info" read used by every display-only
consumer) and `slotTypeName(slot, exerciseTypes)`.

**Migration (`src/lib/storage.ts`):** Five new registry steps appended
after `3.13→3.14`, `DATA_EXPORT_VERSION` bumped to `"3.19"`:
- `3.14→3.15`: resolve `Exercise.type` (name) → `typeId`, creating an
  `archived: true` placeholder `ExerciseTypeDef` (deduped per unique
  missing name within one migration run) for anything unresolvable -
  never drops the reference. Falls back to a generic `"Unknown Exercise"`
  placeholder for the (real-data-wise, never-seen) case of a missing
  `type` entirely.
- `3.15→3.16`: same pattern for `Exercise.category` → `categoryId`
  against `AnalyticsCategory`. Extended the archived-placeholder pattern
  here too, even though `PLAN.md`'s migration bullet only spelled it out
  for `typeId` - principle 2 ("archived, never hard-deleted") is stated
  as applying to every user-editable catalog, so this fills what reads as
  an omission rather than a deliberate difference.
- `3.16→3.17`: restructures `Exercise[]` → `ExerciseSlot[]`. Every
  `ExerciseValues` field except `duration`/`reps` moves unchanged into
  both `prescribed` and `logged` for completed workouts (the two fields
  that ever had real prescribed-vs-actual tracking historically -
  `plannedDuration`/`duration` since `3.11→3.12`, `actualReps`/`reps`
  since `3.9→3.10` - everything else never got that treatment, so
  duplicating the single historical value into both buckets is the
  correct "don't fabricate a different prescribed value" behavior, not a
  simplification). Planned workouts get `prescribed` only. Slot ids are
  kept stable and only regenerated on collision within the run (fixes the
  `duplicateWorkout` bug class described below).
- `3.17→3.18`: `dailyReadiness` → seeded `sleep-score`/`hrv`/`rhr`
  `MetricDef`s + `DailyMetricEntry` rows (field-name shape confirmed via
  the deferred dashboard stash, see gap-fill #3).
- `3.18→3.19`: adds `painLogs: []`.
- `assertMigrationInvariants` updated from name-based (`e.type`) to
  `typeId`-based resolution, matching the new schema.

**A real bug found via decision #2 (defaults.json conversion) and fixed
before it could ship:** converting `defaults.json`'s `templates` to the
new shape meant the `2.3→2.4` step's `DEFAULT_TEMPLATES["Deload"]`
fallback needed decoupling (see gap-fill #2) - implemented as a frozen
`LEGACY_DEFAULT_DELOAD_TEMPLATE` constant. Writing the regression test
for it (`storage.phase1.test.ts`, scenario (g)) caught a *second*, worse
bug in that same fix: the constant was assigned into `data.templates` by
*reference*, not cloned, so the first migration run to hit that fallback
mutates the shared module-level constant in place (the restructuring step
reassigns `w.exercises`) - any *later* migration run in the same process
that also hits the fallback (a second old import, e.g.) would then
re-process already-new-shape data as if it were still flat, producing a
double-nested `prescribed.prescribed`. Fixed with a
`JSON.parse(JSON.stringify(...))` deep clone at the assignment site,
matching the technique `runStartupMigrations` already uses for its
pre-migration snapshot. Added a test that runs the fallback twice in one
process specifically to guard this.

**Other bugs fixed while touching directly-adjacent code (not scope
creep - each is in a function/line this phase already had to rewrite):**
- `storage.assignPhaseToWeek`: exercises copied from a template into a
  newly-generated workout kept the template's exercise ids verbatim: the
  same id-collision bug class the plan calls out for `duplicateWorkout`,
  just here for "assign this phase to N different weeks" instead of
  "duplicate this one workout." Now regenerates slot ids on copy, same
  as `duplicateWorkout` (`state.svelte.ts`, also fixed per `PLAN.md`'s
  explicit instruction).
- `storage.saveExerciseTypes`'s rename-propagation block (find every
  exercise with the old type *name* and rewrite it) is now dead code, not
  just unnecessary: exercises reference `typeId`, which doesn't change on
  rename, so the block was removed rather than left inert (it also
  wouldn't have compiled - `ExerciseSlot` has no `.type` field).
  Elsewhere (`PDFExportModal.svelte`), the "Grades: {ex.boulderingGrades}"
  line was rewritten as part of translating this component to the new
  types.ts - noticed while doing so that `boulderingGrades` was never a
  real field on `Exercise` (grades were always `minGrade`/`maxGrade`), so
  the old branch could never have rendered. Fixed to read `minGrade`/
  `maxGrade` while rewriting the surrounding code anyway, not as separate
  scope.
- `Analytics.svelte`'s category-resolution fallback had substring-matching
  heuristics (`typeKey.includes('hang') → 'Fingers'`, etc.) as a
  workaround for exercise type *names* that might not resolve. Since
  every `typeId` is now guaranteed resolvable to some `ExerciseTypeDef`
  (real or archived placeholder), this workaround is structurally
  unreachable for migrated data and was removed in favor of the same
  generic `'Other'` fallback `assertMigrationInvariants`-style code uses
  elsewhere - keeping unreachable name-matching heuristics around after
  switching to id-based lookup would only confuse a future reader.

**`src/data/defaults.json`:** `templates`' exercises converted from flat
`{ type, duration, ... }` to `{ id, typeId, prescribed: { duration, ... } }`
(exact `type` name → `typeId` mapping taken from the file's own
`exerciseTypes` list). `exerciseTypes` itself was deliberately *not*
touched - it still uses some pre-migration parameter names
(`boulderingGrades` instead of `grades`, etc.), a separate pre-existing
drift issue out of this phase's scope (same reasoning as the "Deload"
fallback finding: `defaults.json` doesn't automatically track schema
changes made elsewhere, and fixing that fully is bigger than this
decision covers).

**Components rewired to `typeId`/`categoryId`/`prescribed`/`logged`:**
`ExerciseForm.svelte` (now takes `initialSlot`/`mode` instead of
`initialData`, and returns `{ typeId, categoryId?, activeParameters,
values }` from `onSave` instead of a flat object - the `variant` param UI
was dropped entirely since `ExerciseValues` has no field for it, matching
that `variant` was already fully purged by the committed `3.8→3.9` step);
`WorkoutForm.svelte` (mode is derived directly from `workout.status`
exactly as `PLAN.md` specified, via the label at what's now
`WorkoutForm.svelte`'s status line; added `ensureLoggedInitialized`,
called at both places a workout can transition `planned → completed`
- `handleSelectPlanned` and `handleComplete` - so `logged` is always a
populated starting point, never left undefined, once a workout is
actively being logged); `Settings.svelte`'s template editor (templates
only ever populate `prescribed`, `mode="prescribed"` hardcoded on that
`ExerciseForm` instance); `Analytics.svelte`, `History.svelte`,
`WorkoutShareImage.svelte` (confirmed dead/unreferenced by any importer -
still fixed for type-correctness since `svelte-check` type-checks it
regardless), `AIPromptModal.svelte`, `PDFExportModal.svelte`,
`state.svelte.ts` (CSV export, `saveWorkout`'s `plannedLoad` aggregate,
the NaN-bug-fix dedupe loop in `refresh()`), `App.svelte` (the
`FatigueModal` duration sum), `ics.ts` (calendar-event duration).
`TrainingPlan.svelte` and `BenchmarkForm.svelte` needed no changes - the
former only reads `workout.exercises.length`, the latter never touches
`ExerciseSlot` at all.

**New fixture tests** (`src/lib/storage.phase1.test.ts`, 8 tests) cover
every scenario `PLAN.md`'s Definition of Done calls out by letter: (a)
pre-3.12 completed workout, no `plannedDuration` → `prescribed === logged`;
(b) post-3.12 workout with both `plannedDuration` and `actualReps` →
correctly split; (c) planned workout → `logged` stays `undefined`; (d)
unresolvable type/category names → archived placeholders, deduped per
name; (e) full `old_backup.json` roundtrip + `assertMigrationInvariants`
+ every slot's `typeId` resolves; (f) `DEFAULT_TEMPLATES` (no migration
involved - the actual fresh-install/reset-to-default path) already valid;
(g) the frozen-Deload-fallback regression test, including the
run-twice-in-one-process case that caught the shared-mutable-reference
bug above. Existing `storage.migrations.test.ts`/`storage.invariants.test.ts`
assertions that checked the old flat shape or `DATA_EXPORT_VERSION ===
"3.14"` were updated to check the new `prescribed`/`logged`/`typeId`
locations and `"3.19"` - not rewritten to test something different, same
behavior, correct location.

**Verification performed:**
- `npm run test` → 43/43 pass (34 prior, updated in place where the final
  shape changed + 9 new).
- `npm run check` → 0 errors, 0 warnings, 355 files.
- `npx vite build` → production build succeeds (pre-existing >500kB chunk
  warning, unrelated to this phase).
- **Manual verification (unlike the Prerequisite/Phase 0 steps, a
  display and Chrome were actually available this session):** started
  the dev server (`npm run dev`, confirmed serving at
  `http://localhost:5173/climbing-tracker/`) intending to drive it via
  browser automation for the two `PLAN.md` manual-test bullets (import
  `old_backup.json` and spot-check values; create/complete a workout with
  edited logged values and confirm prescribed survives). The user
  explicitly asked to do this verification manually themselves instead
  and told me to continue without it. Left the dev server running for
  them. This is a deliberate handoff, not a gap being silently claimed as
  done - flagging explicitly per this session's own convention for that
  distinction.

**Commit:** made as its own commit, referencing "Phase 1" per the plan's
convention.

---

## 2026-09-16 — Phase 2 scoping: store list clarified with user before implementation

Before writing any Phase 2 code, the kickoff instruction for this phase
asked for domain stores "including painLogStore and bodyweightStore per the
plan's scope." Checked this against `PLAN.md`'s actual Phase 2 store list
and found a mismatch, not just an implementation detail:

- `PLAN.md` names a single `metricsStore.svelte.ts` covering `metricDefs`,
  `dailyMetrics`, **and** `painLogs` together — there is no separate
  `painLogStore` anywhere in the plan.
- `PLAN.md` names no `bodyweightStore` at all. Bodyweight tracking isn't an
  entity that exists yet — Phase 6 is the phase that seeds a `bodyweight`
  `MetricDef` (Phase 1's generic metric system already supports it, "no new
  entity needed" per Phase 6's own scope text). There's nothing for Phase 2
  to split out today.

Asked the user directly rather than guessing. **Decision (user,
2026-09-16): follow `PLAN.md` as written** — one `metricsStore.svelte.ts`
for `metricDefs` + `dailyMetrics` + `painLogs`, no separate `painLogStore`,
no `bodyweightStore` in this phase. Proceeding with the store list exactly
as specified in `PLAN.md`'s Phase 2 section.

**Further Phase 2 file-layout decisions, confirmed with the user before
writing code:**
- `storage.ts` (1428 lines) splits into `storage/persistence.ts` (init/flush
  DB, localforage/Capacitor Filesystem adapters, `writeMigrationBackup`),
  `storage/migrations.ts` (the `MIGRATIONS` registry, `runDataMigrations`,
  `assertMigrationInvariants`, moved verbatim), and `storage/index.ts` (the
  public `storage` object, re-exporting `runDataMigrations`/
  `assertMigrationInvariants` so the existing `storage.migrations.test.ts`/
  `storage.invariants.test.ts`/`storage.phase1.test.ts` imports from
  `"./storage"` keep resolving unchanged).
- `assignPhaseToWeek`'s inline "generate workouts from a phase's templates"
  logic extracted to `src/lib/planning/generateWorkoutsFromTemplate.ts` as a
  pure function, per `PLAN.md`'s explicit instruction; `storage` now only
  persists.
- Benchmark-related state splits into **two** stores, not one, matching
  `PLAN.md`'s two separate bullets and principle 4 ("what can be tracked"
  vs. "what was tracked"): `catalogStore` holds the archivable *definition*
  registries (`exerciseTypes`, `analyticsCategories`, `benchmarkTypes`);
  `benchmarkStore` holds the actual logged `Benchmark` records.
- **Kept a `trainingState` facade** in `state.svelte.ts` composing all 7
  domain stores, preserving the exact current public API (same property/
  method names) rather than rewriting call sites — confirmed with the user.
  Reason: 131 usages of `trainingState` across 12 components, frequently
  mixing multiple domains in a single expression/file (e.g.
  `TrainingPlan.svelte` touches workouts/periodization/benchmarks/
  navigation together) — `PLAN.md`'s own Phase 2 "Assumptions" section
  explicitly allows this call when rewriting every import site "isn't
  worth doing." Domain stores are the real decomposition; the facade is
  purely a compatibility shim, not new logic.
- **Added storage accessors for `metricDefs`/`dailyMetrics`/`painLogs`**
  (`getMetricDefs`/`saveMetricDefs`, `getDailyMetrics`/`saveDailyMetrics`,
  `getPainLogs`/`savePainLogs`), mirroring the existing
  `getBenchmarkTypes`/`saveBenchmarkTypes` pattern exactly. Phase 1
  deliberately deferred these (see the 2026-09-16 "Phase 1 implemented"
  entry, "no public accessors... nothing calls one yet") since nothing
  consumed the data yet; Phase 2 needs `metricsStore` to be a real working
  store like every other store rather than the one non-functional stub, so
  confirmed with the user this additive plumbing (no schema change, no new
  UI) is in scope now.

---

## 2026-09-16 — Phase 2 implemented: state & storage decomposition

**Storage split** (`src/lib/storage.ts`, 1428 lines, deleted):
- `src/lib/storage/persistence.ts` — `initDB`/`flushDB`, the localforage/
  Capacitor Filesystem adapters, `writeMigrationBackup`. Exports the
  mutable `_dbState` binding plus a `setDbState()` setter (needed because
  `runStartupMigrations`'s rollback-on-invariant-failure path reassigns
  `_dbState` wholesale from another module - an imported `let` binding
  can be read live across modules but not reassigned from outside its own
  module, so a setter function is required for that one case).
- `src/lib/storage/migrations.ts` — the `MigrationStep`/`MIGRATIONS`
  registry, `runDataMigrations`, `assertMigrationInvariants`, moved
  verbatim, no logic changes.
- `src/lib/storage/index.ts` — the public `storage` object, re-exporting
  `runDataMigrations`/`assertMigrationInvariants` so the existing
  `storage.migrations.test.ts`/`storage.invariants.test.ts`/
  `storage.phase1.test.ts` imports from `"./storage"` keep resolving
  unchanged (verified: all 3 test files pass with zero edits). Also adds
  the new `getMetricDefs`/`saveMetricDefs`, `getDailyMetrics`/
  `saveDailyMetrics`, `getPainLogs`/`savePainLogs` accessors decided above,
  mirroring the existing `getBenchmarkTypes`/`saveBenchmarkTypes` pattern.
- `src/lib/planning/generateWorkoutsFromTemplate.ts` — the "generate
  workouts from a phase's templates" logic extracted out of
  `assignPhaseToWeek` verbatim into a pure, synchronous function
  (`(weekId, templates) => Workout[]`); `storage.assignPhaseToWeek` now
  only persists (periodization + resulting workouts), it doesn't compute
  what a phase assignment implies.

**State split** (`src/lib/state.svelte.ts`, 406 lines) into
`src/lib/stores/*.svelte.ts`:
- `workoutStore` — `workouts` state, `load()` (including the legacy
  0-`plannedLoad` cleanup, moved here since it only touches workouts),
  `completedWorkouts`/`getPlannedWorkoutsForWeek`, `saveWorkout`/
  `deleteWorkout`/`duplicateWorkout`.
- `planningStore` — `periodization`/`templates` state, `assignPhase`,
  `updateTemplates`/`resetTemplates`, `clearWeek`.
- `catalogStore` — `exerciseTypes`/`analyticsCategories`/`benchmarkTypes`
  (the archivable *definitions*), matching the principle-4 split decided
  above.
- `benchmarkStore` — the logged `Benchmark` *records*.
- `metricsStore` — `metricDefs`/`dailyMetrics`/`painLogs`, wired to the
  new storage accessors; still has zero UI consumers (Phase 4/6's job),
  but is now a real working store instead of a stub.
- `uiStore` — `view`/`activeWorkout`/`selectedWeekId`/`weekOffset`/
  `showFatigue`/`theme`, `navigate`/`openFatigueModal`/
  `closeFatigueModal`/`setTheme`.
- `backupStore` — `exportData`/`importFile` (thin wrappers around
  `storage`), `exportToCSV` (takes `workouts`/`periodization`/
  `exerciseTypes` as parameters rather than owning that state itself,
  since CSV export is a cross-domain read, not a domain of its own).

**Facade decision, implemented as designed and confirmed with the user
above:** `state.svelte.ts` now holds a `TrainingState` class that
instantiates all 7 stores and re-exposes the exact same public shape
`trainingState` had before (same property names via getters, same method
names/signatures) - verified with a full `grep -c "trainingState\."`
sweep across all 12 consuming components/`App.svelte` (131 usages) showing
**zero call sites needed to change**. Two properties (`selectedWeekId`,
`weekOffset`) needed get *and* set accessors on the facade (delegating to
`uiStore`'s underlying `$state` fields) since components write to them
directly (`TrainingPlan.svelte`); every other property is read-only from
outside (written only via action methods), so those got plain getters.
Cross-domain orchestration (the "mutate then full refresh" pattern every
action already used pre-Phase-2, plus `confirmFatigue`/`processWorkoutSave`/
`importData`/`clearWeek`, which each touch more than one store) stays at
the facade level rather than being pushed into any one domain store -
domain stores' own action methods call `storage` but deliberately do
**not** self-refresh, so the facade's existing "call store method, then
`await this.refresh()`" sequencing is unchanged from today's behavior
(every store's `load()` runs in parallel via `Promise.all`, exactly
mirroring the original `refresh()`'s `Promise.all` over 7 storage calls).
This was a deliberate choice over letting each store self-refresh after
its own mutations: several storage-layer calls have cross-store side
effects already (e.g. `storage.saveWorkout` internally calls
`markWeekAsCustomized`, mutating periodization) - a self-refresh scoped to
only the acting store's slice would silently stop reflecting those side
effects in other stores' reactive state, a real behavior regression this
phase's "no behavior change" goal rules out. Full-refresh-after-every-
mutation is less efficient than a scoped reload would be, but it's
*exactly* today's behavior, preserved on purpose.

**Verification performed:**
- `npm run test` → 43/43 pass, unchanged from pre-Phase-2 (all 4 existing
  test files needed zero edits).
- `npm run check` → 0 errors, 0 warnings, 365 files (was 358 pre-Phase-2;
  the 7 new store files + 3 new storage files + 1 new planning file account
  for the difference net of the 1 deleted `storage.ts`).
- `npx vite build` → production build succeeds (same pre-existing >500kB
  chunk warning as before, unrelated to this phase).
- **Manual smoke test performed by the user** (browser tooling wasn't
  available this session - same gap as Phase 0/1, flagged rather than
  silently skipped): dev server started and left running at
  `http://localhost:5173/climbing-tracker/`; the user clicked through
  plan/home, add workout, history, settings, and analytics themselves and
  confirmed nothing regressed.

**Commit:** made as its own commit, referencing "Phase 2" per the plan's
convention.


