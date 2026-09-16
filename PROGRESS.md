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


