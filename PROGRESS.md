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

---

## 2026-09-16 — Post-Phase-3 UX redesign: Settings Customization tab restructured (user-directed)

**Context:** after Phase 3 landed and the fresh-install bugfix above was
committed, the user asked for the Customization tab to be reviewed as an
end user would see it, since the relationships between exercise
modalities, analytics categories, training phases, templates, and
benchmarks weren't explained anywhere in the UI. Two rounds of changes
followed, both user-directed, not independently decided:

1. **First pass (explainer text only, no restructuring):** added a "How
   These Fit Together" info panel at the top of the Customization tab,
   expanded each of the 5 existing sections' one-line descriptions to
   state what they're for and how they connect to the others, reordered
   sections to match the conceptual flow (exercises -> categories ->
   phases -> templates -> benchmarks), disambiguated the pre-existing
   "Reset to Default Library" button from the new Starter Template Library
   (renamed to "Reset ALL Phases to App Defaults"), and added a helper
   note on the Analytics Category field in the exercise editor.
2. **Second pass (structural redesign, explicitly requested):** the user
   asked to reduce the 5 stacked sections down to 3 clear topics
   (Exercises, Phases, Benchmarks), with Training Templates shown
   integrated into the Phases section (tapping a phase expands its
   templates inline) rather than as its own separate section with its own
   phase picker, and the Starter Template Library tucked under Phases as
   a single collapsible entry point rather than its own top-level card.

**Deviation from `PLAN.md`'s Phase 3 file list, flagged explicitly per
this session's own convention (checked with the user before writing this
entry, not silently noted):** `PLAN.md`'s Phase 3 "Concrete scope -
component changes" section names an exact file list for the Settings
split - `ExerciseTypeSettings.svelte`, `PhaseSettings.svelte`,
`TemplateSettings.svelte`, `BenchmarkTypeSettings.svelte`,
`AnalyticsCategorySettings.svelte`, `BackupSettings.svelte`,
`PreferencesSettings.svelte`, each routed to directly from a thin
`Settings.svelte` shell. The second-pass redesign no longer matches this
list:
- `TemplateSettings.svelte` was **deleted** - its single-phase session
  editor logic was extracted into a new `PhaseTemplateEditor.svelte`
  (rendered inline per expanded phase, not top-level), and its
  phase-picker/starter-library/reset-all responsibilities were absorbed
  into `PhaseSettings.svelte`.
- `AnalyticsCategorySettings.svelte` **still exists as a file** (kept, not
  deleted) but is **no longer routed to directly** from `Settings.svelte`
  - it's now nested inside a new `ExerciseSettings.svelte` wrapper
  alongside `ExerciseTypeSettings.svelte` behind a Modalities/Categories
  sub-tab toggle, since categories are purely chart-grouping metadata
  attached to modalities rather than an independent topic a user needs to
  navigate to separately.
- Two files not named in `PLAN.md` were added: `ExerciseSettings.svelte`
  (the Exercises card wrapper/sub-tab router) and
  `PhaseTemplateEditor.svelte` (the per-phase session editor).

  `PLAN.md` itself was **not** edited to reflect this - unlike the
  "Phase 1 scope gap-fills" precedent (where `PLAN.md` was updated in
  place because those were gaps *in the plan itself*, discovered before
  implementation), this is a post-hoc UX refinement made *after* Phase 3
  was already implemented and committed, decided directly with the user
  in conversation rather than a correction to what the plan should have
  said. A future session resuming from `PLAN.md` alone would see a stale
  file list for Phase 3's Settings split; this entry is the record of why
  it no longer matches.

**Verified no functional/data-model impact before treating this as safe:**
diffed every commit since Phase 3 landed (`git diff --stat 958fa4c..HEAD`,
the commit range covering both UX passes) and confirmed only files under
`src/components/settings/` changed - nothing in `types.ts`, `storage/`,
`stores/`, or the migration chain. `PhaseDef`, `WorkoutTemplate`, and the
`TrainingData` shape that Phase 4 depends on are unchanged. Checked
Phases 4-7's stated dependencies in `PLAN.md` and confirmed none reference
a specific Settings component file or path - Phase 4 depends on the
`PhaseDef` *type* and `planningStore`, both untouched by this redesign.

**Verification performed:**
- `npm run test` -> 56/56 pass (no test changes needed - purely UI,
  reused the same `loadStarterSet`/template-editing logic that already
  existed in the deleted `TemplateSettings.svelte`, just relocated).
- `npm run check` -> 0 errors, 0 warnings, 375 files.
- `npx vite build` -> production build succeeds.
- Manual verification handed to the user via the already-running dev
  server (same no-browser-tooling gap as every prior entry this session).

**Commit:** two separate commits, matching the two passes described above
- explainer-text-only, then the structural redesign - both after Phase 3's
  own commit and the fresh-install bugfix commit.

---

## 2026-09-16 — Phase 4 implemented: periodization science, load analytics

**Types (`src/lib/types.ts`):** Removed `PeriodizationWeek` entirely,
replaced by three new entities per PLAN.md:
- `TrainingBlock { id, name, phaseId, startWeekId, endWeekId, priority?, color? }`
  - a concurrent, possibly multi-week (and overlappable) training emphasis.
- `WeekOverride { weekId, customized }` - the flagged "what does `customized`
  mean once blocks can overlap" question, implemented exactly per the
  plan's recommended default (confirmed, not re-raised): a separate table
  decoupled from `TrainingBlock`, so "was this week manually edited" stays
  a per-week concern independent of "what training emphasis covers this
  week" (now a per-block concern).
- `CompetitionEvent { id, name, date, priority: "A"|"B"|"C" }`.
`Workout.blockId?: string` added (set at creation time from whichever block
covers the workout's `weekId`). `TrainingData.periodization` replaced by
`trainingBlocks`/`weekOverrides`/`competitionEvents`.

**Migration (`src/lib/storage/migrations.ts`):** Two new steps,
`DATA_EXPORT_VERSION` bumped `"3.22"` -> `"3.24"`:
- `3.22->3.23`: converts every `PeriodizationWeek` entry into a single-week
  `TrainingBlock` (`startWeekId === endWeekId === weekId`), naming the
  block from the resolved phase's name (falling back to `"Training Block"`
  if unresolvable - never drops the reference). Splits `customized: true`
  entries out into `WeekOverride` rows. Deletes `data.periodization`.
- `3.23->3.24`: adds `competitionEvents: []` (purely additive).
`assertMigrationInvariants` updated to check `TrainingBlock.phaseId`
resolution instead of the old `PeriodizationWeek.phaseId` check.

**Overlap/dominance logic (`src/lib/planning/trainingBlocks.ts`, new,
pure, unit-tested):** `getBlocksForWeek`/`getDominantBlockForWeek` - the
single mechanism every consumer (storage, stores, CSV/PDF export,
TrainingPlan.svelte) uses to resolve "what phase covers this week" now
that more than one block can. Judgment calls made here (not spelled out by
PLAN.md, which only said priority decides dominance and left the rest
open):
- Higher `priority` wins; **ties broken by whichever block is later in
  the array** (i.e. last-created wins) - arbitrary but deterministic.
- Week-id range comparison is plain string comparison (`"2026-W25"`-style
  ids sort correctly lexicographically, including across year boundaries,
  since the year prefix dominates the comparison) - no date parsing needed.

**Storage layer (`src/lib/storage/index.ts`) - preserving the existing
"quick assign a phase to a week" UX atop blocks:**
- `assignPhaseToWeek(weekId, phaseId)` now finds-or-creates the **single-week
  block for exactly that week** (`startWeekId === endWeekId === weekId`),
  leaving any other (multi-week) block that happens to also cover this week
  untouched. Workout generation still uses whichever block is *dominant*
  for the week (by priority), not necessarily the one just written - so if
  a higher-priority multi-week block already covers a week, quick-assigning
  a different phase to that single week updates its own block but the
  templates that actually generate workouts still come from the dominant
  block. Flagging this as a judgment call: PLAN.md left "what exactly
  triggers regeneration when overlapping blocks both generate workouts for
  the same week" as something to validate by using the feature, not something
  fully specified.
- `clearWeekData(weekId)` only removes **this week's own exact single-week
  block**, never a multi-week block that merely spans this week among
  others - clearing one week must not silently delete data for the other
  weeks a longer block covers.
- New `saveTrainingBlock`/`deleteTrainingBlock` (direct CRUD for real
  multi-week/overlapping blocks, distinct from the quick-assign path) and
  `saveCompetitionEvent`/`deleteCompetitionEvent`/`savePainLog`/`deletePainLog`
  (upsert-by-id, mirroring the existing `saveBenchmark`/`deleteBenchmark`
  pattern).

**Analytics module (`src/lib/analytics/loadAnalytics.ts`, new, pure,
exhaustively unit-tested with hand-computed values):**
- `calculateAcwrForWeeks`: ACWR-style acute (1-week) : chronic (trailing
  4-week average) load ratio + week-over-week ramp-rate, **bucketed by
  `Workout.weekId`/`loadFactor` rather than a continuous rolling daily
  window** - a deliberate simplification, since this codebase's data model
  (periodization, templates, the existing Rolling Load chart) is already
  week-oriented and workouts don't reliably carry a `date` until completed.
  `RAMP_RATE_SPIKE_THRESHOLD = 0.1` (10% week-over-week) and
  `ACWR_HIGH_RISK_RATIO = 1.5` are both documented, cited sports-science
  rules of thumb (Gabbett 2016 ACWR framework), kept as named, tunable
  constants per PLAN.md's explicit instruction not to treat them as gospel.
  Edge case decided: when the previous week's load is 0, ramp-rate is
  defined as 0 (no baseline to ramp from) rather than +Infinity.
- `calculateWorkoutAdherence`/`calculateWeeklyAdherence`: diffs
  `prescribed` vs `logged` per slot (completion %, load variance) - the
  feature the user specifically asked for, now unblocked by Phase 1.
- `findConsecutiveTrainingDayWarnings` (6+ consecutive completed-workout
  calendar days, `CONSECUTIVE_TRAINING_DAY_THRESHOLD = 6`) and
  `findRecoveryWarnings` (load spike + declining sleep-score/HRV or rising
  resting-HR week-over-week, using Phase 1's `DailyMetricEntry` system).
- `correlatePainWithLoadSpikes`: flags `PainLog` entries whose week (or the
  week before) had a load spike or a high ACWR ratio.

**New UI:**
- `WeekCalendar.svelte` (extracted from `TrainingPlan.svelte`, presentational
  only). Note: PLAN.md's phrase "calendar grid/DnD logic" doesn't apply
  literally here - the currently-committed `TrainingPlan.svelte` never had
  DnD (that only existed in the stashed, deferred dashboard WIP from before
  this refactor plan started - see the 2026-09-16 "Pre-Phase-0" stash
  entry) - so this extraction is grid-rendering only, nothing to preserve.
- `BlockManager.svelte`: CRUD for real multi-week/overlapping
  `TrainingBlock`s (name, phase, start/end week via native `<input
  type="week">`, priority), opened from a new toolbar button on
  `TrainingPlan.svelte`. The existing single-week phase-picker dropdown
  stays the fast path for the common case.
- `CompetitionCalendar.svelte`: list + add form for `CompetitionEvent`s,
  countdown to the next A-priority event, rendered at the bottom of the
  Training Plan view (this app has no separate "dashboard" view - `plan` is
  the closest thing to one).
- Pain-logging entry point added to `FatigueModal.svelte` (the
  workout-completion flow), per PLAN.md's first suggested option - an
  optional, collapsed "Log Pain / Discomfort" section (body part, severity,
  notes) that writes a `PainLog` via `trainingState.savePainLog` alongside
  the fatigue rating, without affecting `loadFactor`.
- `Analytics.svelte` gained `AcwrPanel`/`AdherencePanel`/
  `RecoveryWarningsPanel` (new files under `src/components/analytics/`).
  **Judgment call:** PLAN.md's phrasing suggests 4 separate panels
  (adherence, ACWR/ramp-rate, recovery warnings, injury-vs-load
  correlation); implemented as 3 - `RecoveryWarningsPanel` renders both
  recovery warnings *and* flagged pain-load correlations together, since
  both are "risk signal" lists rather than trend charts and a 4th
  near-empty panel felt like unnecessary structure. All 4
  `loadAnalytics.ts` functions are computed and exercised, just two share
  one panel. All three panels are scoped to the same visible ~12-week
  window `Analytics.svelte` already navigates (prev/next/today), not a
  full-history recompute - consistent with how the rest of that view
  already works.

**Manual verification:** unlike every prior phase this session, the user
*did* have the dev server open in a real browser this time and caught 3
real stacking/contrast bugs after this phase's UI landed, fixed
immediately (all in `WeekCalendar.svelte`/`TrainingPlan.svelte`) and
confirmed fixed by the user before commit:
1. The phase-picker dropdown (inside the selected-week card) rendered
   *under* the Competition Calendar section below it - the selected-week
   card has `backdrop-blur-sm` (a stacking-context trigger) but no
   `position`/`z-index` of its own, so its internal `z-20` dropdown never
   escalated above a later sibling card's own (separate) stacking context.
   Fixed by making the card `relative` and giving it `z-30` only while the
   dropdown is open.
2. A hovered week cell's tooltip rendered *under* the selected week's cell
   - the selected cell has an explicit `z-10`, while a hovered (non-selected)
   cell only gained a stacking context via its `hover:scale-110` transform,
   with no z-index of its own, so it always lost to the selected cell
   regardless of grid position. Fixed with `hover:z-20` on every cell.
3. The year-boundary marker (e.g. "2027") was unreadable (low contrast
   against the phase-colored cell, `text-content-subtle` on `text-content-subtle`-
   adjacent colors) and visually clipped by the row above it (it floated
   `-top-4`, i.e. 16px, above the cell, while the grid's row gap is only
   `gap-2`, 8px, so half its height necessarily sat inside the previous
   row's cell). Redesigned as a small solid-background pill
   (`bg-surface-elevated` + border) inset into the cell's own top-left
   corner (`-top-1.5 -left-1.5`) rather than floating text above it -
   readable against any cell color, and small enough to stay within the
   row gap instead of overlapping the row above.

**New tests:**
- `src/lib/storage.phase4.test.ts` (9 tests): the `PeriodizationWeek` ->
  `TrainingBlock` conversion (name resolution, fallback name, skip-if-no-
  phaseId, `customized` -> `WeekOverride` split, `competitionEvents`
  additive default), `assertMigrationInvariants`'s new block-phaseId check,
  and the full `old_backup.json` roundtrip.
- `src/lib/planning/trainingBlocks.test.ts` (8 tests): `getBlocksForWeek`/
  `getDominantBlockForWeek` range/overlap/priority/tie-break behavior.
- `src/lib/analytics/loadAnalytics.test.ts` (23 tests): every function with
  hand-computed expected values (not just "doesn't throw"), per PLAN.md's
  explicit DoD requirement - including the documented threshold constants
  themselves and the zero-previous-load ramp-rate edge case.
- Existing `storage.migrations.test.ts`/`storage.phase3.test.ts`/
  `storage.freshInstall.test.ts` assertions that checked the old
  `periodization`/`DATA_EXPORT_VERSION === "3.22"` shape were updated to
  the final `trainingBlocks`/`"3.24"` shape - same fixtures/behavior,
  correct final location (same reasoning as every prior phase's test-update
  entries).

**Verification performed:**
- `npm run test` -> 96/96 pass (56 prior, updated in place where the final
  shape changed + 40 new).
- `npm run check` -> 0 errors, 0 warnings, 386 files.
- `npx vite build` -> production build succeeds (same pre-existing >500kB
  chunk warning, unrelated to this phase).
- **Manual verification: performed by the user in a real browser this
  time** (dev server started this session at
  `http://localhost:5174/climbing-tracker/`) - caught and the 3 stacking/
  contrast bugs above, both fixed and re-confirmed working before commit.
  PLAN.md's other manual-test bullet (assigning overlapping blocks and
  confirming workout generation "behaves sensibly") was not separately
  walked through interactively beyond the fixes above - flagging this
  narrower gap explicitly rather than claiming full manual coverage.

**Explicitly not done here** (deferred, per PLAN.md's own framing): real
per-block DnD/drag-resize UI for `TrainingBlock` ranges (`BlockManager.svelte`
uses native week-picker inputs instead, not a calendar-drag interaction);
an archive-toggle UI for `CompetitionEvent`s (hard-delete only, matching
every other catalog's current behavior per Phase 1/3 precedent); Phase 5's
AI import pipeline, which is what will eventually let blocks/competitions
be generated from pasted AI output instead of only manual entry.

**Commit:** made as its own commit, referencing "Phase 4" per the plan's
convention.

---

## 2026-09-16 — Phase 5 implemented: AI import/export pipeline

**New module `src/lib/ai/schema.ts`:** hand-rolled runtime validators (no new
dependency, per PLAN.md's stated default) for `AIPlanOutput` and
`AIWorkoutLogOutput`. Deliberately **all-or-nothing**: if any required field
anywhere in the document is missing or the wrong type, the whole parse is
rejected (`valid: false`, no `data`) rather than importing the well-formed
parts - this is what makes "never silently commit anything on invalid
input" trivially true at the validation layer, and it's simple enough to
test exhaustively (see below). Deliberately permissive in the other
direction: unrecognized object keys anywhere (top-level, per-week/workout/
exercise, inside `values`) are silently ignored rather than rejected, since
LLMs routinely add extra commentary fields even when told not to and an
unknown key can't corrupt anything (it's never read). Numeric fields accept
a numeric string ("30") and coerce it, since LLMs often quote numbers.
`parseAIPlanOutput`/`parseAIWorkoutLogOutput` wrap `JSON.parse` so garbage/
non-JSON text and truncated input surface as one clear issue instead of
throwing. Also exports the exact prompt text embedding each schema
(`AI_PLAN_OUTPUT_INSTRUCTIONS`, `AI_WORKOUT_LOG_OUTPUT_INSTRUCTIONS`), so the
prompt shown to the user and the validator can't silently drift apart.

**New module `src/lib/ai/planImport.ts`:** pure, storage-free functions -
`buildPlanPreview` (what importing a validated plan would do against the
*current* catalog: per-week phase/workout/exercise counts, deduped
unresolved exercise-type/phase name lists) and `buildPlanCommit` (given the
plan plus the user's mapping choice for every unresolved name, produces
exactly what would be written: new `ExerciseTypeDef`/`PhaseDef` entries for
any "create" mappings, `TrainingBlock`s, and planned `Workout`s - never
touches storage itself). Matching-by-name is exact, case-insensitive only -
deliberately no fuzzy matching, to avoid surprising auto-links a user didn't
choose.

**Judgment call - `NameMapping` records must be keyed by `normalizeName(name)`,
not the raw display string:** found while writing `planImport.test.ts` -
if a plan referenced the same exercise/phase name with different casing in
different weeks (a real thing LLMs do), the mapping the user chose for the
first occurrence needs to also apply to the others. Made this an explicit,
documented contract (`normalizeName` exported, both `buildPlanCommit`'s
mapping params and `AIImportModal.svelte`'s state keyed by it) rather than
trying to match on the raw string.

**Judgment call - `TrainingBlock` grouping, not one block per week:** PLAN.md's
`TrainingBlock` is inherently a possibly-multi-week concurrent emphasis, and
an AI-generated plan naturally proposes runs of consecutive same-phase weeks
- so `buildPlanCommit` sorts the plan's weeks chronologically (weekId
strings sort correctly, per the existing Phase 4 precedent in
`trainingBlocks.ts`) and merges contiguous same-resolved-phase weeks into
one `TrainingBlock` each, using the new `getWeekIdRange`/`incrementWeekId`
helpers added to `dateUtils.ts` for this. Chose this over reusing
`planningStore.assignPhase` (the existing single-week "quick assign" path)
because that path also auto-generates workouts from the phase's *templates*
- which would either double up with or fight against the AI's own explicit
workouts for that week. `saveTrainingBlock` (already a normal, existing
Phase 4 domain service, "the concurrent-block / overlapping-emphasis editing
path" per its own PROGRESS.md entry) is the correct one to reuse here - it
just persists a block, no side effects to work around.

**New module `src/lib/ai/workoutLogImport.ts`:** the "paste free-text
training notes, get structured exercises" flow, reusing `AIExercise`/
name-resolution/`buildExerciseSlot` from `planImport.ts` (exported for
this). Its target is a single in-progress workout's exercise list
(`WorkoutForm.svelte`), not the whole calendar, so every exercise from every
parsed "workout" in the JSON is flattened into one slot list - matching
PLAN.md's own framing ("targeting a single workout's exercises instead of a
whole plan"). `bucket: 'prescribed' | 'logged'` selects which `ExerciseSlot`
field the parsed values land in, mirroring `WorkoutForm.svelte`'s existing
`exerciseFormMode` distinction from Phase 1.

**New component `src/components/plan/AIImportModal.svelte`:** paste -> live
validate (on every keystroke, cheap) -> preview/diff -> per-unresolved-name
mapping (dropdown: map to an existing catalog entry, or create new,
defaulting to "create" but always visibly listed before commit, never
silent) -> "Confirm Import" (disabled until the parse is valid and there's
at least something to import) -> commit. Two modes sharing one component and
one pipeline:
- `mode="plan"` (opened from a new button on `TrainingPlan.svelte`, next to
  the existing "Generate AI Prompt" button): commits directly via
  `trainingState.updateExerciseTypes`/`updatePhaseDefs`/`saveTrainingBlock`/
  `saveWorkout` - the normal domain services, never a special-cased write
  path, per PLAN.md's explicit requirement.
- `mode="workoutLog"` (opened from a new button in `WorkoutForm.svelte`'s
  exercise list header, next to "Add Exercise"): only persists newly-created
  exercise types (a global catalog concern) via the same service; the
  resolved `ExerciseSlot[]` are handed back to `WorkoutForm` via
  `onImportWorkoutLog`, which appends them to the in-progress workout's
  local `$state` - not written to storage until the user finishes/saves that
  form through the existing flow, since there is no "append to an
  already-open workout" storage action and shouldn't be one.

**`AIPromptModal.svelte` changes (PLAN.md's explicit scope):**
- New third tab, "Context Only": exports the same condensed training
  profile as the other two modes but with no coaching prompt/instructions
  attached, for pasting into any LLM to ask free-form questions.
- "Generate Plan"'s prompt text now ends with `AI_PLAN_OUTPUT_INSTRUCTIONS`
  (the exact JSON shape + rules, imported from `schema.ts`) instead of the
  old "Please provide a JSON or clear text format..." line - replacing the
  too-loose-to-validate-against instruction PLAN.md called out by name.
- Small refactor while already touching this function: extracted the
  inline week-range-building loop into `dateUtils.ts`'s new
  `getWeekIdRange`/`incrementWeekId` (also used by `planImport.ts`'s block
  grouping) - same 52-weeks-per-year approximation as before, just no longer
  duplicated in two places.

**Bug found and fixed while touching this file (not scope creep - directly
in the function this phase was already rewriting):** `handleCopyPrompt` had
`const data = await storage.exportData();` whose result `data` was never
referenced anywhere else in the function - the actual prompt text is built
entirely from `trainingState`, already in memory. `storage.exportData()`
doesn't return prompt data at all (`Promise<void>`) - it performs a full
*file download* (web) or opens the native OS *share sheet* (Capacitor) as a
side effect. This meant every click of "Copy Prompt" in the shipped app was
**also silently triggering a full backup export/download or a native share
dialog**, unrelated to what the button says it does. Confirmed by reading
`storage.exportData`'s implementation (`src/lib/storage/index.ts`), not
just inferred from the unused variable. Fixed by deleting the call - the
function only ever needed `trainingState`, which was already available.

**Tests** (`src/lib/ai/schema.test.ts`, `planImport.test.ts`,
`workoutLogImport.test.ts` - 53 new, all passing): per PLAN.md's explicit
DoD ("test missing fields, wrong types, extra fields, and unresolvable
exercise-type names" - not just happy path), `schema.test.ts` covers:
non-object top-level input, missing `weeks`/`workouts` arrays, missing
`weekId`/`phaseName`/`exerciseTypeName`, malformed `weekId` format,
empty-string required fields, non-numeric values for numeric fields
(including a boolean), a string where a `string[]` field is expected, mixed
-type arrays, invalid `dayOfWeek` values, a wrong-type `values` object,
garbage non-JSON text, empty input, truncated JSON, and JSON wrapped in
markdown code fences (deliberately *not* auto-stripped - surfaced as an
error rather than silently guessing intent) - plus that every issue in a
multi-problem document is collected, not just the first, and that unknown/
extra fields and numeric-string coercion are tolerated. `planImport.test.ts`/
`workoutLogImport.test.ts` cover: case-insensitive exact-name matching (and
that it does *not* fuzzy-match), unresolved-name dedup across
differently-cased occurrences, "map to existing" vs. "create new" for both
exercise types and phases, that a "create" for a name repeated across
multiple exercises/workouts reuses the same new id (not one per occurrence),
contiguous-same-phase-week grouping into one `TrainingBlock` (including
out-of-order input weeks sorting correctly first), determinism, and that the
catalog inputs (`exerciseTypes`/`phaseDefs`) are never mutated.

**Verification performed:**
- `npm run test` -> 149/149 pass (96 prior, unchanged + 53 new).
- `npm run check` -> 0 errors, 0 warnings, 393 files. (One round-trip fix
  needed: `AIImportModal.svelte`'s `<select>` bindings originally read
  `mapping?.id` directly off the `NameMapping` union, which only the `"map"`
  variant has - `svelte-check` correctly rejected this; replaced with a
  `mappingSelectValue()` helper that narrows on `.action` first.)
- `npx vite build` -> production build succeeds (same pre-existing >500kB
  `Settings` chunk warning as every prior phase, unrelated to this one; new
  `AIImportModal` chunk is 24kB/7.6kB gzipped).
- **Manual verification: handed to the user by their own request** - two
  dev servers were already running from earlier sessions
  (`localhost:5173`/`5174`, confirmed responding), left running so Vite's
  HMR picks up this phase's changes automatically. The user asked to test
  the "Generate Plan" -> real LLM -> "Import AI Plan" round trip themselves
  rather than have this session attempt browser automation - this is a
  deliberate handoff, not a gap being silently claimed as done. PLAN.md's
  manual-test bullets (run a real "Generate Plan" prompt through a real LLM,
  paste the result back in, confirm the preview is accurate, confirm
  nothing writes until confirmed, confirm an unresolvable exercise-type name
  is surfaced rather than silently dropped/invented) are **not yet
  confirmed in the running app** as of this entry.

**Explicitly not done here** (deferred, consistent with PLAN.md's own
framing or out of this phase's stated scope): fuzzy/approximate name
matching (exact case-insensitive only, by design - see above); an
archive-aware mapping UI (the "map to existing" dropdowns only list
non-archived catalog entries, matching every other picker in this app since
Phase 1/3); a `zod`-based (or other schema-library) rewrite of the
validators (hand-rolled was PLAN.md's stated default, taken as-is).

**Commit:** made as its own commit, referencing "Phase 5" per the plan's
convention.

---

## 2026-09-17 — Phase 6 scoping: read PLAN.md/PROGRESS.md, confirmed Phase 5 committed, inspected real `data.csv`

Confirmed via `git log` that `68e57db "Phase 5: AI import/export pipeline"` is
the tip of `refactor/full-plan` and the tree is clean - Phase 5 is fully
committed, nothing in-flight. Re-read `PLAN.md`'s Phase 6 section in full
before writing any code, per its own "read the whole phase before
implementing" instruction.

**`data.csv` (repo root, untracked, real personal 8a.nu export) inspected
directly, not guessed** - per the user's explicit instruction not to
guess/invent the 8a.nu column format. Real header (19 columns):
`route_boulder,name,location_name,sector_name,area_name,country_code,date,type,sub_type,rating,project,tries,repeats,difficulty,perceived_hardness,comment,height,recommended,sits`.
Cross-checked several data rows against the header positionally to confirm
field meaning (e.g. `difficulty` is the actual grade string, `"6A"`/`"7A"`,
not `rating`; `type` holds short ascent-style codes, `"f"`/`"rp"` observed in
the sample; missing numeric fields are exported as the **literal string**
`"null"`, not an empty field or real `null` - the parser must treat that
string as absent).

**Per the user's explicit instruction, `data.csv` is not being used as a
committed test fixture and has not been added to git** - the open question
of whether real personal outdoor-climbing data like this belongs in git
history at all is still theirs to decide, not assumed. Sidestepped rather
than blocked on: the CSV parser's tests use small, hand-written synthetic
CSV strings that match the real header/quoting/`"null"`-sentinel format
confirmed above, not the real file - same "safe to hand-construct" allowance
`PLAN.md`'s Prerequisite step already established for low-complexity
fixtures. `data.csv` itself stays untracked in the working tree, read only,
never staged.

**Judgment calls made before implementation (not spelled out by `PLAN.md`,
which left the `OutdoorAscent` shape as an illustrative example and the
bodyweight UI's exact location as "implementer's call" - flagging rather
than silently deciding):**
- **`OutdoorAscent` fields extended slightly beyond `PLAN.md`'s illustrative
  `{ id, date, name?, grade, style?, notes? }`**: added `crag?: string`
  (from `location_name`) since a route/boulder name with no crag context is
  close to useless in a log a user will scroll back through, and mapped
  `type`'s short code (`f`/`rp`/...) into `style` as a readable label rather
  than storing the raw code. Deliberately did **not** add `tries`/`repeats`/
  `rating`/`height`/`sector_name`/`area_name`/`country_code`/`sits` -
  `PLAN.md` is explicit this is "a lightweight log... not a pyramid-builder
  or gym-grade tool," and those fields drift toward exactly that.
- **Ascent-style code mapping is best-effort, not exhaustive**: only `"f"`
  (Flash) and `"rp"` (Redpoint) are confirmed from the real sample. Added
  `"o"`→Onsight as a commonly-known third 8a.nu code, but since it wasn't
  observed in the real sample, the mapping falls back to showing the raw
  code (uppercased) for anything unrecognized rather than guessing further
  codes or dropping the field.
- **Bodyweight UI location: new `src/components/health/` folder** (one of
  the two options `PLAN.md` explicitly left open), with a thin
  `HealthSettings.svelte` wrapper under a new Settings tab - mirrors the
  existing `ExerciseSettings.svelte` (domain component(s) + settings-tab
  wrapper) pattern rather than inventing a new structure.
- **Re-used the same `src/components/health/` + `HealthSettings.svelte` tab
  for the CSV importer too**, rather than putting it in `BackupSettings.svelte`
  alongside JSON/ICS export - it's a domain data source (outdoor ascents),
  not a backup mechanism, and both new features are "personal health/outdoor
  log" concerns that belong together.
- **Found and fixed a real, pre-existing gap while wiring bodyweight
  storage, not scope creep**: `metricDefs` has never had a `DEFAULT_METRIC_DEFS`-
  style seed in `persistence.ts`'s `initDB` (unlike every other catalog -
  `templates`/`phaseDefs`/`exerciseTypes`/`benchmarkTypes`/`analyticsCategories`
  all default from a `DEFAULT_*` constant, `metricDefs` has only ever
  defaulted to `[]`). Combined with the Post-Phase-3 fresh-install fix (a
  true fresh install now skips the whole migration chain, including the
  `3.17→3.18` step that seeds `sleep-score`/`hrv`/`rhr`), this means **every
  fresh install today gets zero built-in `MetricDef`s** - not just missing
  `bodyweight` for this phase, but a real, currently-shipping gap for the
  three Phase-1 metrics too. Confirmed directly (not assumed): grepped for
  `"sleep-score"`/`DEFAULT_METRIC_DEFS` across `src/` and found no seed path
  besides that one migration step. Fixed by adding a `DEFAULT_METRIC_DEFS`
  constant (`constants.ts`, all four built-in ids) used as `persistence.ts`'s
  `metricDefs` default - purely additive, no migration involved, matches the
  existing pattern for every sibling catalog. The historical `3.17→3.18`
  migration step itself is left untouched (frozen, per Phase 0 discipline) -
  this fix only changes what a **fresh** install starts with, not any
  migration step's behavior for existing users.
- **Bodyweight entry UI also defensively calls a new `ensureMetricDef`
  helper before first save** (find-or-create the `bodyweight` `MetricDef` by
  id), rather than relying solely on the `DEFAULT_METRIC_DEFS` fix above or
  the new migration step - belt-and-suspenders for any install state that
  slips through both (e.g. a pre-Phase-6 install that already has some
  `metricDefs` populated, from a currently-committed version, sitting
  between the last migration step it ran and this phase's new one, or
  simply as a general defensive pattern given how many ways this exact class
  of bug has already shipped once this session - see the Post-Phase-3 entry
  above).

---

## 2026-09-17 — Phase 6 implemented: bodyweight tracking, extended PDF coach report, 8a.nu CSV import

**Types (`src/lib/types.ts`):** Added `OutdoorAscent { id, date, name?, grade, style?, crag?, notes? }` (fields extended slightly beyond `PLAN.md`'s illustrative shape - see the scoping entry above) and added it to `TrainingData.outdoorAscents`. No new type needed for bodyweight - it's a `DailyMetricEntry` against the new `bodyweight` `MetricDef`, per `PLAN.md`'s explicit scope note.

**Migration (`src/lib/storage/migrations.ts`):** Two new steps, `DATA_EXPORT_VERSION` bumped `"3.24"` -> `"3.26"`:
- `3.24->3.25`: seeds the built-in `bodyweight` `MetricDef` (idempotent, same `find-or-push` pattern as every prior built-in-catalog seed step).
- `3.25->3.26`: adds `outdoorAscents: []` (purely additive).

**Storage (`src/lib/storage/persistence.ts`, `src/lib/storage/index.ts`):** `outdoorAscents` plumbed through `initDB`/`flushDB` (web `localforage` key + included automatically in the native `_dbState` JSON blob) and `importData`. New accessors mirroring existing patterns: `getOutdoorAscents`/`saveOutdoorAscents`/`saveOutdoorAscent` (upsert-by-id, like `savePainLog`)/`addOutdoorAscents` (batch-append, for CSV import)/`deleteOutdoorAscent`; `saveDailyMetric`/`deleteDailyMetric` (upsert-by-id, new - `metricsStore` previously only had bulk `updateDailyMetrics`); `ensureMetricDef` (find-or-create, defensive - see the scoping entry above). Also fixed the `DEFAULT_METRIC_DEFS` fresh-install gap described in that entry.

**New store `src/lib/stores/outdoorAscentStore.svelte.ts`** (load/save/add-batch/delete), wired into the `state.svelte.ts` facade alongside new `saveDailyMetric`/`deleteDailyMetric`/`saveOutdoorAscent`/`addOutdoorAscents`/`deleteOutdoorAscent` actions (each following the existing `store action -> refresh()` pattern). `metricsStore` gained matching `saveDailyMetric`/`deleteDailyMetric`/`ensureMetricDef` methods.

**New parser `src/lib/importers/outdoorAscentCsvImport.ts`:** hand-rolled RFC4180-ish CSV row parser (quoted fields, `""`-escaped quotes, embedded commas, matching the "no new dependency" convention from Phase 5's `schema.ts`) plus `parseOutdoorAscentCsv`, which looks up columns **by header name** (not position, so a reordered/extra-column future export still works) and requires `date`+`difficulty` to be present. Treats the literal string `"null"` (confirmed 8a.nu's real missing-value sentinel, not an empty field) and blank fields as absent. Never fabricates a row missing `date`/`grade` - skips it and reports why (`{ line, reason }`), same "surface, don't silently drop" discipline as Phase 5's AI import. Ascent-style codes (`type` column) mapped to a readable label (`f`->Flash, `rp`->Redpoint, `o`->Onsight - only `f`/`rp` confirmed from the real sample, see scoping entry) with a raw-code fallback for anything unrecognized.

**New UI (`src/components/health/`, per the scoping decision above):**
- `BodyweightLog.svelte`: date+weight form (upsert-by-date - re-logging the same day updates it rather than duplicating), a small hand-rolled bar chart of the last 12 entries (matching `AcwrPanel.svelte`'s existing bar-chart style rather than introducing a charting library - this codebase has no actual Chart.js dependency despite the stale About-tab credit text, confirmed by inspecting `AcwrPanel.svelte`), and a delete-able list.
- `OutdoorAscentImport.svelte`: file picker -> `parseOutdoorAscentCsv` -> preview (count to import / skipped rows with reasons) -> **dedup against already-logged ascents** (composite key: date+name+grade+style) so re-importing the same/an updated export doesn't duplicate everything - a judgment call, not spelled out by `PLAN.md`, made because a real 8a.nu CSV export is a full history re-export, not a delta -> confirm -> commit; plus a delete-able list of logged ascents.
- `HealthSettings.svelte` (`src/components/settings/`): thin wrapper hosting both, added as a new "Health & Outdoor Log" tab in `Settings.svelte` (new `SettingsTab` value, overview card, tab routing) - same "domain component + settings-tab wrapper" pattern as `ExerciseSettings.svelte`.

**`ExerciseForm.svelte`:** the `bodyweightPercent` slider now shows a computed `≈ X kg` hint next to the percentage, using the most recently logged bodyweight entry (PLAN.md's "if convenient" bullet) - display-only, doesn't change what's stored (still a %, same as before Phase 6).

**`PDFExportModal.svelte`:** extracted the existing inline week-range-building logic into its own `targetWeekIds` derived (previously computed and used only inside `selectedWorkouts`) so a new `reportAnalytics` derived could reuse it. Added three report sections built on Phase 4's `loadAnalytics.ts` (adherence summary, ACWR/load trend, injury/pain summary), rendered before the existing week-by-week listing, matching `PLAN.md`'s exact three-section list. Each section only renders when it has data (e.g. no adherence rows for a range with no completed workouts) rather than printing an empty table.

**Bug found and fixed during manual verification (not scope creep - directly in the new code this phase wrote):** `OutdoorAscentImport.svelte`'s "Confirm Import" threw `Failed to execute 'put' on 'IDBObjectStore': #<Object> could not be cloned` - `newAscents` is a `$derived` value, and passing the resulting reactive Svelte proxy straight into `trainingState.addOutdoorAscents(...)` fails IndexedDB's structured-clone step inside `localforage`. Fixed by snapshotting at the call site (`$state.snapshot(newAscents)`), matching this codebase's existing, established convention for every other `trainingState.save*` call site that passes a locally-built/derived object (confirmed via `grep -rn 'state\.snapshot'` - `Settings.svelte`, `BenchmarkForm.svelte`, `CompetitionCalendar.svelte`, `BlockManager.svelte`, `workoutStore.svelte.ts`, `uiStore.svelte.ts` all already do this). `BodyweightLog.svelte`'s `entry` object didn't need the same fix - it's built from plain primitive fields (an `existing?.id` string read, not the reactive object itself), not a `$derived` array/object passed through wholesale.

**Manual verification: performed this session** (a display *and* a working headless-Chromium driver were both available - `chromium-cli` wasn't installed, but `google-chrome` was present system-wide and `npx playwright` could drive it directly via `channel: 'chrome'`; installed as an ephemeral `--no-save` dependency, removed afterward, `git status` confirms `package.json`/`package-lock.json` are untouched). Drove the actual running app end-to-end, not just unit tests:
- Logged a bodyweight entry via the new Settings tab; confirmed it persisted and displayed correctly (`Latest: 74.5 kg`) after navigating away and back.
- Imported a synthetic (hand-written, not `data.csv`-derived) CSV matching the real 8a.nu column format: confirmed the preview correctly reported "2 ascents will be imported" / "1 row could not be read: Line 4: Missing difficulty/grade", confirmed the imported ascents display with the correct resolved style labels (Flash/Redpoint) and crag - this run is what caught the `$state.snapshot` bug above; re-ran after the fix and confirmed a clean import with zero console errors.
- Logged an 80kg bodyweight entry, then opened the exercise form for the default "Max Hangs" exercise type (which has `bodyweightPercent` as an active default parameter) and confirmed the new "≈ 80.0 kg" hint renders correctly at the default 100%.
- Opened the PDF export modal and generated a PDF (empty-data case - no completed workouts/pain logs exist in this fresh browser session, so the new "Training Summary" section correctly renders nothing per its own guard rather than an empty table) - confirmed the download fires and zero console errors, i.e. the new `loadAnalytics.ts` wiring doesn't throw even on the empty-input edge case. The report sections' actual *values* are not independently re-verified here beyond that - they call the same `calculateAcwrForWeeks`/`calculateWeeklyAdherence`/`correlatePainWithLoadSpikes` functions Phase 4's `loadAnalytics.test.ts` already exhaustively covers with hand-computed expected values, so correctness of the numbers themselves rests on that existing coverage, not a fresh manual check of PDF output with populated data.
- Checked the browser console for errors after every step above (`page.on('pageerror'/'console')`) - clean except for the one bug found and fixed.

**Verification performed:**
- `npm run test` -> 166/166 pass (149 prior + 10 new `outdoorAscentCsvImport.test.ts` + 7 new `storage.phase6.test.ts`; 6 pre-existing `storage.migrations.test.ts` version-literal assertions updated from `"3.24"` to `"3.26"`/current-shape - same reasoning as every prior phase's test-update entries, not new tests).
- `npm run check` -> 0 errors, 0 warnings, 400 files.
- `npx vite build` -> production build succeeds (same pre-existing >500kB `Settings` chunk warning as every prior phase, now larger due to the new Health tab components - unrelated to correctness).

**Explicitly not done here** (deferred, consistent with `PLAN.md`'s own framing or this session's scoping decisions): committing `data.csv` (real personal data) as a fixture - the user's call to make, not assumed (see the scoping entry above); an outdoor-ascent-vs-training-load analytics panel - `PLAN.md`'s Phase 6 "Concrete scope" only lists the bodyweight UI/PDF sections/CSV importer, the "correlating outdoor performance" framing is the *why*, not a listed deliverable; fuzzy/partial matching in the CSV import's duplicate-detection (exact composite-key match only, same "no surprising auto-links" reasoning Phase 5 used for AI-import name matching).

**Commit:** made as its own commit, referencing "Phase 6" per the plan's convention.

---

## 2026-09-17 — Phase 7 scoping: health platform import descoped, plugin maintenance check performed first

Confirmed via `git log` that `67eefdd "Phase 6: bodyweight tracking, extended PDF coach report, 8a.nu CSV import"` is the tip of `refactor/full-plan` and the tree is clean (only the pre-existing untracked `data.csv`, unrelated). Re-read `PLAN.md`'s Phase 7 section before writing code, per its own convention, and per the kickoff instruction did the maintenance-status check on Capacitor HealthKit/Health Connect plugin options *before* picking one, rather than defaulting to a name.

**Maintenance-status check performed** (`npm view`, before any dependency was added — nothing was installed at any point this session): compared four candidates for querying npm's registry metadata directly.
- `capacitor-health` (mley/capacitor-health) — v8.2.0, 21 published versions, zero runtime deps, `peerDependencies: "@capacitor/core": ">=8.0.0"` (matches this repo's installed `@capacitor/core@8.4.0`), published via GitHub Actions CI 4 weeks before this check — the strongest maintenance signal of the four, and the only one actively tracking Capacitor's current major version.
- `@perfood/capacitor-healthkit` — v1.3.2, last published 2025-02-13 (over a year stale as of this check), peer dep pinned to `@capacitor/core: ^4.0.0`, iOS-only (no Health Connect/Android coverage).
- `capacitor-health-connect` — v0.7.0, last published 2024-08-29, peer dep pinned to `@capacitor/core: ^5.0.0`, Android-only.
- Two other plausible package names guessed before searching (`@kompanions/capacitor-health-connect`, `capacitor-plugin-healthkit`, `health-connect-capacitor`) don't exist on npm at all (404) — noted so a future session doesn't re-try them.

Based on maintenance status alone, `capacitor-health` was the clear pick — but before adding it, fetched its README (`mley/capacitor-health` on GitHub) to confirm it actually covers the three metrics this plan needs (sleep score, HRV, resting heart rate). **It does not.** Its actual supported data surface is: aggregated steps/active-calories/mindfulness, individual step and body-composition (weight/height/body fat/lean mass) records, and workouts with optional embedded heart-rate samples during the workout — no standalone sleep, HRV, or resting-HR reads at all. So even the best-maintained candidate would have required building against a different, less-maintained, single-platform plugin to get the actual target metrics, which materially changes this phase's risk profile from what `PLAN.md` assumed.

Reported this finding to the user before proceeding further, and separately, **the user pointed out their own phone doesn't support syncing Garmin into Health Connect** — invalidating the plan's original framing that Health Connect/HealthKit import would cover Garmin data indirectly (see `PLAN.md`'s locked-in-scope section, now updated). Between the metric-coverage gap and the device-level Garmin-sync gap, **the user decided to drop health platform import from this plan entirely**, not just defer plugin selection. `PLAN.md`'s Phase 7 section and its top-of-file "Garmin integration" scope note have been updated in place to reflect this (not just logged here, since it's a scope change to the plan itself, matching how earlier gap-fills were handled).

**Phase 7 is now scoped down to local push notifications only** (fatigue-log reminder after a planned workout's start time passes without completion), using `@capacitor/local-notifications` — confirmed on npm as v8.3.1, published 2026-08-19, peer dep `@capacitor/core: ">=8.0.0"` (matches installed 8.4.0), the official first-party Capacitor plugin `PLAN.md` already named for this part (no research question there — the plan only flagged the *health* plugin choice as open).

**No code or dependency changes were made before this decision** — `git status`/`git diff --stat` confirmed clean (only the known pre-existing untracked `data.csv`) immediately before this entry, so nothing needs reverting.

---

## 2026-09-17 — Phase 7 implemented: local fatigue-log reminder notifications

**Dependency:** added `@capacitor/local-notifications@^8.3.1` (the official first-party plugin `PLAN.md` already named for this part — no research question there, unlike the now-dropped health plugin). Confirmed via `npm audit --omit=dev` before and after (`git stash`/`stash pop`) that this adds zero new vulnerabilities — the 17 dev-only vulnerabilities `npm install` reports are pre-existing (Capacitor CLI tooling's own transitive deps, e.g. `xcode`/`uuid`), identical with or without this package; production deps stay at the same single pre-existing `dompurify` moderate advisory. Ran `npx cap sync android` afterward so the local (gitignored, untracked per `.gitignore`) `android/` project picks up the plugin for the user's own manual device test — confirmed the plugin declares its own permissions/receivers in its own `AndroidManifest.xml` (merged by Gradle at build time), nothing needed adding to the app's manifest by hand. No `ios/` project exists in this checkout to sync.

**New module `src/lib/notifications/fatigueReminder.ts`** (pure logic + guarded plugin calls, no new store needed - this doesn't touch `TrainingData`/migrations at all, unlike every prior phase):
- `computeFatigueReminderTime(workout)`: scheduled start (resolved via `ics.ts`'s existing `getDateFromWeekId`, now exported for reuse rather than reimplemented) + estimated duration (reusing `ics.ts`'s existing `calculateWorkoutDuration`, also newly exported) + a fixed `FATIGUE_REMINDER_BUFFER_MINUTES = 20` buffer. Documented as a tunable default, not a considered constant - same framing Phase 4 used for its ACWR ramp-rate threshold. Returns `null` for workouts with no resolvable `weekId`.
- `workoutReminderId(workoutId)`: a simple string hash mod into the 32-bit-int range `local-notifications` requires for its numeric `id` field (workouts use string ids). Collisions are possible but low-consequence and not worth a persisted mapping table, since scheduling is fully reconciled from scratch on every sync (see below), not incrementally patched.
- `checkNotificationPermission`/`requestNotificationPermission`: thin wrappers, `'denied'` on web without touching the plugin at all (guarded on `Capacitor.isNativePlatform()`, matching the existing pattern in `storage/persistence.ts`).
- `syncFatigueReminders(workouts)`: cancels every currently-pending notification (this feature is the only `LocalNotifications` user in the app, so "all pending" is always "all of ours" - a deliberate simplify-over-diff choice, noted in the code) and reschedules one per `status: "planned"` workout whose computed reminder time is still in the future. No-ops on web or without granted permission, so it's always safe to call unconditionally.
- Each scheduled notification sets `isExactNotification: false` - a judgment call, not spelled out by `PLAN.md`: v8.3's default (`true`) would open Android's system "Alarms & reminders" settings screen the first time a notification schedules if exact-alarm permission isn't already granted, which is disproportionate UX for a "sometime after your session" reminder that doesn't need minute-level precision.

**Wiring (`src/lib/stores/uiStore.svelte.ts`, `src/lib/state.svelte.ts`, `src/App.svelte`):** followed the existing `theme` preference's pattern exactly (a `localStorage`-persisted, non-`TrainingData` device preference, not something that goes through migrations/export-import) rather than inventing a different mechanism for this one setting:
- `UiStore` gained `notificationsEnabled`/`notificationPermission` state (persisted to `localStorage`, same key-naming convention as `boulder_tracker_theme`), `setNotificationsEnabled(enabled)` (requests permission on enable, reverts to disabled if denied rather than claiming success), and `maybePromptForNotifications()` (a one-time first-run in-app confirm via the existing `showConfirm`/`Dialog` utility, gated by its own `localStorage` "already asked" flag so a decline is never re-prompted - `PLAN.md`'s explicit "respect denial gracefully").
- `TrainingState.refresh()` (the facade) now calls `syncFatigueReminders(this.workoutStore.workouts)` after loading, but only when `notificationsEnabled` is true, wrapped in try/catch so a plugin error can't break the app's data refresh. Since every existing mutating action (`saveWorkout`, `deleteWorkout`, `duplicateWorkout`, etc.) already calls `refresh()` afterward, this reconciles scheduled reminders automatically on every relevant change without needing separate schedule/cancel calls threaded through each action individually.
- `App.svelte` calls `trainingState.maybePromptForNotifications()` from a `$effect` once `isLoading` is false - safe to fire on every load since the function itself no-ops after the first time (checked via its own `localStorage` flag, written synchronously before the first `await`, so re-entrant calls from the same effect re-running don't double-prompt).

**New Settings UI (`src/components/settings/PreferencesSettings.svelte`):** a "Notifications" section with a single toggle button (matching the existing theme-picker buttons' visual style exactly), shown only when `Capacitor.isNativePlatform()` is true - hidden entirely on web rather than shown as a dead control, since there's nothing for it to do there. Denial while enabling shows an alert pointing the user at device Settings, via the same `showAlert` utility used elsewhere.

**Testing approach, per this session's kickoff instruction to rely on unit tests and skip browser automation this phase:** `src/lib/notifications/fatigueReminder.test.ts` (15 tests) covers all the pure/orchestration logic without any native runtime, using `vi.mock` for both `@capacitor/core` (`Capacitor.isNativePlatform`) and `@capacitor/local-notifications` (`checkPermissions`/`requestPermissions`/`getPending`/`cancel`/`schedule`): `workoutReminderId`'s determinism/range, `computeFatigueReminderTime`'s date-math (including the no-`weekId`/no-`startTime` edge cases), permission-check pass-through and the non-native short-circuit, `cancelAllFatigueReminders`'s no-op-when-empty and cancel-by-id behavior, and `syncFatigueReminders`'s full matrix (non-native no-op, permission-denied no-op, completed/past-due workouts skipped, and the cancel-then-reschedule happy path asserting the exact `schedule()` payload). No UI component tests were written for the Settings toggle or the first-run prompt - both are thin orchestration over `uiStore`/`trainingState` methods that are themselves covered indirectly by the module tests, and per this phase's own risk framing (`PLAN.md`: "can't be fully validated outside real devices"), the real verification for the UI/permission-flow/notification-actually-fires path is the user's own manual device test, not something browser automation could meaningfully substitute for anyway (there is no headless "receive a native OS notification" story).

**Verification performed:**
- `npm run test` → 181/181 pass (166 prior + 15 new).
- `npm run check` → 0 errors, 0 warnings, 404 files.
- `npx vite build` → production build succeeds (same pre-existing >500kB `Settings` chunk warning as every prior phase).
- `npx cap sync android` → succeeds, confirms the plugin registers correctly for the local Android project.
- **Manual device verification not performed this session, by design** - per `PLAN.md`'s own Definition of Done for this phase ("Manual test on an actual iOS and/or Android device... since this phase is inherently native") and this session's kickoff instruction to skip browser-automation testing and let the user verify manually. Left undone, not claimed: notification actually firing at the expected time, permission-denial not crashing the app, and the first-run prompt's real on-device appearance/behavior all need the user's own device test.

**Explicitly not done here** (out of this phase's now-descoped scope, or a deliberate simplicity choice, not an oversight): health platform import (dropped, see the scoping entry above); persisting a workout-id -> notification-id mapping table (accepted the low-probability hash-collision risk instead, see above); diffing/patching individual scheduled notifications instead of cancel-all-then-reschedule-all (simpler and safer for a purely local, infrequent operation, at the cost of some redundant plugin calls); iOS setup, since no `ios/` project exists in this checkout - the plugin is cross-platform and works from the same code path, but there's nothing local to sync/verify for it here.

**Commit:** made as its own commit, referencing "Phase 7" per the plan's convention.

---

## 2026-09-18 — UI overhaul Stage 0: design system tokens + preferences store

Read `UI_PLAN.md` in full, plus `PLAN.md`'s "Context & conventions" section and `PROGRESS.md`'s tail, per this session's kickoff instruction and both files' own "read before implementing" convention. Confirmed via `git log`/`git status` that `2b391d9` (Phase 7) is the tip of `refactor/full-plan` and the tree was clean before starting (only the pre-existing untracked `data.csv`). Implemented §3 (Design system) and §5.1 (Preferences store) of `UI_PLAN.md` - Stage 0 only, per its own Sequencing table. No schema change, no behaviour change to any logic - this is tokens, class names, and one new device-local preferences module.

**Design tokens (`src/app.css`):**
- Type ramp (§3.1): `--text-display/metric/title/section/body/label/caption`, each a Tailwind `--text-*` theme key with paired `--text-*--font-weight`/`--text-*--letter-spacing` (confirmed this pairing is supported by building a throwaway test case against the installed `@tailwindcss/cli` before relying on it - Tailwind 4.3's font-size utilities do carry weight/tracking). Sizes are indirected through a `--typescale-*` layer so `data-text-scale="sm|md|lg"` can override them; `--typescale-caption` is `11px` at every scale - the hard floor never moves. Verified by grepping the compiled production CSS for all three scales' values.
- Two radii (§3.2): `--radius-card: 16px`, `--radius-control: 10px`, registered as Tailwind radius keys (`rounded-card`/`rounded-control`). `rounded-full` is untouched - a shape (pills/avatars/dots), not part of this corner-radius scale.
- One shared `--shadow-card` (§3.2, "depth comes from one shared shadow plus border") replacing the `shadow-lg`/`xl`/`2xl` mix on card containers. Button/CTA glow shadows (`shadow-primary/20` etc.) are a separate, deliberate affordance and were left alone.
- Semantic status tokens (§3.3), all three themes: `--theme-status-good/caution/risk/neutral`. Light theme uses darker (600-ish) variants for contrast against a white surface; the `contrast` theme uses brighter variants than dark (matching how `--theme-primary`/`--theme-success` are already bumped brighter there) rather than reusing dark's values verbatim - per UI_PLAN's explicit warning that contrast must not silently inherit a mid-tone.
- `data-text-scale`/`data-motion` attributes (§3.4): set in `App.svelte` alongside the existing `data-theme` `$effect`. `data-motion` resolves the stored `'system'` preference against `matchMedia('(prefers-reduced-motion: reduce)')` live (a `change` listener, not a one-time read), and only writes `'full'`/`'reduced'` to the attribute - an explicit user choice always wins over the media query. `:root[data-motion="reduced"] *` collapses all animation/transition durations to ~0 via the standard reduced-motion CSS reset pattern, so every existing `animate-in`/`duration-*` class is covered without touching each call site individually. A `@media (prefers-reduced-motion: reduce)` fallback (guarded on `:root:not([data-motion])`) covers the brief pre-`$effect` window.

**Preferences store (`src/lib/preferences/migrate.ts` + `src/lib/stores/preferencesStore.svelte.ts`):** pure `migratePreferences(raw, legacy?)` (never throws; corrupt/missing/wrong-version input -> defaults; each field defaults independently rather than discarding the whole object over one bad key; an unrecognised `version` - including a future one - is treated as corrupt, since this code can't know what a newer shape means). 21 unit tests in `migrate.test.ts`, matching the rigor `PLAN.md`'s Prerequisite step set for the `TrainingData` migration chain.

**Judgment call, not spelled out by §5.1 - logged rather than guessed silently:** `theme` and `notificationsEnabled` are included in the `Preferences` shape (for forward compatibility - see below) but are **not** live-managed by `PreferencesStore` this stage. §5.1 says they "stay on their existing standalone keys for now, with a one-time read-and-fold" - read literally, a one-time fold would let the new blob's copies go stale the moment `UiStore.setTheme()` is called afterward (a real risk, since the new blob would then disagree with the actual live theme). Resolved by having `PreferencesStore` re-read the legacy `boulder_tracker_theme`/`boulder_tracker_notifications_enabled` keys **every time it persists** (i.e. whenever `textScale`/`motion` change), not just once at construction - so the blob's copies track `UiStore`'s live values without `PreferencesStore` ever writing to the legacy keys itself or `UiStore` needing to know this module exists. `UiStore` remains the sole owner/writer of those two keys, unchanged.

**Judgment call: `PreferencesStore` itself has no unit test, only `migratePreferences` does.** Attempted one first (mocking `localStorage` via `vi.stubGlobal`) and it failed with `$state is not defined` - `vitest.config.ts` has no Svelte plugin, and grepping confirms no other `*.svelte.ts` rune-based store in this codebase (`UiStore`, `WorkoutStore`, etc.) has ever had a direct test; only the pure logic modules around them do. Deleted the test rather than fighting an established codebase convention - `migratePreferences` already carries the real logic and its test coverage, matching `UI_PLAN.md §5.1`'s explicit ask ("`migratePreferences`... pure, unit-tested") which names the function, not the store.

**Colour-literal audit (§3.3) and remaining §3 items, applied across every component except `WorkoutShareImage.svelte` and `PDFExportModal.svelte`** (both explicitly out of scope for the whole theming pass per `UI_PLAN.md §4.7` - fixed dark styling, exported artifacts, `html2canvas` doesn't resolve CSS custom properties reliably):
- Every `text-[7px]` through `text-[11px]` micro-label (~280 instances across 25 files) replaced with a ramp token. **Non-obvious, deliberate visual change per §3.1's own rule** ("section: the only place uppercase is allowed"): the vast majority of these were `uppercase tracking-widest` field labels, chips, and small action-button text - all of that uppercase treatment is now gone except on genuine section/group headings (e.g. "Filters", "Scheduled Sessions", "Select Phase"), which map to `text-section uppercase`. Field labels, row metadata, and chips map to `text-label` (no uppercase, per the ramp table's own definition of that token). This is the single biggest visual change in this stage and needs the user's own eyes on the dev server - flagged again below.
- Two radii applied codebase-wide: `rounded-3xl`/`rounded-2xl` -> `rounded-card`, `rounded-xl`/`rounded-lg`/`rounded-md`/`rounded-sm` -> `rounded-control`, via sed (safe as a plain substring match - `rounded-t-2xl` does not contain the substring `rounded-2xl`, so directional variants were never touched by this pass). **Judgment call:** a handful of large CTA buttons/pills had originally used `rounded-2xl`/`rounded-3xl` for a softer look despite being controls, not cards (e.g. `AIPromptModal`'s and `AIImportModal`'s "Confirm"/"Copy Prompt" buttons) - the sed's size-based heuristic mapped these to `rounded-card`; caught and re-mapped to `rounded-control` by role (button vs. card container) during per-file review, since the whole point of "two radii" is one radius per element *kind*, not per however-large the corner used to be.
- **Directional radius (`rounded-t-*`) has no equivalent in the new two-token scale** - Tailwind 4 does not generate `rounded-t-card`/`rounded-t-control` for custom radius keys (confirmed by testing against the installed `@tailwindcss/cli`; it errors "unknown utility class"). Left on Tailwind's default scale, mapped to the numerically closest new token: `rounded-t-3xl` (24px) -> `rounded-t-2xl` (16px, matching `--radius-card`) on bottom-sheet modals; `rounded-t-lg` (8px, close to `--radius-control`'s 10px) left as-is on chart-bar tops.
- Hardcoded Tailwind colour classes (`blue-500`, `emerald-500`, `zinc-900`, `rose-500`, etc.) replaced with theme tokens throughout - `blue-*` -> `primary`/`primary-hover`, `emerald-*` -> `success`/`success-hover`, `amber-*` -> `warning` (not the new `status-caution` - see below), `rose-*` -> `danger`, `zinc-*` borders/text -> `border`/`border-strong`/`content-subtle`/`content-muted` as appropriate. `AcwrPanel.svelte`'s `shadow-[0_-4px_12px_rgba(59,130,246,0.2)]` (flagged in `UI_PLAN.md`'s own stash audit as a known defect) replaced with `color-mix(in srgb, var(--color-primary) 20%, transparent)` rather than the invalid `rgba(var(--color-primary),...)` pattern that same audit explicitly warned against.
- **Judgment call: category/phase colour palettes (`predefinedColors` arrays in `PhaseSettings.svelte`/`AnalyticsCategorySettings.svelte`, and `AnalyticsCategory.color`/`PhaseDef.color`/`TrainingBlock.color` usage generally) were left as literal Tailwind classes, not converted to tokens.** `UI_PLAN.md §2`'s own decision table states "Category colours confined to charts and their legends" as a locked-in choice - these are intentionally-arbitrary, many-hued palettes for distinguishing user-created catalog entries, the opposite case from the "ad hoc single-colour-doing-double-duty" defect §3.3 targets. Only the *fallback* color used when nothing is assigned (`'bg-zinc-500'`, appearing in `TrainingPlan.svelte`, `BlockManager.svelte`, `PhaseSettings.svelte`, `AnalyticsCategorySettings.svelte`) was changed, to the new `bg-status-neutral` token - that specific case is genuinely "no meaningful colour," which is what `status-neutral` means.
- **Judgment call: opportunistically wired the new `status-good`/`status-risk` tokens into `AcwrPanel.svelte`'s existing spike/no-spike bar colouring**, since `r.spike ? risk-colour : normal-colour` is an exact, pre-existing semantic match for the tokens' stated purpose ("ACWR sweet spot" vs. "ACWR > 1.5") - not a new feature, not a change to the spike-detection logic itself (still the same boolean from `loadAnalytics.ts`), just sourcing its two colours from the new tokens instead of `danger`/`blue-600` literals. Everywhere else, the new status tokens are defined but not yet consumed - readiness/fatigue panels that will actually need three-way good/caution/risk banding don't exist until Stage 2/5.
- Decorative blur blobs (§3.2) deleted: `Analytics.svelte`'s two `blur-[100px]` glow divs behind the Rolling Load and Training Mix cards. `WorkoutShareImage.svelte`'s blur blob was left alone (out of scope, see above).
- Vertical rhythm tightened per §3.2's stated mapping: `space-y-8` -> `space-y-5` between top-level sections, `space-y-6` -> `space-y-4` inside cards, `p-6` -> `p-5` on card and modal-sheet padding (applied uniformly to `p-5` rather than splitting some to `p-4` - simpler and still meets the plan's own "`p-4`/`p-5`" range).

**Verification performed:**
- `npm run test` -> 192/192 pass (192 prior/pre-existing pass count already included the new `migrate.test.ts`'s 21 cases - no existing test needed updating, since nothing here touches logic any test exercises).
- `npm run check` -> 0 errors, 0 warnings, 407 files.
- `npx vite build` -> production build succeeds; inspected the compiled CSS directly to confirm all three text-scale variants, all three themes' status-colour values, and the new radius/shadow/type-ramp utility classes actually compile to the expected declarations (not just that the build didn't error).
- **No manual browser verification performed this session, by design** - per this project's standing convention (see `[[feedback-refactor-conventions]]`) and `UI_PLAN.md §10`'s own "Verification gap" item, which calls this out explicitly as a visual overhaul that needs the user's own eyes on the dev server. This is especially true for Stage 0: the uppercase-label-removal change described above is a real, opinionated visual shift (arguably the biggest single design decision in this stage) and a passing `npm run check`/build says nothing about whether it reads well in the browser, in all three themes, at all three text scales. **Handing this to the user via `npm run dev`** - specifically worth checking: legibility of the now-non-uppercase field labels, the `contrast` theme's new status-colour brightness choices, and that `data-motion="reduced"`/`data-text-scale` actually visibly change something (there's no UI controls to toggle them yet - Settings' Appearance & Behaviour section is Stage 8 - so this needs manual `document.documentElement.setAttribute(...)` in devtools to exercise them before Stage 8 lands).

**Explicitly not done here** (deferred to later stages per `UI_PLAN.md §6`, not oversights): applying the new type ramp/radii/status tokens to Home, Plan's block timeline, History's overflow menu, or any other not-yet-built/not-yet-restyled screen element (those are Stages 1-9's job, building on these tokens); UI controls for `textScale`/`motion` in Settings (Stage 8's "Appearance & Behaviour" section); consuming `status-caution` anywhere (no three-way banding exists yet); theming `WorkoutShareImage`/`PDFExportModal` (permanently out of scope, not deferred).

**Commit:** made as one commit. Considered splitting "preferences store + text-scale/motion wiring" from "the rest of the design-system retrofit," but `src/app.css`'s token additions (type ramp, radii, status colours, motion CSS) landed together in one `@theme` block edit and aren't cleanly separable by git hunk without hand-patching a generated diff - and every component change downstream depends on those same tokens regardless of which "concern" it belongs to. Stage 0 is itself `UI_PLAN.md`'s own unit of work (its Sequencing table lists it as one row), so one commit for the whole stage is truer to "one commit per distinct concern" than an artificial split would be.

## 2026-09-18 — UI overhaul Stage 1: shell & nav

Implemented `UI_PLAN.md` §4.1/§6 Stage 1 only - `ViewType` gains `"home"`, the bottom bar becomes 4 tabs (Home · Plan · History · Analytics) + a centre FAB with each tab owning exactly one view, Settings relocates to a gear in the Home header, the Rolling Load tile is removed from `TrainingPlan.svelte`, and a new `src/components/dashboard/Home.svelte` renders the fixed §4.2 section order as a skeleton. Per this session's kickoff instruction: no behaviour change beyond navigation/layout, no logic changes.

**Changes:**
- `src/lib/types.ts`: `ViewType` gains `"home"` (prepended, matching its new role as the default/launch view). UI-only union, not persisted - no migration, per `UI_PLAN.md §7`.
- `src/lib/stores/uiStore.svelte.ts`: `UiStore.view`'s default changed `'plan'` -> `'home'` (§4.1: "Always Home").
- `src/App.svelte`: added a `home` branch lazy-loading the new `Home.svelte`, same `{#await import(...)}` pattern as every other view. Nav bar rebuilt from 3 elements (Plan-or-Analytics / FAB / History-or-Settings, two of which shared one active/dot state) to 5: Home, Plan, FAB, History, Analytics, each owning its own active state - the old shared-state ternaries (`view === 'plan' || view === 'analytics'`, `view === 'history' || view === 'settings'`) are gone entirely, since Settings is no longer a tab (reached only via Home's gear) and Analytics now has its own tab. Tab width dropped `w-24` -> `w-16` and icon size `text-[28px]` -> `text-[24px]` to fit 4 tabs + FAB in the same nav bar width that previously held 2 tabs + FAB; added `aria-label`s to every nav button (none existed before on Plan/History/FAB - small accessibility improvement bundled in since it's the same nav markup being rewritten anyway, not a separate concern). Nav bar height (`h-[75px]`) left unchanged - not asked for.
- `src/components/history/History.svelte`: removed the settings-gear button from the Timeline header (moved to Home).
- `src/components/settings/Settings.svelte`: the overview tab's back arrow now calls `navigate('home')` instead of `navigate('history')`, matching where Settings is now opened from. Grepped for every `navigate('settings')` call site afterward to confirm Home's gear is the only entry point now (was previously only History's gear, which is removed).
- `src/components/plan/TrainingPlan.svelte`: removed the "Rolling Load" stat tile and its now-unused `rollingLoad` derived value (§4.1: "it existed mainly as the only route to Analytics; Home now owns that metric and Analytics has a tab"). Left "Weekly Sessions" in place - `UI_PLAN.md §4.3` says that tile also eventually moves to Home, but §4.3 is scheduled under Stage 6 (Plan screen overhaul) in the Sequencing table, not Stage 1, and this session's kickoff instructions scope Stage 1 to exactly the §4.1 bullet list, which names only Rolling Load. Reflowed the now-single-tile row from a two-column grid to a single full-width block rather than leaving an empty second grid cell.
- New `src/components/dashboard/Home.svelte`: header (date via the existing `formatDate` utility, formatting `new Date()` - pure presentational, not new domain logic - plus the relocated Settings gear) followed by the fixed section order from §4.2 (Readiness hero, Today, Metrics, Fatigue, This Week, Training Block, Next Competition, Recent Activity, Weather) as static cards with a title, icon and one-line caption. No section below the header reads any workout/metric/training-block data.

**Judgment call - where the "skeleton" line was drawn, logged rather than guessed silently:** several of §4.2's sections could have been wired to real data using functions that already exist and are already used elsewhere (e.g. `getDominantBlockForWeek`/`getBlocksForWeek` for the header's "current block/phase name" and the Training Block card, `getPlannedWorkoutsForWeek` filtered to today for the Today card, `completedWorkouts` for Recent Activity and This Week). None of that is new logic - `TrainingPlan.svelte` already calls the same functions for the same purpose. Chose *not* to wire any of it in Stage 1, for two reasons: (1) this session's own Stage 1 instruction says "Home skeleton with static sections" and "No behaviour change beyond navigation/layout. No logic changes" - reusing an existing accessor to populate a *new* screen location is still a behaviour addition to that screen, even if the underlying function isn't new; (2) `UI_PLAN.md §6`'s Sequencing table attributes "Home fully populated" to Stage 2, as the last step after the readiness/fatigue engine and quick-entry land, which reads as one deliberate milestone rather than "everything except readiness/fatigue/metrics can be wired now." Drew the line at zero data reads below the header, so Stage 1's diff is unambiguously navigation/layout only and Stage 2's "fully populated" commit has a clean, single point of comparison. If this reading is wrong - i.e. the trivial reuses above should have shipped in Stage 1 - flagging it now rather than after Stage 2 also assumes the conservative reading.

**Verification performed:**
- `npm run test` -> 192/192 pass (unchanged - no test exercises `UiStore`/`ViewType`/nav markup directly, consistent with Stage 0's note that no `*.svelte.ts` rune store has direct tests in this codebase).
- `npm run check` -> 0 errors, 0 warnings, 408 files.
- `npx vite build` -> production build succeeds; `Home-*.js` appears as its own lazy chunk alongside the other views, confirming the `{#await import(...)}` code-split pattern was followed rather than a static import. (Pre-existing `Settings` chunk >500kB warning is unrelated to this stage's changes - `Settings.svelte` was already that large before Stage 1.)
- **No manual browser verification performed, by design** - same standing convention as Stage 0 (see `[[feedback-refactor-conventions]]`). This stage changes real navigation structure (a user who only ever taps "Plan" or "History" from muscle memory now lands somewhere new by default, and the nav bar's tap targets shrank from `w-24` to `w-16`), so it needs the user's own eyes and thumb on `npm run dev` before Stage 2 builds on top of it - explicitly the checkpoint this session's kickoff instructions call for after Stage 1.

**Explicitly not done here** (deferred, not oversights): any data wiring inside `Home.svelte` below the header (Stage 2, see judgment call above); "Weekly Sessions" tile removal from `TrainingPlan.svelte` (Stage 6, per `UI_PLAN.md §4.3`); `TimerWidget`'s `bottom-24` recompute against the new nav height (`UI_PLAN.md §4.1` flags this, but `TimerWidget` doesn't exist in the tree yet - it's ported in Stage 3, so there is nothing to recompute yet; Stage 3 must account for the current nav bar's actual height, not copy the stash's old assumption).

**Commit:** one commit for the whole stage, matching Stage 0's precedent and this session's own "commit when done" instruction per stage - the `ViewType` change, nav rebuild, Settings/History header changes, Rolling Load removal, and the new `Home.svelte` are all facets of the single "shell & nav" concern `UI_PLAN.md §6` scopes as one Sequencing-table row.

**Post-Stage-1 fixup (same day, user-requested):** removed the now-redundant "back to Plan" button from `Analytics.svelte`'s header and shortened its title from "Training Analytics" to "Analytics" - Analytics has its own nav tab as of Stage 1, so the button was dead navigation. Committed separately (`92a2e4f`) since it landed after Stage 1's own commit, in response to the user's dev-server check.

## 2026-09-18 — UI overhaul Stage 2, part 1: rolling ACWR (own commit, per this session's kickoff instruction)

Implemented `UI_PLAN.md` §5.3 - the rolling 7-day-acute/28-day-chronic ACWR window, replacing the week-bucketed ratio as the canonical ACWR definition. Test-first throughout, per this session's kickoff instruction and the Phase 4 `loadAnalytics.ts` precedent: every new/changed function's tests were written before its implementation, run to confirm they failed for the right reason (missing export / stale assertion), then made to pass.

**Scope decision, asked rather than guessed (per `[[feedback-refactor-conventions]]`):** `UI_PLAN.md §5.3` is internally ambiguous about whether Stage 2 should modify `calculateAcwrForWeeks`/`AcwrResult` in place (changing what the existing Analytics ACWR chart and PDF coach report already show, today) or add the new rolling functions purely alongside it, leaving those existing consumers untouched until Stage 5's "merge ACWR into Rolling Load." Asked the user directly rather than resolve it via close-reading; **answer: replace in place now.** `AcwrResult.ratio`/`acuteLoad`/`chronicLoad`/(new) `sufficient` are now sourced from `calculateRollingAcwr` sampled at each week's UTC end date; `rampRate`/`spike` stay week-bucketed and independent, per §5.3's own "a different metric from ACWR, not a bucketed version of it" note.

**Rolling ACWR formula, exactly as specified:** `acuteLoad` = sum of completed `loadFactor` over the trailing 7 UTC calendar days (today back 6), `chronicLoad` = the trailing-28-day sum divided by `chronicDays/acuteDays` (4) - a weekly-equivalent average directly comparable to `acuteLoad`. `ratio = acuteLoad / chronicLoad`, `undefined` when `chronicLoad` is 0.

**<28-days-history handling, decided and made consistent (§10 Open Question 2, "no ratio until day 28" vs "ratio with a building-history flag from day 7") - went with the second, per §5.3's own interface comment ("ratio... undefined when chronicLoad is 0" - not "undefined when insufficient") and §5.2's readiness spec ("confidence records why" implies a ratio exists to reason about):** `ratio` is always computed as soon as `chronicLoad > 0` (which can be from day 1, not day 7 - a single early workout already produces a real, if extreme, ratio). A separate `sufficient: boolean` flag (`daysCovered >= chronicDays`, where `daysCovered` is the inclusive day-span from the earliest completed workout through `asOf`) tells every caller whether to trust it. Two independent gaps, not one: `ratio` can be `undefined` (zero load in the window - possible at any history length, e.g. an inactive stretch) while `sufficient` is `true`, and conversely `ratio` can be a real, large number while `sufficient` is `false` (the exact "inflated early-history ratio" failure mode §5.3 warns about). Every consumer this stage touches respects `sufficient` before treating a defined ratio as trustworthy: `correlatePainWithLoadSpikes`'s high-ratio check now requires `sufficient` (its rampRate-based `spike` check is unaffected); `AcwrPanel.svelte` renders a week as a plotted bar only when `ratio !== undefined`, further distinguishing `sufficient`/not with colour + a "building history" tooltip suffix (bars render as a thin "no load in window" line when `ratio` is `undefined`, never a fabricated zero-height bar); the PDF coach report prints `—` for an undefined ratio and a `*`-with-footnote for a defined-but-not-yet-`sufficient` one.

**Date arithmetic:** added `toUtcDayIndex` (`src/lib/dateUtils.ts`) - converts any ISO date/datetime this codebase actually stores (bare `YYYY-MM-DD`, or `.toISOString()` output) to a UTC calendar-day integer index, so the rolling window sums by plain integer subtraction rather than the `new Date(t - n*86400000)` + `.toISOString().split('T')[0]` pattern §5.3 explicitly warns drifts across DST boundaries. Also extracted `getWeekDates(weekId): {start, end} | null` out of the existing `getWeekDateRange` (pure refactor, no behaviour change - `getWeekDateRange` now just formats `getWeekDates`'s output) so `calculateAcwrForWeeks` can sample a week's actual end-of-week `Date` instead of re-parsing a display string. **`dateUtils.ts` had no test file before this session** - added `src/lib/dateUtils.test.ts` with characterization tests for `getWeekDateRange`'s pre-existing behaviour (confirmed unchanged post-refactor) plus new tests for `getWeekDates`/`toUtcDayIndex`, per this project's "characterization tests before touching untested legacy code" convention - this function is exactly the kind of date-arithmetic code the convention exists to protect, doubly so given it now feeds a financially/physically consequential (if that's not too strong a word for a bouldering app) readiness calculation in Stage 2 part 2.

**A malformed/non-`YYYY-Www` week id** (shouldn't happen via the app's own `getWeekId()`, but `calculateAcwrForWeeks` doesn't control its caller's input) now returns zeroed rolling fields (`ratio: undefined, sufficient: false`) instead of the old code's implicit "whatever `new Date()` happens to be right now" - deterministic and testable, where a live-clock fallback would not be.

**Existing-test rewrite, as the plan itself warned would be necessary:** `loadAnalytics.test.ts`'s old `calculateAcwrForWeeks` describe block (hand-computed week-bucketed ratios) is gone - replaced with tests asserting the new function equals `calculateRollingAcwr` sampled at the week's end date, plus a dedicated test that `rampRate`/`spike` stay independently week-bucketed. `correlatePainWithLoadSpikes`'s existing fixture-based tests gained a `sufficient: true` field (preserving their original intent) plus three new cases for the undefined-ratio and insufficient-ratio guards.

**Downstream consumers fixed for correctness (bundled into this commit, not deferred)**, since they're direct, unavoidable consequences of `AcwrResult.ratio` becoming `number | undefined` rather than new features consuming the rolling window - the line drawn per this session's "own commit, do not combine with anything else" instruction was "does this land the ACWR type change without leaving the app broken," not "does this add anything new":
- `AcwrPanel.svelte`: gap-rendering for `ratio === undefined` weeks (§5.3's own instruction, not deferred to Stage 5), a distinct colour + tooltip suffix for defined-but-`!sufficient` weeks.
- `PDFExportModal.svelte`'s coach report ACWR table: `—` for undefined, `*` + footnote for not-yet-sufficient.
- Neither `Analytics.svelte` nor `AcwrPanel.svelte`'s overall layout/merge changed - that's still Stage 5's "merge ACWR into Rolling Load."

**Verification performed:**
- `npm run test` -> 213/213 pass (192 prior + 11 new `dateUtils.test.ts` + 10 net new/changed `loadAnalytics.test.ts` cases).
- `npm run check` -> 0 errors, 0 warnings, 409 files.
- `npx vite build` -> production build succeeds.
- No manual browser verification - this is pure logic plus the two minimal UI safety-fixes above; per `UI_PLAN.md §10`'s own note, Stage 2's logic is "the one exception that genuinely *is* verifiable headlessly." The `AcwrPanel`/PDF-report visual changes are small enough to fold into Stage 2's own end-of-stage dev-server check rather than needing a separate one now.

**Commit:** this ACWR change only (`dateUtils.ts`, `dateUtils.test.ts`, `loadAnalytics.ts`, `loadAnalytics.test.ts`, `AcwrPanel.svelte`, `PDFExportModal.svelte`) - readiness/fatigue/arms/quick-entry are separate commits landing after this one, per this session's explicit instruction not to combine them.

