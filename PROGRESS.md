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

---

## 2026-09-16 — Phase 3 scoping: template library flagged to user before implementation

Before writing any Phase 3 code, checked PLAN.md's Phase 3 "Assumptions"
section, which explicitly says the pre-built periodization template
library's content is a training-science decision, not an engineering one,
and instructs against inventing detailed training programs unprompted.
Asked the user directly rather than guessing.

**Decision (user, 2026-09-16):** stub it, but make the placeholder
**obviously fake/generic**, not a plausible-looking real program - e.g.
"Sample Template A" with clearly dummy exercise names/numbers, so it can't
be mistaken for real content later. Build the full plumbing around it (data
structure, "Load Starter Set" button, `TemplateSettings` UI section)
regardless. **Placeholder-only, pending real content from the user** - do
not treat the seeded `DEFAULT_TEMPLATE_LIBRARY` content as ready to ship.

---

## 2026-09-16 — Phase 3 implemented: modular phases & templates

**Types (`src/lib/types.ts`):** Removed the closed `PhaseType` union
entirely (nothing needs it once `PhaseDef` exists). Added `PhaseDef` (`id`,
`name`, `color?`, `order?`, `archived?`) and `WorkoutTemplate` (`id`,
`name?`, `dayOfWeek?`, `exercises: ExerciseSlot[]`) - a dedicated shape
rather than continuing to (ab)use `Partial<Workout>`, which technically
allowed workout-only fields (`status`, `date`, `loadFactor`, fatigue) that
never made sense on a template. `PeriodizationWeek.phase: PhaseType` ->
`phaseId: string`. `TrainingData.templates: Record<PhaseType,
Partial<Workout>[]>` -> `Record<string, WorkoutTemplate[]>` keyed by
`PhaseDef.id`, plus a new `phaseDefs: PhaseDef[]` field.

**Migration (`src/lib/storage/migrations.ts`):** Three new registry steps,
`DATA_EXPORT_VERSION` bumped `"3.19"` -> `"3.22"` (one bump per structural
change, matching Phase 1's granularity):
- `3.19->3.20`: seeds the 7 built-in `PhaseDef`s using the fixed id mapping
  from PLAN.md (`Capacity`->`phase-capacity`, etc.). By version 3.19 the
  already-committed `3.7->3.8` and `3.13->3.14` steps have already
  normalized every phase value down to these 7 canonical names, so the
  mapping is a direct lookup - no need to handle older pre-rename names
  ("Work Capacity", "Maintenance", ...) at this point in the chain.
- `3.20->3.21`: resolves `PeriodizationWeek.phase` (name) -> `phaseId`,
  creating an `archived: true` placeholder `PhaseDef` for any unresolvable
  name - same archived-placeholder pattern Phase 1 used for `typeId`/
  `categoryId` (principle 2). Deletes the old `.phase` field.
- `3.21->3.22`: rekeys `templates` from phase name to `phaseId` (same
  placeholder pattern, sharing `data.phaseDefs` with the previous step so a
  name unresolved in one step but seen in the other still maps to the same
  id) and converts each entry from `Partial<Workout>` to `WorkoutTemplate`
  (`notes` -> `name`, fresh generated `id`, `dayOfWeek`/`exercises`
  unchanged - `exercises` are already `ExerciseSlot[]` at this point in the
  chain thanks to Phase 1's `3.16->3.17` restructuring step, which already
  processed `data.templates` generically alongside `data.workouts`, so no
  second exercise-shape conversion is needed here).

Both new placeholder-creating steps share one helper,
`makePhaseIdResolver(data)`, factored out since the "look up by name, else
create an archived placeholder and push it" logic is identical between the
periodization step and the templates step - matches the existing
`findOrCreateTypeId`/`findOrCreateCategoryId` pattern from Phase 1's
`storage.migrations.ts`, just extracted once here since two separate steps
needed the exact same logic against the same evolving `data.phaseDefs`
array (Phase 1's typeId/categoryId equivalents didn't share logic across
steps since they resolve different fields).

**`assertMigrationInvariants` extended** (judgment call, not explicitly
required by PLAN.md's Phase 3 DoD, but cheap and matches the established
precedent of checking every archivable-catalog reference): now also checks
every `PeriodizationWeek.phaseId` resolves against the migrated
`phaseDefs`, mirroring the existing `typeId` check exactly.

**`src/data/defaults.json`:** Added `phaseDefs` (7 built-ins, colors moved
here from what used to be `TrainingPlan.svelte`'s hardcoded
`phaseColors` map). `templates` rekeyed from phase name to `phaseId`, each
workout template converted to `{ id, name, dayOfWeek, exercises }`
(`notes` -> `name`, stable hand-assigned ids like `"tmpl-capacity-1"` since
this is static JSON, not a migration step that can call `generateId()`).

**Judgment call - splitting "Performance / Taper" content:** the old
single `"Performance / Taper"` template had two workouts ("Projecting Day"
and "Active Recovery"). Since `Performance` and `Taper` are now two
genuinely separate phases (post-3.7->3.8, this was already true for real
user data going through migration, but `defaults.json`'s own fresh-install
content had never been split), assigned "Projecting Day" to
`phase-performance` and "Active Recovery" to `phase-taper` - a reasonable
split (projecting fits a performance peak, active recovery fits a taper)
but a real content decision made without being asked, flagging it as such.
This only affects fresh-install/reset-to-default-library content, not any
migration path: the pre-existing `3.7->3.8` step's own
`DEFAULT_TEMPLATES["Taper"] || []` fallback was already confirmed dead in
the Phase 1 gap-fill entry above (real user data never had a `"Taper"` key
to preserve), so no migrated data is affected by this split either way.

**Starter template library (placeholder-only, per the scoping decision
above):** New `TemplateLibrarySet` type and `DEFAULT_TEMPLATE_LIBRARY`
constant (`src/lib/constants.ts`), sourced from a new `templateLibrary`
field in `defaults.json` - deliberately **not** part of `TrainingData`/the
migration chain, since it's static app-bundled content the user selects
from, not user data that needs to round-trip through export/import. Seeded
with exactly one set (`"Sample Template A (PLACEHOLDER - NOT REAL TRAINING
CONTENT)"`), covering two phases with single dummy exercises (duration
999/111, `plannedLoad: 1`, notes literally saying "PLACEHOLDER VALUE - not
a real prescription"). `TemplateSettings.svelte` gets a new "Starter
Template Library" section listing each set with a "Load" button that
merges the chosen set's templates into the user's local editable
`templates` (confirm dialog first, warns it overwrites matching phases) -
not persisted until the normal "Save All" action.

**Settings split (`src/components/settings/`):** `Settings.svelte` (867
lines) split into `ExerciseTypeSettings.svelte`, `PhaseSettings.svelte`
(new - CRUD for `PhaseDef[]`: name/color/reorder-by-`order`-field/delete,
mirroring `AnalyticsCategorySettings`'s existing pattern), `TemplateSettings.svelte`
(phase-template editor + the new starter-library section),
`BenchmarkTypeSettings.svelte`, `AnalyticsCategorySettings.svelte`,
`BackupSettings.svelte` (ICS/PDF/JSON export+import, owns the
`PDFExportModal` trigger), `PreferencesSettings.svelte` (theme). `Settings.svelte`
itself is now a thin shell (~200 lines): owns the tab router, the "About"
tab's static content (not extracted - no logic, didn't need its own file),
and the local editable copies of every catalog (`templates`, `phaseDefs`,
`exerciseTypes`, `benchmarkTypes`, `analyticsCategories`) passed down as
`$bindable()` props - **deliberately preserving the exact pre-existing
"Save All" behavior** (one button persists every catalog together) rather
than splitting into independent per-section saves, matching Phase 2's
"behavior-preserving refactor, not a UX change" precedent for structural
splits.

**Judgment call - `PhaseSettings`'s delete button hard-deletes** (filters
the phase out of the array) rather than setting `archived: true`, even
though `PhaseDef.archived` exists and migration-created placeholders set it
automatically. This matches the existing, unchanged behavior of
`ExerciseTypeSettings`/`BenchmarkTypeSettings`/`AnalyticsCategorySettings`
in this same codebase (all three already hard-delete from their catalogs
today) rather than introducing a new archive-toggle UX pattern that none of
the sibling catalogs have yet - consistent with Phase 1's explicit note
that building archive-toggle UI was deferred to a later phase, not
reversed here.

**Other call sites updated for `phaseId`/`WorkoutTemplate`:**
`TrainingPlan.svelte` (phase picker/colors now derived from
`trainingState.phaseDefs` instead of a hardcoded `Record<PhaseType,
string>` map - archived phases excluded from the assignable list but stay
resolvable for display via a `phaseDefById` lookup, matching the pattern
already used for archived exercise types/categories),
`PDFExportModal.svelte`, `backupStore.svelte.ts`'s CSV export (now takes
`phaseDefs` as a parameter to resolve the display name, mirroring how it
already resolves exercise type names via `exerciseTypes`),
`generateWorkoutsFromTemplate.ts` (`templates: Partial<Workout>[]` ->
`WorkoutTemplate[]`, reads `t.name` instead of `t.notes`),
`storage/persistence.ts`/`storage/index.ts` (new `phaseDefs` get/save
plumbing, mirroring every other catalog), `catalogStore`/`planningStore`/
`state.svelte.ts` facade (new `phaseDefs`/`updatePhaseDefs`).

**Fix made while already touching phase-related code (not scope creep -
directly caused by this phase's own change):** `AIPromptModal.svelte`'s
"Generate Plan" prompt had a hardcoded `"Available Phases: Work Capacity,
Max Strength, Power, Power Endurance, Performance / Taper, Deload."` string
- already stale before this phase (referring to pre-3.7-rename names), and
now actively wrong once phases became data-driven. Changed to build the
list from `trainingState.phaseDefs` (excluding archived) so it always
reflects the user's real current phase set.

**Test updates:** All pre-existing `storage.migrations.test.ts`/
`storage.phase1.test.ts` assertions that inspected the old `phase`
name field or name-keyed `templates` were updated to the final `phaseId`/
`WorkoutTemplate`-keyed-by-`phaseId` shape - not rewritten to test
something different, same behavior/same fixtures, correct final location
(same reasoning as every prior phase's test-update entries; `vitest`
always walks the full migration chain to the current version in one call,
so a test seeded at an old `exportVersion` asserts against the *final*
schema, not the intermediate shape the specific step under test produces).
New `src/lib/storage.phase3.test.ts` (8 tests) covers PLAN.md's Phase 3
DoD explicitly: all 7 legacy phase names -> correct fixed `phaseId`s
(both for periodization and for template rekeying), the archived-
placeholder path for an unresolvable/custom phase name (including
placeholder reuse across periodization + templates), the full
`old_backup.json` roundtrip with `phaseId`/templates-key invariants,
`DEFAULT_PHASE_DEFS`/`DEFAULT_TEMPLATES` fresh-install shape validity, and
a check that the placeholder starter-library content's exercise `typeId`s
all resolve against `DEFAULT_EXERCISE_TYPES`.

**Verification performed:**
- `npm run test` -> 51/51 pass (43 prior, updated in place where the final
  shape changed + 8 new in `storage.phase3.test.ts`).
- `npm run check` -> 0 errors, 0 warnings, 373 files.
- `npx vite build` -> production build succeeds (same pre-existing >500kB
  chunk warning as before, unrelated to this phase).
- **Manual verification not performed by this session** (no browser/display
  tooling available - same gap as Phase 0's entry, different reason than
  Phase 1/2 where a browser was available). A pre-existing dev server was
  already running (`http://localhost:5173/climbing-tracker/`, started
  before this session, presumably left open by the user); left it running
  rather than restarting it, so Vite's HMR should pick up this phase's
  changes automatically. PLAN.md's Phase 3 manual-test bullets (open the
  app with existing data, confirm the calendar still shows the correct
  phase for already-assigned weeks, confirm assigning a new phase still
  generates workouts from the right template set) are **not yet confirmed
  in a real browser** - flagging explicitly rather than claiming done.

**Explicitly not done here** (deferred, per PLAN.md's own framing or this
session's scoping decision): real training-science content for the starter
template library (placeholder only, pending the user, see the scoping
entry above); an archive-toggle UI for `PhaseDef`/other catalogs (still
deferred from Phase 1, not reversed); Phase 4's concurrent-block/
peaking-calendar work, which is what actually needs `PhaseDef` to support
overlapping training emphases.

**Commit:** made as its own commit, referencing "Phase 3" per the plan's
convention.

---

## 2026-09-16 — Post-Phase-3 fix: fresh install ran the full migration chain over already-current-shape data (user-reported, confirmed, two real bugs)

**Report:** after Phase 3 landed, the user saw every training phase listed
twice in Settings even after deleting IndexedDB from browser storage - the
duplicates gray and named literally `"phase-capacity"`, `"phase-deload"`,
etc. (the id string, not the display name).

**Root cause (confirmed by reproducing it directly against
`runDataMigrations`, not just inspected):** `initDB` (`storage/persistence.ts`)
has always defaulted a missing `exportVersion` to `"1.0"` unconditionally,
including on a genuinely fresh install where every field is populated
straight from the `DEFAULT_*` constants - which are already in the
*current* schema shape by construction, not old-shape data needing
migration. That made `runStartupMigrations` run the *entire* migration
chain over already-current-shape data on every fresh install. Most of the
~25 historical steps happen to be defensive/idempotent against
already-migrated input (many explicitly guard, e.g. `if (e.typeId) return;`),
so this had been silently harmless for years - until two steps that
weren't defensive got hit:

1. **Phase 3's `3.21->3.22` templates-rekey step** (introduced this
   session) treated every `data.templates` key as an unresolved phase
   *name* needing lookup-or-placeholder-creation - but a fresh install's
   `templates` (from `DEFAULT_TEMPLATES`) are already keyed by `phaseId`
   (e.g. `"phase-capacity"`), not by name. `makePhaseIdResolver` found no
   `PhaseDef` whose *name* was `"phase-capacity"`, so it created a brand
   new archived placeholder `PhaseDef` (`{ id: <generated>, name:
   "phase-capacity", archived: true }`) for every one of the 7 phases -
   exactly the visible gray/doubled/`"phase-..."`-named symptom reported.
2. **A pre-existing Phase 1 bug, not caused by this session's work but
   newly exposed by reproducing the report:** the same fresh-install path
   also runs Phase 1's `3.16->3.17` Exercise->ExerciseSlot restructure step
   over `DEFAULT_TEMPLATES`'s exercises, which are already `ExerciseSlot`-
   shaped (`{ id, typeId, prescribed: {...} }`), not flat `Exercise`. That
   step's destructuring (`const { id, type, category, typeId, ..., ...rest
   } = e`) doesn't list `prescribed` among the fields it pulls out, so the
   existing `prescribed` object fell into `...rest` and got wrapped in a
   *second* `prescribed` layer (`slot.prescribed.prescribed`), silently
   hiding every default template's actual exercise values (duration,
   climbingStyle, etc. all become unreachable at the field names the UI
   reads). Confirmed this reproduces against the real `DEFAULT_TEMPLATES`
   constant, not a hypothetical. This bug has been live since Phase 1's
   commit; it was never caught because every prior phase's manual
   fresh-install verification was deferred to the user (no browser tooling
   in-session), and a *pre-existing* install's `_dbState.workouts` is never
   empty/absent the way a true fresh install's is, so this exact code path
   (migrations running over `DEFAULT_TEMPLATES` itself) was never actually
   exercised by any of this session's own fixture tests either - Phase 1's
   test (f) and Phase 3's equivalent both checked `DEFAULT_TEMPLATES`
   *directly*, never through `runDataMigrations`, which is precisely the
   gap that let this ship unnoticed twice.

**Fix (`src/lib/storage/persistence.ts`):** extracted a small, directly
unit-testable `resolveInitialExportVersion(rawData)`: a **true** fresh
install (`rawData.workouts == null` - the one field every real install
always persists, even as `[]`) is now pinned straight to
`DATA_EXPORT_VERSION`, skipping the migration chain entirely, since
`DEFAULT_*` data never needs migrating. A real pre-existing install with no
recorded `exportVersion` (genuine 1.0/2.0-era data, which does have
persisted `workouts`) still defaults to `"1.0"` exactly as before - this
fix narrows *when* migrations run, it doesn't change what any step does.

**Defense-in-depth fixes (`src/lib/storage/migrations.ts`), so a future
regression in the version-detection fix above can't reintroduce silent
corruption:**
- `makePhaseIdResolver` now checks "is this key already a valid `PhaseDef.id`"
  before treating it as an unresolved name - an already-resolved key
  (whether from a fresh install or genuinely already-migrated data) is
  returned as-is instead of spawning a placeholder.
- The `3.16->3.17` restructure step now checks `if (e.prescribed !==
  undefined || e.logged !== undefined)` and passes an already-slotted
  exercise through unchanged (still applying the existing id-collision
  dedup) instead of re-running the flat-`Exercise`-splitting logic on it.
  This amends a Phase 1 step, same as the Prerequisite step's `3.8->3.9`
  precedent - additive-only for the new early-return branch, no change to
  the original transform for genuinely flat old-shape input.

**New test file `src/lib/storage.freshInstall.test.ts`:** unit tests for
`resolveInitialExportVersion` (true fresh install -> current version; real
empty-but-persisted install with no version -> `"1.0"`; persisted version
always wins), plus two integration-style regression tests that build a
`DEFAULT_*`-sourced fresh-install-shaped object and run it through the real
`runDataMigrations` - one forcing `exportVersion: "1.0"` (the pre-fix
behavior, kept as a permanent stress test of the defense-in-depth fixes
above, independent of whether `resolveInitialExportVersion` itself stays
correct) asserting exactly 7 non-archived `PhaseDef`s and no double-nested
`prescribed`, and one at the real post-fix pinned version asserting a true
no-op.

**Verification performed:**
- `npm run test` -> 56/56 pass (51 prior + 5 new).
- `npm run check` -> 0 errors, 0 warnings, 374 files.
- `npx vite build` -> production build succeeds.
- Reproduced both bugs directly against `runDataMigrations` with the real
  `DEFAULT_*` constants before writing the fix (not just reasoned about
  abstractly), and re-ran the same reproduction after the fix to confirm
  both are resolved.
- **Manual verification not performed** (no browser tooling this session -
  same gap as Phase 3's own entry). The user's browser currently has
  already-corrupted data persisted at `exportVersion: "3.22"` (the
  corruption completed "successfully" per `assertMigrationInvariants`,
  which doesn't check phaseDef-count or prescribed-nesting - only
  workout/benchmark counts and typeId/phaseId resolvability, and the
  corrupted archived placeholders *are* self-consistent, just duplicated) -
  since the stored version already matches current, migrations won't
  re-run on their own to un-corrupt it. Told the user they need to clear
  storage **once more** now that the fix is in place for a clean reload to
  actually take effect.

**Commit:** made as its own commit, separate from Phase 3's own commit,
since this is a bugfix found and fixed after Phase 3 was already
committed.


