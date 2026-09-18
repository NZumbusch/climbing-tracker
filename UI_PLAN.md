# Boulder Tracker — UI Overhaul Plan

## How to use this file

This is a **design/scope document, not an implementation log**. It was written
on 2026-09-17, after all 8 phases of `PLAN.md` landed (`2b391d9` = Phase 7),
and it covers the work that comes *after* that plan: a visual overhaul plus
the small set of features deferred into `stash@{0}` before Phase 0 started.

It follows the same conventions as `PLAN.md`:

- Read a stage section in full before writing code for it.
- Anything under "Open questions" is **not** decided — ask, don't guess.
- Log non-obvious judgment calls in `PROGRESS.md` as they happen, never by
  rewriting past entries.
- Full test suite + `npm run check` pass before every commit; one commit per
  distinct concern.
- **Nothing in here changes `TrainingData`, `DATA_EXPORT_VERSION`, or the
  migration chain.** See "Schema impact" below. If a stage appears to need a
  schema change, stop and raise it — that is a signal the design is wrong,
  not a licence to add a migration.

Decisions below were made with the user on 2026-09-17 in a structured
question pass. Where the user overrode a recommendation, that is marked.

---

## 1. Stash audit (performed 2026-09-17)

`stash@{0}` = `63395c3db3015a9b7e37ffacd50259b28b7f4860`, stashed pre-Phase-0
(see `PROGRESS.md`, 2026-09-16). 15 tracked files + 3 untracked
(`old_backup.json`, `src/components/dashboard/Dashboard.svelte`,
`src/components/workout/TimerWidget.svelte`, recoverable via
`git show stash@{0}^3:<path>`).

Audited by diffing the stash against current `src/lib/types.ts` and the
current component tree. Verdicts:

| Stash item | Lines | Verdict | Why |
|---|---|---|---|
| `Dashboard.svelte` | 532 | **Dead — rebuild from scratch** | Reads `trainingState.dailyReadiness` / `storage.getDailyReadiness()` / the `DailyReadiness` interface, all deleted by Phase 1 in favour of `MetricDef`/`DailyMetricEntry`. Also calls `getPeriodizationForWeek()` (removed by Phase 3/4's `PhaseDef[]`/`TrainingBlock`), and reads `exercise.type` / `e.duration` / `e.sets` directly off slots (Phase 1 moved these behind `typeId` + `slotValues(slot)`). Concepts port; not one line of code does. |
| `TimerWidget.svelte` | 105 | **Clean port** | Zero schema contact — `$state`, Iconify, theme tokens only. Only stale detail is `bottom-24`, which assumed the old nav height. |
| History "Share" wiring | ~8 | **Port as-is** | The stash imports the *same* `src/components/history/WorkoutShareImage.svelte` that exists in `HEAD` today — the component was never stashed, only its `workoutToShare` state + button + `{#if}` block. "Use the existing component" and "port the stash wiring" are the same action here. |
| History exercise-type filter | ~20 | **Rebuild** | Filters on `e.type === filterExerciseType` — a name string removed in Phase 1. Needs `typeId`. Bundled in the same hunk as Share; do not port blind. |
| Fatigue radar (Analytics) | ~55 | **Rebuild as net-new** | Schema-current (`fingers`/`arms`/`core`/`systemic` all still on `Workout`) but the implementation is a crude 4-point polygon over raw 14-day *sums*, normalised to the largest axis, with `|| 5` imputed for every missing value. No absolute scale, and misleading. |
| ACWR chart (Analytics) | ~70 | **Excluded** (user) | Superseded by Phase 4's `AcwrPanel`. Note: the stash's *daily-rolling* framing turned out to be the right one and §5.3 adopts a rolling 7/28-day window — but the stash's **implementation** is still excluded (fragile UTC/local date arithmetic, no insufficient-history guard, no tests). Concept vindicated, code not reused. |
| 4-arg `calculateLoadFactor`, arms as a load axis | ~15 | **Excluded** (user, previously rejected) | Would rebalance every historical `loadFactor`. See §5.4 — `arms` is still collected as *data*, which is a separate thing. |
| `PhaseType`-based code (`TrainingPlan`, `Settings`, `AIPromptModal`) | ~150 | **Excluded** | Hard-broken by Phase 3's `PhaseDef[]` redesign. |
| `svelte-dnd-action` day-of-week DnD (`TrainingPlan`) | ~60 | **Concept adopted, code rebuilt** | Structure is useful; the stash version carries its own comment about drag/re-render jitter it worked around rather than fixed, and it reads `w.dayOfWeek` off live state then calls `processWorkoutSave` on a mutated object. |
| "Actual reps per set" + "similar past sets" (`ExerciseForm`) | ~160 | **Not resurrected** | `actualReps` was an ad hoc instance of exactly the plan-vs-log problem Phase 1 solved structurally (`PLAN.md` principle 3). Superseded. |
| `arms` slider in `FatigueModal` | ~12 | **Adopted** | See §5.4. Data collection only. |
| Settings parameter descriptions | ~30 | **Adopted as content** | `PARAMETER_DESCRIPTIONS` copy is reusable; the surrounding `PhaseType` settings code is not. |
| `README.md` "Sports Science Engine" section | 40 | **Reference only** | Documents the readiness/ACWR/fatigue formulas. Useful as intent; the numbers get re-derived in §5.2, not copied. |
| `capacitor.config.json` / `vite.config.js` | 2 | **Out of scope** | Deploy base path and display name. Unrelated to UI; decide separately. |
| `old_backup.json` | — | **Discard** | Stray data file. |

**Also found during the audit** (not stash-related, but it shapes this plan):

1. `sleep-score`, `hrv` and `rhr` `MetricDef`s are seeded
   (`DEFAULT_METRIC_DEFS`, `src/lib/constants.ts`) and *read* by
   `findRecoveryWarnings` — but **no UI anywhere writes them**. Only
   bodyweight has an entry surface (`BodyweightLog.svelte`). So today those
   recovery warnings can never fire on real data.
2. `Workout.arms` exists but `FatigueModal.svelte` collects only
   fingers/core/systemic. Every workout logged since Phase 1 has
   `arms: undefined`.
3. `ExerciseForm` in `mode='logged'` seeds its fields from `prescribed` but
   never *displays* the prescribed value — the comparison Phase 1 was built
   to enable is not surfaced anywhere in the UI.
4. `syncFatigueReminders` cancels **all** pending notifications, documented
   as safe because "this feature is the only `LocalNotifications` user in the
   app". Adding a second reminder type (§5.6) invalidates that assumption.
5. Analytics' Rolling Load bars are hardcoded `blue-600`/`blue-400` and
   `shadow-[...rgba(59,130,246,0.2)]`, not theme tokens — they do not
   respond to light or high-contrast mode.
6. The stash's `Dashboard.svelte` uses `rgba(var(--color-primary), 0.39)`.
   The theme tokens are hex, not channel triplets, so that expression is
   invalid CSS. Do not reproduce this pattern.

---

## 2. Decisions

| Topic | Decision |
|---|---|
| Visual direction | **Refine the existing dark tactical look**, don't replace it. Fix its actual defects: 8–9px uppercase micro-labels everywhere, decorative blur "glow" blobs, four different corner radii, inconsistent card chrome. |
| Density | **Denser.** Today's screens are airy in layout but tiny in type — worst of both. Tighten vertical rhythm, spend the space on readable text. |
| Colour | **Semantic-only accent.** Blue is the single UI accent. Green/amber/red are reserved strictly for status meaning. Category colours confined to charts. |
| Navigation | **4 tabs + centre FAB**: Home · Plan · `[+]` · History · Analytics. Settings moves to a gear in the Home header. |
| Launch screen | **Always Home.** |
| Home vs Analytics | **Home = now, Analytics = history.** Home answers "how am I / what's next" only. Every trend and multi-week comparison lives in Analytics. No duplicated panels. |
| Daily metric entry | **Inline quick-entry on Home** (sleep / HRV / RHR), plus an evening reminder notification when today's entry is still missing *(user addition)*. |
| Readiness inputs | Rolling fatigue decay + ACWR penalty + sleep score + HRV vs 14-day baseline. |
| ACWR definition | **Rolling 7-day acute / 28-day chronic window**, replacing Phase 4's week-bucketed ratio as the canonical metric *(user, 2026-09-17)*. Ramp rate stays week-over-week. See §5.3. |
| Notification id ownership | **Fixed as part of this work** *(user, 2026-09-17)*, as the first commit of Stage 8 — before the second reminder type exists. See §5.6. |
| `Workout.arms` | **Collect it** — add a fourth slider to `FatigueModal`. `calculateLoadFactor` is **not** changed. |
| Cold start | **Show the score, label its confidence.** Never impute missing inputs silently. |
| Home sections | Readiness → Today → Metrics → Fatigue, then weekly load progress, recent activity, block/phase context, next competition countdown. |
| Weather | **Manual home location** set in Settings + Open-Meteo. Plus an **optional second "trip" location with a 7-day forecast**, toggleable, for planning outdoor trips *(user addition)*. |
| Plan week sessions | **Both** a day-grouped list and a 7-column grid, switchable in Appearance *(user override — grid deferred to a later stage, see §6)*. |
| Day reassignment | **Both** drag-and-drop and an explicit day picker *(user override of the picker-only recommendation)*. |
| Week strip | **Block timeline + shorter strip** — ~16 readable weeks with `TrainingBlock` bars above them. |
| History row actions | **Overflow menu** (Edit / Share / Duplicate / Delete). |
| History rows show | + total duration, fatigue summary, block/phase, expandable exercise detail. |
| History filters | + exercise type, date-to, text search, training block. |
| History grouping | **Month headings** with per-month session count and load. |
| Fatigue visualisation | **Both bars and radar**, switchable in Appearance *(user override)*. **Bars are the default.** |
| Fatigue aggregation | **Exponential decay, 3-day half-life** — the same model as readiness, so the two can never disagree. |
| Analytics layout | **One shared sticky time control + section-jump chips.** |
| Analytics panels | Fix hardcoded colours; **merge ACWR into Rolling Load**; add an outdoor-ascents panel; add a bodyweight trend panel. |
| Plan-vs-log | **Show the prescribed target inline per field** while logging, with a divergence cue. |
| Timer | **Floating pill, context-aware** — ported from the stash but pre-loading presets from the current exercise's `timeOn`/`timeOff`/`timeBetweenSets`. |
| Timer behaviours | Vibrate, beep, keep-awake — **all togglable in Settings** *(user addition)*. Background execution is **out** *(user, after the contradiction was raised)*. |
| Workout screen | + session progress indicator, drag-reorder exercises, quick-log-as-prescribed, grouped exercise picker. |
| Preference persistence | **Device-local `localStorage`**, outside `TrainingData` — but **must survive app updates**, so preferences get their own version field and a small pure migration. See §5.1. |
| Settings structure | Keep the five-tab shell; **rename "Appearance & Design" → "Appearance & Behaviour"** and give it subsections. |
| Also configurable | Dashboard section visibility & order; text size scale; reduced motion; reminder times. |

---

## 3. Design system

All of this is prerequisite work — it lands first (Stage 0) and changes no
behaviour.

### 3.1 Type ramp

The current code uses `text-[7px]` through `text-[10px]` with
`font-black uppercase tracking-widest` as its default label treatment, in
dozens of places. That is the single biggest legibility problem in the app.

Replace ad hoc sizes with a named ramp, applied consistently:

| Token | Size / weight | Use |
|---|---|---|
| `display` | 40–56px, 800 | The readiness number, and nothing else |
| `metric` | 24–28px, 700, tabular-nums | Stat values |
| `title` | 18px, 700 | Screen titles |
| `section` | 12px, 700, uppercase, `tracking-wide` | Section headings — **the only place uppercase is allowed** |
| `body` | 14px, 400–500 | Normal text |
| `label` | 12px, 600 | Field labels, chips, row metadata |
| `caption` | 11px, 500 | Secondary detail. **Hard floor — nothing smaller ships.** |

Numeric values use `font-variant-numeric: tabular-nums` so columns align and
counters don't jitter.

### 3.2 Radii, elevation, spacing

- Two radii only: `--radius-card` (16px) and `--radius-control` (10px).
  Today's `rounded-3xl` / `rounded-2xl` / `rounded-xl` / `rounded-lg` mix goes.
- **Delete every decorative blur blob** (`bg-primary/20 blur-[60px]`,
  `-top-24 -right-24 w-48 h-48 ...` and friends). They cost paint, don't
  survive high-contrast mode, and are the main reason panels look
  inconsistent. Depth comes from one shared `--shadow-card` plus border.
- Vertical rhythm: `space-y-8` → `space-y-5` between sections,
  `space-y-6` → `space-y-4` inside cards.
- Card padding `p-6` → `p-4`/`p-5`.

### 3.3 Colour tokens

Add status tokens to `src/app.css`, defined per theme alongside the existing
`--theme-*` set, so status colour is never a literal Tailwind class again:

```
--theme-status-good      /* readiness high, ACWR sweet spot, fatigue low  */
--theme-status-caution   /* ACWR 1.3–1.5, fatigue moderate                */
--theme-status-risk      /* ACWR > 1.5, fatigue high, readiness low       */
--theme-status-neutral   /* no data / not applicable                      */
```

Rules:

- Blue (`--color-primary`) = interactive affordance. Not decoration.
- Status tokens = meaning only. Never used to make a card look nice.
- Category colours (`AnalyticsCategory.color`) stay confined to charts and
  their legends.
- No literal `blue-400`, `emerald-500`, `rose-500`, or
  `rgba(59,130,246,...)` in components. Audit for these as part of Stage 0.
- Every token gets a value in all three themes (`dark`, `light`,
  `contrast`). The contrast theme in particular must not silently inherit a
  mid-tone.

### 3.4 Text scale and motion

Two new `documentElement` attributes, set the same way `data-theme` already
is in `App.svelte`:

- `data-text-scale="sm|md|lg"` → scales the ramp via a `--text-scale`
  multiplier on `:root`.
- `data-motion="full|reduced"` → when reduced, transition/animation
  durations collapse to ~0. **Also honour `prefers-reduced-motion` as the
  default** when the user hasn't set an explicit preference.

The app currently uses `animate-in`, `slide-in-from-*`, `zoom-in-95` and
`duration-700`/`duration-1000` almost everywhere; these all need to route
through the motion attribute rather than being hardcoded.

---

## 4. Screens

### 4.1 Shell & navigation

`src/App.svelte`, `src/lib/types.ts` (`ViewType`), `src/lib/stores/uiStore.svelte.ts`.

- `ViewType` gains `"home"`. This is a UI union, **not** persisted data — no
  migration.
- `UiStore.view` default changes `'plan'` → `'home'`.
- Bottom bar becomes: Home · Plan · `[+]` (FAB, keeps current `navigate('add')`
  behaviour) · History · Analytics. The current bar's "plan-or-analytics" and
  "history-or-settings" shared active states go away — each tab owns one view.
- Settings gear moves to the **Home header**. Remove the gear from
  `History.svelte`'s header.
- Remove the "Rolling Load" stat tile from `TrainingPlan.svelte` (it existed
  mainly as the only route to Analytics; Home now owns that metric and
  Analytics has a tab).
- Nav height changes, so `TimerWidget`'s `bottom-24` must be recomputed
  against the new value rather than copied.

### 4.2 Home (new) — `src/components/dashboard/`

Built fresh against `MetricDef`/`DailyMetricEntry`/`PhaseDef`/`TrainingBlock`
and `slotValues()`. Nothing from the stashed `Dashboard.svelte` is copied.

Order (fixed default; user-reorderable per §4.7):

1. **Header** — date, current block/phase name, Settings gear.
2. **Readiness hero** — score 0–100, radial progress, status word, one advice
   line, and a confidence note when running on partial inputs (e.g.
   "fatigue only — no HRV baseline yet"). See §5.2.
3. **Today** — today's planned session(s) with a prominent Start action;
   empty state offers "log a spontaneous session". Resolve exercise names via
   `slotTypeName(slot, trainingState.exerciseTypes)`, never `slot.type`.
4. **Daily metrics quick-entry** — sleep / HRV / RHR for today, each with a
   7-day sparkline, tap-to-edit, writing through
   `trainingState.saveDailyMetric(entry, def)` (which already calls
   `ensureMetricDef` defensively). Uses the well-known ids `sleep-score`,
   `hrv`, `rhr` from `DEFAULT_METRIC_DEFS` — do not invent new ones.
5. **Fatigue** — four bars (or radar, per preference) from the shared decay
   model. See §5.4.
6. **Weekly load progress** — current week completed vs planned.
7. **Block / phase context** — which `TrainingBlock`s cover this week and
   position within them ("Strength, week 2 of 4"), via
   `getBlocksForWeek` / `getDominantBlockForWeek`.
8. **Next competition countdown** — next A-priority `CompetitionEvent`.
   (It stays on the Plan screen too; that is deliberate, not duplication —
   Plan is where you act on it.)
9. **Recent activity** — last 2–3 completed sessions, deep-linking to History.
10. **Weather** — current conditions for the home location; the trip forecast
    card when enabled. See §5.5.

### 4.3 Training Plan — `src/components/plan/`

- **Week strip → block timeline.** `WeekCalendar.svelte` (already extracted,
  presentational) grows to ~16 weeks with visible week numbers, and gains a
  band above it rendering each `TrainingBlock` as a named bar spanning its
  `startWeekId`–`endWeekId`. This finally makes overlapping blocks legible
  instead of collapsing them into one dominant tile colour plus a
  `hasOverlap` hint. Tap-to-select with a detail line replaces the current
  hover-only tooltips, which do nothing on touch.
- **Sessions grouped under day headings** (Mon–Sun + Unassigned), with rest
  days shown explicitly as "— rest —". This is the default layout.
- **7-column grid** as the alternate layout, selected in Appearance.
  Deferred to a later stage (§6).
- **Day reassignment**: drag-and-drop between day groups
  (`svelte-dnd-action`, already a dependency) *and* an explicit day picker on
  the session row. Both write the same field through one handler — do not
  duplicate the save path. Rebuild rather than porting the stash's version;
  in particular, take a `$state.snapshot` before mutating rather than
  mutating live store state and saving it back.
- Remove the "Rolling Load" tile (§4.1). "Weekly Sessions" also moves to Home.
- Toolbar (BlockManager / AI prompt / AI import / Today / prev-next) keeps its
  functions but gets restyled to the new control sizing; four icon buttons at
  `p-1.5` in a row is currently below comfortable touch-target size.

### 4.4 Workout & Exercise form — `src/components/workout/`

- **Inline prescribed targets.** In `mode='logged'`, each field shows the
  corresponding `prescribed` value as a hint with a divergence cue
  (at target / above / below). `ExerciseForm` already derives
  `editingValues`; it needs a parallel read of `initialSlot.prescribed` for
  display only. Must not write to `prescribed` — that is the invariant Phase 1
  established.
- **Session progress** — "3 of 6 logged" plus a bar, derived from the same
  `logged !== undefined` test `calculateWorkoutAdherence` uses. Reuse that
  function rather than recomputing.
- **Quick-log** — one tap marks a slot logged exactly as prescribed
  (`logged = { ...prescribed }`).
- **Drag-reorder** exercises within a workout.
- **Exercise picker** grouped by analytics category, recent/frequent first.
  Currently a flat `<select>` over every modality.
- **Timer** — see §5.7.

### 4.5 History — `src/components/history/`

- **Wire the Share button** to the existing `WorkoutShareImage.svelte`
  (schema-current, already imports `slotValues`/`slotTypeName`). ~8 lines,
  no rebuild.
- **Overflow menu** per row: Edit / Share image / Duplicate / Delete. Gets
  Delete out of accidental-tap range — it currently sits inline with a
  confirm but no undo.
- **Month headings** with session count and total load per month.
- **Row content** adds: total duration (already computed for the duration
  filter, never displayed), a compact fatigue summary, the block/phase from
  `blockId`, and tap-to-expand logged exercise detail.
- **Filters** add: exercise type (**by `typeId`** — the stash's `e.type`
  version is dead), a date-to bound, text search over name and notes, and
  training block.

### 4.6 Analytics — `src/components/analytics/`

- **One sticky header** owning the week-window control. Today's prev/next/
  today controls are duplicated in two panel headers while driving a single
  shared `viewOffset` — collapse to one. Add section-jump chips
  (Load / Mix / ACWR / Fatigue / Adherence / Benchmarks).
- **Merge ACWR into Rolling Load.** `AcwrPanel` plots a ratio derived from
  exactly the loads charted directly above it. One panel: load bars plus a
  ratio line on a secondary axis, with sweet-spot / caution / risk bands and
  ramp-rate spike flags. The ratio line is
  `calculateRollingAcwrSeries` sampled at each displayed week's end date
  (§5.3) — the same function feeding the readiness score, so the chart and
  the Home hero can never disagree. Weeks where `sufficient` is false render
  as a gap, not as a plotted value.
- **Fix hardcoded colours** in Rolling Load (§3.3).
- **New: Fatigue panel** — bars by default, radar as an alternate
  (Appearance setting). Shared decay model (§5.4). Must show axis coverage
  honestly: historical workouts predating the arms slider have no arms value
  and must not be imputed.
- **New: Outdoor ascents panel** — `outdoorAscents` are imported and stored
  but nothing charts them (Phase 6 deferred this explicitly). Grade
  distribution over time, plotted against the same week window.
- **New: Bodyweight trend** — `bodyweight` `DailyMetricEntry`s currently
  appear only as a list in Settings › Health.
- Benchmark Progress panel stays; restyle only.

### 4.7 Settings — `src/components/settings/`

Keep the overview-then-tab shell. Rename the `design` tab
**"Appearance & Behaviour"**, with subsections:

```
Theme            Dark · Light · High contrast
Text size        Small · Default · Large
Motion           Full · Reduced  (default: follow system)

Layout
  Week view      Day list · Grid
  Fatigue chart  Bars · Radar
  Home sections  show/hide + reorder

Timer
  Vibrate on finish       [on]
  Audible beep            [on]
  Keep screen awake       [off]

Weather                   [on]
  Home location    Munich, DE            Edit
  Trip location    — off —               Add
  Forecast         7 days
```

Notifications (fatigue reminder, new daily-metrics reminder, and their
times) move into their own section — either a sibling subsection here or a
promoted top-level tab. Currently the fatigue toggle sits inside
`PreferencesSettings.svelte` next to the theme picker, which will not scale.

`WorkoutShareImage` and `PDFExportModal` keep their fixed dark styling and
are **out of scope for the theming pass** — they are exported artifacts, not
app chrome, and `html2canvas` does not resolve CSS custom properties
reliably.

---

## 5. Logic & modules

### 5.1 Preferences store

New: `src/lib/stores/preferencesStore.svelte.ts` + a pure
`src/lib/preferences/migrate.ts`.

Follows the existing `UiStore` `localStorage` pattern (the one Phase 7 used
for `notificationsEnabled`) — **not** `TrainingData`. Rationale: these are
cosmetic/device settings, and putting them in `TrainingData` would mean a
schema field, a migration step, a `DATA_EXPORT_VERSION` bump and tests for
every new toggle, against the highest-blast-radius part of the app.

The user's requirement is that preferences **survive app updates**. So:

- One key, `boulder_tracker_preferences`, holding
  `{ version: number, ...prefs }`.
- `migratePreferences(raw: unknown): Preferences` — pure, unit-tested, and
  **never throws**. Unknown/corrupt input returns defaults; missing keys get
  defaults; unknown extra keys are dropped; the version field drives any
  future shape change.
- `theme` and `notificationsEnabled` stay on their existing standalone keys
  for now, with a one-time read-and-fold into the preferences object.
  Preserve the old keys' values on first run — do not reset anyone's theme.

### 5.2 Readiness

New: `src/lib/analytics/readiness.ts`, pure and unit-tested, alongside
`loadAnalytics.ts`.

```
computeFatigueDecay(workouts, asOf, halfLifeDays = 3)
  -> { fingers, arms, core, systemic, coverage }

computeHrvBaseline(dailyMetrics, asOf, days = 14) -> number | undefined

computeReadiness({ fatigue, acwr, sleep, hrv, hrvBaseline })
  -> { score, status, advice, inputsUsed, confidence }
```

- Exponential decay, 3-day half-life, over completed workouts' fatigue
  ratings. **An axis with no value contributes nothing to that axis and is
  excluded from its normalisation** — no `|| 5` imputation anywhere. That is
  the specific flaw in the stashed version.
- ACWR penalty uses `calculateRollingAcwr(workouts, asOf)` — see §5.3.
  When `sufficient` is false, the penalty is skipped entirely and `confidence`
  records why, rather than applying a penalty derived from an inflated ratio.
- Sleep and HRV read `DailyMetricEntry` by the well-known ids `sleep-score`
  and `hrv`.
- `confidence` reports which inputs were actually available, so the hero card
  can say "fatigue only — no HRV baseline yet" rather than presenting a
  fully-informed-looking number.
- Advice strings should describe state and leave the training decision to the
  athlete. See Open question 3.

### 5.3 ACWR: rolling window, not week buckets

**Decision (user, 2026-09-17): ACWR moves to a true rolling 7-day acute /
28-day chronic window.** This replaces Phase 4's week-bucketed ratio as the
canonical definition.

**Why the original reasoning doesn't hold.** `loadAnalytics.ts` justifies
week-bucketing on the grounds that "workouts don't reliably carry a `date`
until completed". True in general — but every ACWR code path already filters
`status === "completed"`, and a completed workout always has a date
(`TrainingState.confirmFatigue` sets `date: ... || new Date().toISOString()`).
The constraint that motivated bucketing does not apply to this metric.

**Why it matters for this plan.** A week-bucketed ratio is unusable as a
*daily* readiness input: on a Monday the current week's acute load is near
zero, so the ratio collapses and readiness would spuriously improve every
Monday and degrade every Sunday. This is what Open question 1 was about; it
is now resolved by changing the metric rather than by picking which stale
week to read.

New in `src/lib/analytics/loadAnalytics.ts`:

```
calculateRollingAcwr(workouts, asOf, { acuteDays = 7, chronicDays = 28 })
  -> { acuteLoad, chronicLoad, ratio, daysCovered, sufficient }

calculateRollingAcwrSeries(workouts, sampleDates) -> RollingAcwrPoint[]
```

- `acuteLoad` — sum of `loadFactor` over completed workouts in the
  `acuteDays` window ending at `asOf`.
- `chronicLoad` — the same over `chronicDays`, divided by
  `chronicDays / acuteDays` to give a weekly-equivalent average.
- `ratio` — `acuteLoad / chronicLoad`, undefined when `chronicLoad` is 0.
- `sufficient` — false when the earliest completed workout is less than
  `chronicDays` before `asOf`. With a short history the chronic baseline is
  understated and the ratio reads alarmingly high; callers must degrade
  (label it, skip the penalty) rather than present it as fact.

**Date arithmetic.** Do **not** use the `new Date(t - n * 86400000)` +
`.toISOString().split('T')[0]` pattern the stashed dashboard used — it mixes
local and UTC and drifts across DST boundaries. Normalise to UTC calendar
days once, then do the window arithmetic on day indices.

**What changes, what doesn't:**

| Item | Fate |
|---|---|
| `calculateWeeklyLoad` | Unchanged — still used by ramp rate and the load chart |
| Ramp rate / `spike` / `RAMP_RATE_SPIKE_THRESHOLD` | **Unchanged and still week-over-week.** Ramp rate is inherently a week-on-week comparison; it is a different metric from ACWR, not a bucketed version of it |
| `findConsecutiveTrainingDayWarnings` | Unchanged |
| `AcwrResult.ratio` (week-bucketed) | **Replaced** by the rolling ratio sampled at each week's end date, so the Analytics chart and the readiness number come from one function and cannot disagree |
| `correlatePainWithLoadSpikes` | Reads the sampled rolling ratio against `ACWR_HIGH_RISK_RATIO`; the `spike` half of its check still comes from ramp rate |
| `findRecoveryWarnings` | Unchanged in shape; its spike detection is ramp-rate based |

**This is a behaviour change, not a refactor.** `loadAnalytics.test.ts` has
assertions on the bucketed ratio that will no longer hold. Per the project's
convention, write the new tests first, state the intended new behaviour
explicitly, and log the change in `PROGRESS.md` — do not quietly relax
existing assertions until they pass. Everything here is pure functions over
data already in memory; no schema, storage or migration impact.

### 5.4 Fatigue distribution

Single source of truth: `computeFatigueDecay` above. Home's bars and the
Analytics panel render the same values — they cannot drift.

`arms` collection: add a fourth slider to `FatigueModal.svelte`
("Arms / pulling"), writing `Workout.arms`. The field is already optional on
`Workout`, so **no migration and no version bump**.

`calculateLoadFactor(duration, fingers, core, systemic)` **keeps its current
signature and weights**. Collecting arms and using arms in the load formula
are separate decisions; only the first is in scope. Say so in the code
comment so a future reader doesn't "fix" the apparent inconsistency.

Coverage must be surfaced: for months of history, `arms` is undefined. The
panel states how many sessions in the window carry each axis.

### 5.5 Weather

New: `src/lib/weather/` — pure fetch wrappers + code→label/icon mapping,
with the network calls isolated and mockable.

- **Home location**: current conditions, compact strip on Home.
- **Trip location** *(user addition)*: optional second location with a 7-day
  daily forecast, enabled in Settings, rendered as its own Home card for
  planning outdoor trips.
- Open-Meteo, no API key for non-commercial use. City → coordinates via
  Open-Meteo's geocoding endpoint at the moment the location is *set*, so
  normal operation needs only the forecast call.
- **Cache the last successful response with its timestamp.** Offline shows
  stale data labelled with its age, never a blank card or an indefinite
  "Syncing sensors…" spinner (what the stash did).
- This is the only network dependency in an otherwise fully local-first app.
  It must degrade to "absent", never to "broken", and the whole feature is
  off by default until a location is set.

### 5.6 Notifications

`src/lib/notifications/` gains a daily-metrics reminder: fires when today's
sleep/HRV entry is still missing, at a configurable time.

**Decision (user, 2026-09-17): the cancel-all assumption gets fixed as part
of this work** — it is scheduled, not merely flagged.

`syncFatigueReminders` currently cancels every pending notification, on the
documented grounds that the fatigue reminder is the only
`LocalNotifications` user in the app (`PROGRESS.md`, 2026-09-17). A second
reminder type breaks that invariant: whichever sync runs last would silently
cancel the other type's pending notifications.

Fix, as **the first item of Stage 8 and its own commit**, landing *before*
the metrics reminder is added:

- Give each reminder type its own id namespace. `workoutReminderId` already
  hashes a workout id into the 32-bit range; partition that range by type
  (e.g. a per-type offset or high-bit tag) so ownership is derivable from the
  id alone.
- Replace cancel-all with cancel-mine: read `getPending()`, filter to ids in
  the calling type's namespace, cancel only those.
- Update the Phase 7 tests that assert the current cancel-all behaviour —
  specifically the `cancelAllFatigueReminders` no-op/cancel-by-id cases and
  `syncFatigueReminders`' cancel-then-reschedule happy path. These assert
  behaviour that is deliberately changing; rewrite them to assert the new
  contract rather than loosening them.
- Add a test that two reminder types can coexist: syncing one must leave the
  other's pending notifications intact. This is the regression the whole
  refactor exists to prevent.

Note for the user: sleep and HRV are morning readings. An evening reminder
catches a *miss*; a morning one builds the *habit*. The time is configurable
and defaults to evening as requested.

### 5.7 Timer

Port `TimerWidget.svelte` (105 lines, clean), then:

- Recompute `bottom-24` against the new nav height.
- Pre-load presets from the current exercise's `timeOn` / `timeOff` /
  `timeBetweenSets` via `slotValues()`, instead of a fixed 60s.
- Gate vibrate / beep / keep-awake behind preference toggles.
- Keep-awake needs the Screen Wake Lock API on web and a plugin on native —
  treat the dependency decision as its own step, and degrade silently where
  unsupported rather than showing a dead toggle (the pattern
  `PreferencesSettings` already uses for native-only notifications).
- Audible beep needs a first-interaction unlock for browser audio policy.
- **Background execution is out of scope.**

### 5.8 AI integration: more context, and a settings surface for what gets shared

**Added 2026-09-18**, mid-session, after the user asked whether the
"Generate Plan"/"Analyze Past"/"Context Only" prompts (`AIPromptModal.svelte`,
built in `PLAN.md` Phase 5) actually contain everything the AI needs. They
don't — investigated and confirmed real gaps, not a hypothetical concern:

- **The prompts predate Phase 4/6/7 entirely.** They send exercise type
  names + default parameters, the last 20 workouts reduced to
  `{date, status, exercise names}` — no duration, sets/reps, load, or
  fatigue — plus phase names and benchmarks. Nothing from periodization
  (`TrainingBlock`s), competitions, readiness/daily metrics (sleep, HRV,
  RHR, bodyweight), pain logs, or outdoor ascents ever reaches the AI,
  because none of those systems existed yet when Phase 5 shipped.
- **Analytics categories can't reach the AI even if added to the prompt
  text**, because the JSON contract has nowhere to put one: `AIExercise`
  (`src/lib/ai/schema.ts`) has only `exerciseTypeName` and `values`. When
  the AI invents a new exercise type, `planImport.ts`'s `buildPlanCommit`
  assigns it to `ctx.analyticsCategories.find(c => !c.archived) ??
  ctx.analyticsCategories[0]` — whichever category happens to be first,
  regardless of what the AI meant. This needs a schema field, not just
  more prompt text.

**Scope:**

1. **Expand what the prompt-building code sends** (`AIPromptModal.svelte`
   and wherever its data-gathering gets extracted to, given the size this
   is becoming — likely worth its own `src/lib/ai/context.ts`, pure and
   testable, producing the condensed JSON blob independently of the
   Svelte component): analytics categories; recent workouts with real
   duration/load/fatigue, not just names; active `TrainingBlock`s
   covering or near the target weeks; upcoming `CompetitionEvent`s
   (A-priority especially — a coaching prompt should know what the athlete
   is peaking for); a readiness/metrics snapshot (current
   `computeReadiness` output, recent sleep/HRV/RHR/bodyweight trend);
   recent `PainLog` entries; recent `OutdoorAscent` grade history. Not
   every mode needs every category (e.g. "Analyze Past" already scopes to
   a date range and doesn't need the full exercise catalog) — sort out
   per-mode relevance rather than dumping everything into all three
   prompts uniformly.
2. **Add an optional category field to the AI JSON contract**
   (`schema.ts`'s `AIExercise`, e.g. `categoryName?: string`), validated
   the same permissive way every other optional field is, and wire it
   through `planImport.ts`: when creating a new exercise type, resolve
   `categoryName` against `AnalyticsCategory` by name (same
   case-insensitive exact-match convention `findExerciseTypeByName`/
   `findPhaseByName` already use) before falling back to today's
   first-non-archived default. **This is a schema change to the AI JSON
   contract, not to `TrainingData`** — it has its own independent
   shape/versioning (there is no version field on it today; consider
   whether it needs one once this lands) and is explicitly exempt from
   §7's "no schema changes" tripwire, which is about the persisted
   database only. Flag this distinction in `PROGRESS.md` when
   implementing, since it's an easy thing for a future session to
   misread as violating the tripwire.
3. **New Settings surface for what gets shared.** Sending health-adjacent
   personal data (sleep/HRV/RHR/bodyweight/pain) to an external AI service
   the user pastes this into is a real, distinct privacy decision from
   "does the AI have enough context to write a good plan" — the user
   should control it explicitly, not have it silently bundled in because
   it makes the plan better. A new subsection (working name "AI Sharing",
   under Settings' existing five-tab shell — decide at implementation time
   whether it's a General/Customization subsection or its own tab) with a
   toggle per data category this section adds: Training Blocks,
   Competitions, Readiness & Daily Metrics, Pain Logs, Outdoor Ascents.
   Persisted the same way every other device-local preference is (§5.1's
   `PreferencesStore`, not `TrainingData`). Toggles gate what
   `AIPromptModal.svelte` includes; a disabled category is simply omitted
   from the generated prompt, never sent-but-redacted.

### Open question forced by this stage

**Default state of the new sharing toggles.** Training Blocks/Competitions
are plan-structure data already adjacent to what's shared today (phases,
benchmarks) — **default on**. Readiness & Daily Metrics / Pain Logs are
health data in a stricter sense — **default off**, opt-in, so a user who
never opens the new settings section gets the same AI-sharing footprint as
before this stage, not a silent expansion into health data. Outdoor
Ascents is borderline (performance data, not health data) — **default
on**. Revisit if this reads wrong once built; not blocking, since every
toggle is changeable regardless of its starting value.

---

## 6. Sequencing

Ordered by risk and dependency. Each stage is independently shippable and
gets its own commit(s).

| Stage | Scope | Risk |
|---|---|---|
| 0 | Design system: tokens, type ramp, radii, spacing, status colours, text-scale + motion attributes. Preferences store + migration. Colour-literal audit. No behaviour change. | Low, wide |
| 1 | Shell & nav: `ViewType` `'home'`, 4 tabs + FAB, Settings/Analytics relocation, Home skeleton with static sections. | Low |
| 2 | Rolling ACWR (§5.3, behaviour change to `loadAnalytics.ts` + its tests) → readiness + fatigue engine (pure modules, tests first) → arms slider → daily-metrics quick-entry. Home fully populated. Rolling ACWR is its own commit, landing before anything consumes it. | Medium — new logic, all pure and testable |
| 3 | Low-risk stash ports: TimerWidget (context-aware), History Share wiring. | Low |
| 4 | History overhaul: overflow menu, month grouping, row content, filters. | Low |
| 5 | Analytics overhaul: sticky header, ACWR merge, colour fixes, fatigue panel, outdoor-ascents panel, bodyweight trend. | Medium |
| 6 | Plan screen: block timeline, day-grouped sessions, DnD + day picker. | Medium — DnD is the fiddly part |
| 7 | Workout form: inline targets, progress, quick-log, reorder, grouped picker. | Medium |
| 8 | **Notification id-ownership refactor first (§5.6, own commit)**, then the daily-metrics reminder, weather (home + trip forecast), and the full Appearance & Behaviour settings screen. | Medium — network + native |
| 9 | 7-column grid week layout as the alternate Plan view. | Deferred |
| 10 | AI integration (§5.8): expand prompt context (categories, load/fatigue, training blocks, competitions, readiness/metrics, pain logs, outdoor ascents), add a `categoryName` field to the AI JSON contract, and a new Settings surface for what gets shared with the AI. **Added 2026-09-18**, after Stage 7. | Medium — touches an existing AI JSON contract, plus a genuine privacy-default decision |

Stages 2 and 5 should get their pure logic written test-first, consistent
with how Phase 4's `loadAnalytics.ts` was built. Stage 10's new
`src/lib/ai/context.ts` (§5.8) should too, matching this project's
standing "pure data-shaping logic gets tests" convention.

---

## 7. Schema impact

**None.** Explicitly:

- No change to `TrainingData`.
- No `DATA_EXPORT_VERSION` bump.
- No migration step.
- `ViewType` gains `"home"` — a UI-only union, never persisted.
- `Workout.arms` is already declared and optional; collecting it writes an
  existing field.
- Preferences live in `localStorage` with their own independent version, fully
  outside the `TrainingData` chain.
- Stage 10's new `categoryName` field on the AI JSON contract
  (`src/lib/ai/schema.ts`'s `AIExercise`, §5.8) is **not** a `TrainingData`
  schema change — that contract is a separate, independently-shaped
  interface for AI-generated input, not part of the persisted database or
  its migration chain. It is called out explicitly here so it is never
  mistaken for a tripwire violation.

If any stage appears to require a `TrainingData` schema change, that is a
design problem to raise, not a migration to write.

**Not schema changes, but deliberate behaviour changes** — both require
updating existing tests, and both must be logged in `PROGRESS.md` rather than
absorbed silently:

- The ACWR definition moving from week buckets to a rolling window (§5.3) —
  affects `loadAnalytics.test.ts`.
- Notification id ownership replacing cancel-all (§5.6) — affects
  `fatigueReminder.test.ts`.

---

## 8. Explicitly not doing

- The stash's ACWR chart (superseded by Phase 4's `AcwrPanel` +
  `calculateAcwrForWeeks`).
- The 4-arg `calculateLoadFactor` / arms as a load axis (previously rejected;
  would retroactively change every historical `loadFactor`).
- Any `PhaseType`-based code from the stash (broken by `PhaseDef[]`).
- `actualReps` / "similar past sets" (superseded by the `prescribed`/`logged`
  split).
- Background timer execution.
- Theming `WorkoutShareImage` / `PDFExportModal`.
- `capacitor.config.json` / `vite.config.js` changes from the stash (deploy
  config, decide separately).
- Health-platform import — dropped from the project entirely on 2026-09-17,
  not deferred. If it comes up again it is a fresh question.

---

## 9. Optional / separate — small wins, independent of this overhaul

Flagged, not scheduled. Both are low-risk and orthogonal to the visual work;
either could ship before, during, or after any stage above.

**A. "Modality" → "Exercise Type" rename.** User-facing copy only.
`ExerciseTypeDef` is already the type's name in code, but the UI says
"Modality" in `ExerciseTypeSettings.svelte` (labels, placeholders, confirm
dialogs, aria-labels), `ExerciseSettings.svelte` (the `modalities` sub-tab),
and `BenchmarkTypeSettings.svelte`'s explanatory copy. No data, no ids, no
stored strings. ~15 string changes.

**B. 3-state parameter toggle → explicit dropdown.**
`ExerciseTypeSettings.svelte`'s `cycleParam()` cycles each parameter through
Unselected → Possible → Default → Unselected, communicated only by a
checkbox icon and a 7px caption. It is undiscoverable, and cycling backwards
is impossible. Replace with a per-parameter dropdown reading
`Off / Available / Default`, writing the same
`parameters` / `possibleParameters` arrays. Behaviour-preserving.

---

## 10. Open questions

**Resolved 2026-09-17** (kept here so the reasoning isn't lost):

- ~~Which ACWR ratio feeds the readiness penalty?~~ → Resolved by changing the
  metric itself to a rolling 7/28-day window. See §5.3.
- ~~Notification id ownership.~~ → Resolved: fixed as part of this work, first
  commit of Stage 8. See §5.6.

**Still open.** None of these block starting — each has a stated default that
holds until the relevant stage, and each is marked with the stage that forces
the answer.

1. **How prescriptive should readiness advice be?** *(forced by Stage 2.)*
   The stash's copy was quite medical: "Critical: ACWR indicates high injury
   risk. Absolute rest required."
   **Default until told otherwise:** describe state and its implication, don't
   issue instructions — "Fingers well above baseline; core and systemic are
   fresh" rather than "avoid limit bouldering". The athlete has context the
   app doesn't.
2. **Arms coverage.** *(forced by Stage 2.)* Historical sessions have no arms
   value, so that axis reads sparse for months.
   **Default:** show a coverage note ("arms: 4 of 27 sessions in window"), do
   not backfill, do not impute. Revisit once enough sessions carry the value.
3. **Weather geocoding.** *(forced by Stage 8.)* Setting a location makes one
   network call to Open-Meteo's geocoding endpoint.
   **Default:** allow city search for convenience, but also accept raw lat/lon
   entry so the feature is usable with no geocoding call at all.
4. **Reminder default times.** *(forced by Stage 8.)*
   **Default:** fatigue reminder keeps its current behaviour (session start +
   estimated duration + `FATIGUE_REMINDER_BUFFER_MINUTES`); daily-metrics
   reminder defaults to 20:00, configurable. Worth reconsidering a morning
   time — sleep and HRV are morning readings, so an evening nudge catches a
   miss while a morning one builds the habit.
5. **Grid view + drag-and-drop.** *(forced by Stage 9, already deferred.)* DnD
   inside a 7-column grid on a phone is materially harder than between stacked
   day groups.
   **Default:** grid gets horizontal scroll, and tap-to-move rather than drag
   if DnD proves unworkable there. The day-grouped list keeps full DnD.

**Standing, not a question — a discipline:**

6. **Verification gap.** This is a *visual* overhaul, and per `PROGRESS.md`'s
   standing convention most sessions have no browser available. Every stage
   above needs explicit manual verification by the user against the dev
   server, and `PROGRESS.md` must state plainly where that was deferred
   rather than claiming it happened. Do not let a visual change ship as
   "verified" on the strength of `npm run check` alone. Stage 2's logic is the
   one exception that genuinely *is* verifiable headlessly — it's pure
   functions, and it should be covered by tests to the same standard Phase 4's
   `loadAnalytics.ts` was.
