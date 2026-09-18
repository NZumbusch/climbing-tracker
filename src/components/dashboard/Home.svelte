<script lang="ts">
  import { onMount } from 'svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { formatDate, getWeekIdRange, toUtcDayIndex } from '../../lib/dateUtils';
  import { generateId } from '../../lib/utils';
  import { DEFAULT_METRIC_DEFS } from '../../lib/constants';
  import { computeFatigueDecay, computeHrvBaseline, computeReadiness, type ReadinessStatus } from '../../lib/analytics/readiness';
  import { calculateRollingAcwr } from '../../lib/analytics/loadAnalytics';
  import { calculateWeeklyAdherence } from '../../lib/analytics/loadAnalytics';
  import { describeWeatherCode } from '../../lib/weather/codes';
  import FatigueRadarChart from '../common/FatigueRadarChart.svelte';
  import type { DailyMetricEntry, DayOfWeek } from '../../lib/types';
  import Icon from "@iconify/svelte";

  // Stage 2 (UI_PLAN.md §6/§4.2): Home fully populated, on top of Stage 1's
  // skeleton. Every section below reads from `trainingState` or the pure
  // analytics modules directly - no new business logic lives in this file
  // beyond simple display derivations (day-of-week matching, sparkline
  // scaling) that have no other natural home.

  const asOf = new Date();
  const todayIso = asOf.toISOString().split('T')[0];
  const DAY_NAMES: DayOfWeek[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayName = DAY_NAMES[asOf.getDay()];
  const today = formatDate(asOf.toISOString());

  // --- Weather (UI_PLAN.md §5.5) - fetched once per mount, not on every
  // `refresh()` (a network call on every save would be excessive for
  // conditions that change over hours). No-ops per-location if it isn't set.
  onMount(() => {
    trainingState.refreshWeather();
  });

  function formatRelativeAge(iso: string): string {
    const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
  }

  // --- Header: block/phase context ---
  const currentWeekId = trainingState.currentWeekId;
  const dominantBlock = $derived(trainingState.getDominantBlockForWeek(currentWeekId));
  const currentPhaseName = $derived(
    dominantBlock ? trainingState.phaseDefs.find((p) => p.id === dominantBlock.phaseId)?.name : undefined,
  );
  const blockWeekPosition = $derived.by(() => {
    if (!dominantBlock) return undefined;
    const weeks = getWeekIdRange(dominantBlock.startWeekId, dominantBlock.endWeekId);
    const index = weeks.indexOf(currentWeekId);
    return index >= 0 ? { week: index + 1, of: weeks.length } : undefined;
  });

  // --- Readiness hero (UI_PLAN.md §5.2) ---
  const fatigueDecay = $derived(computeFatigueDecay(trainingState.completedWorkouts, asOf));
  const acwr = $derived(calculateRollingAcwr(trainingState.workouts, asOf));
  const hrvBaseline = $derived(computeHrvBaseline(trainingState.dailyMetrics, asOf));
  const todaysMetric = (metricId: string): DailyMetricEntry | undefined =>
    trainingState.dailyMetrics.find((m) => m.metricId === metricId && m.date === todayIso);
  const readiness = $derived(
    computeReadiness({
      fatigue: { fingers: fatigueDecay.fingers, core: fatigueDecay.core, systemic: fatigueDecay.systemic },
      acwr,
      sleep: todaysMetric('sleep-score')?.value,
      hrv: todaysMetric('hrv')?.value,
      hrvBaseline,
    }),
  );
  const STATUS_COLOR: Record<ReadinessStatus, string> = {
    good: 'text-status-good',
    caution: 'text-status-caution',
    risk: 'text-status-risk',
    neutral: 'text-status-neutral',
  };
  // Bold hero treatment (user-directed, 2026-09-18 - see PROGRESS.md
  // "Home card redesign") - a status-tinted gradient + border, translated
  // through this app's existing status tokens rather than the stash's
  // literal emerald/amber/rose. Full literal Tailwind class strings, not
  // built via template interpolation - Tailwind's JIT can't see classes
  // assembled at runtime, only ones it can find as complete strings.
  const STATUS_HERO_BG: Record<ReadinessStatus, string> = {
    good: 'bg-gradient-to-br from-status-good/15 via-surface to-surface border-status-good/30',
    caution: 'bg-gradient-to-br from-status-caution/15 via-surface to-surface border-status-caution/30',
    risk: 'bg-gradient-to-br from-status-risk/15 via-surface to-surface border-status-risk/30',
    neutral: 'bg-surface/50 border-border',
  };
  // Referenced from inline `style` (not a Tailwind class), so this one is
  // safe to build dynamically - `color-mix()` needs a real custom-property
  // reference, and `--theme-status-*` are already hex per-theme (never
  // channel triples), matching the `color-mix` fix `AcwrPanel.svelte`
  // already established rather than the stash's invalid `rgba(var(...))`.
  const STATUS_VAR: Record<ReadinessStatus, string> = {
    good: 'var(--theme-status-good)',
    caution: 'var(--theme-status-caution)',
    risk: 'var(--theme-status-risk)',
    neutral: 'var(--theme-status-neutral)',
  };
  const STATUS_ICON: Record<ReadinessStatus, string> = {
    good: 'ic:baseline-local-fire-department',
    caution: 'ic:baseline-info',
    risk: 'ic:baseline-warning-amber',
    neutral: 'ic:baseline-help-outline',
  };
  const RING_RADIUS = 44;
  const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
  const ringOffset = $derived(RING_CIRCUMFERENCE * (1 - (readiness.score ?? 0) / 100));

  // --- Today ---
  const todaysWorkouts = $derived(
    trainingState.getPlannedWorkoutsForWeek(currentWeekId).filter((w) => w.dayOfWeek === todayName),
  );

  // --- Daily metrics quick-entry (UI_PLAN.md §4.2 item 4 - well-known ids only) ---
  const QUICK_METRICS = DEFAULT_METRIC_DEFS.filter((d) => ['sleep-score', 'hrv', 'rhr'].includes(d.id));
  let editingMetricId = $state<string | null>(null);
  let draftValue = $state('');

  function entriesFor(metricId: string): DailyMetricEntry[] {
    return trainingState.dailyMetrics.filter((m) => m.metricId === metricId).slice().sort((a, b) => a.date.localeCompare(b.date));
  }
  function sparkHeightPercent(value: number, values: number[]): number {
    if (values.length === 0) return 0;
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (max === min) return 50;
    return 10 + ((value - min) / (max - min)) * 80;
  }
  function startEdit(metricId: string) {
    editingMetricId = metricId;
    draftValue = String(todaysMetric(metricId)?.value ?? '');
  }
  async function saveMetric(metricId: string) {
    const value = parseFloat(draftValue);
    if (Number.isNaN(value)) return;
    const def = QUICK_METRICS.find((d) => d.id === metricId)!;
    const existing = todaysMetric(metricId);
    await trainingState.saveDailyMetric({ id: existing?.id ?? generateId(), metricId, date: todayIso, value }, def);
    editingMetricId = null;
  }

  // --- Fatigue bars (UI_PLAN.md §5.4 - bars are the default; radar is an Appearance setting, Stage 8) ---
  const FATIGUE_BARS: { key: 'fingers' | 'arms' | 'core' | 'systemic'; label: string }[] = [
    { key: 'fingers', label: 'Fingers' },
    { key: 'arms', label: 'Arms' },
    { key: 'core', label: 'Core' },
    { key: 'systemic', label: 'Systemic' },
  ];

  // --- Weekly load progress ---
  const weeklyAdherence = $derived(calculateWeeklyAdherence(trainingState.workouts, currentWeekId));

  // --- Next competition countdown ---
  const nextCompetition = $derived.by(() => {
    const upcoming = trainingState.competitionEvents
      .filter((e) => e.priority === 'A' && e.date >= todayIso)
      .sort((a, b) => a.date.localeCompare(b.date));
    return upcoming[0];
  });
  const daysUntilCompetition = $derived(
    nextCompetition ? toUtcDayIndex(nextCompetition.date) - toUtcDayIndex(todayIso) : undefined,
  );

  // --- Recent activity ---
  const recentActivity = $derived(
    trainingState.completedWorkouts
      .slice()
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 3),
  );
</script>

<div class="w-full max-w-lg space-y-5 animate-in fade-in duration-700 pb-24">
  <div class="flex items-center justify-between px-1">
    <div>
      <p class="text-caption text-content-subtle">{today}</p>
      <h2 class="text-title text-content flex items-center gap-2 flex-wrap">
        <span>{currentPhaseName ?? 'Home'}</span>
        {#if blockWeekPosition}
          <span class="w-1 h-1 bg-surface-elevated-hover rounded-full flex-shrink-0"></span>
          <span class="text-content-subtle font-normal">Week {blockWeekPosition.week} of {blockWeekPosition.of}</span>
        {/if}
      </h2>
    </div>
    <button
      onclick={() => trainingState.navigate('settings')}
      class="p-2 bg-surface-elevated/50 rounded-control border border-border-strong/50 text-content-subtle hover:text-content transition-colors"
      aria-label="Settings"
    >
      <Icon icon="ic:baseline-settings" class="text-lg" />
    </button>
  </div>

  <!-- UI_PLAN.md §4.7 "Home sections show/hide + reorder": every section
       below is a snippet, rendered in `trainingState.homeSections`'
       user-configurable order, skipping any marked hidden. The header
       above is not part of this list - it's always shown, always first. -->

  {#snippet readinessSection()}
    <div
      class="relative overflow-hidden rounded-card border p-5 flex items-center gap-5 transition-colors {STATUS_HERO_BG[readiness.status]}"
      style="box-shadow: 0 14px 40px -18px color-mix(in srgb, {STATUS_VAR[readiness.status]} 45%, transparent), var(--shadow-card);"
    >
      <div class="relative w-28 h-28 shrink-0">
        <svg viewBox="0 0 100 100" class="w-28 h-28 -rotate-90">
          <circle cx="50" cy="50" r={RING_RADIUS} fill="none" stroke="var(--theme-border)" stroke-width="7" />
          {#if readiness.score !== undefined}
            <circle
              cx="50" cy="50" r={RING_RADIUS} fill="none" stroke-width="7" stroke-linecap="round"
              class={STATUS_COLOR[readiness.status]}
              stroke="currentColor"
              stroke-dasharray={RING_CIRCUMFERENCE}
              stroke-dashoffset={ringOffset}
              style="transition: stroke-dashoffset 700ms ease-out;"
            />
          {/if}
        </svg>
        <div class="absolute inset-0 flex flex-col items-center justify-center">
          <span class="text-display text-content tabular-nums leading-none">{readiness.score !== undefined ? Math.round(readiness.score) : '—'}</span>
        </div>
        <div class="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-surface border-2 border-app-bg shadow-card flex items-center justify-center {STATUS_COLOR[readiness.status]}">
          <Icon icon={STATUS_ICON[readiness.status]} class="text-base" />
        </div>
      </div>
      <div class="min-w-0 space-y-1.5">
        <span class="text-section uppercase {STATUS_COLOR[readiness.status]}">{readiness.status}</span>
        <p class="text-body text-content leading-snug">{readiness.advice}</p>
        <p class="text-caption text-content-subtle flex items-start gap-1">
          <Icon icon="ic:baseline-insights" class="text-content-subtle text-sm mt-0.5 shrink-0" />
          <span>{readiness.confidence}</span>
        </p>
      </div>
    </div>
  {/snippet}

  {#snippet sectionHeader(icon: string, label: string, subtitle?: string)}
    <div class="flex items-center justify-between">
      <div class="min-w-0">
        <span class="text-section uppercase text-content-muted">{label}</span>
        {#if subtitle}<p class="text-caption text-content-subtle mt-0.5">{subtitle}</p>{/if}
      </div>
      <div class="p-2 bg-primary-hover/10 rounded-control text-primary shrink-0 ml-3">
        <Icon {icon} class="text-lg" />
      </div>
    </div>
  {/snippet}

  {#snippet todaySection()}
    <div class="bg-surface/50 border border-border rounded-card p-5 shadow-card space-y-3">
      {@render sectionHeader('ic:baseline-today', 'Today', todaysWorkouts.length > 0 ? `${todaysWorkouts.length} session${todaysWorkouts.length === 1 ? '' : 's'} planned` : undefined)}
      {#each todaysWorkouts as workout}
        <div class="flex items-center justify-between p-3.5 bg-surface-elevated/50 rounded-control border border-border-strong/50">
          <div class="min-w-0 flex-1">
            <p class="text-body font-bold text-content truncate">{workout.notes}</p>
            <p class="text-caption text-content-subtle">{workout.exercises.length} exercises</p>
          </div>
          <button
            onclick={() => trainingState.navigate('add', workout)}
            class="flex items-center gap-1 px-3 py-1.5 bg-primary hover:bg-primary-hover text-white text-label font-bold rounded-control shrink-0 ml-3 transition-all active:scale-95 shadow-[0_4px_14px_-4px_color-mix(in_srgb,var(--color-primary)_60%,transparent)]"
          >
            <Icon icon="ic:baseline-play-arrow" class="text-sm" /> Start
          </button>
        </div>
      {:else}
        <div class="flex items-center justify-between gap-3">
          <p class="text-caption text-content-subtle italic">Nothing planned for today.</p>
          <button onclick={() => trainingState.navigate('add')} class="text-label text-primary shrink-0">Log a spontaneous session</button>
        </div>
      {/each}
    </div>
  {/snippet}

  {#snippet metricsSection()}
    <div class="bg-surface/50 border border-border rounded-card p-5 shadow-card space-y-3">
      {@render sectionHeader('ic:baseline-favorite', 'Metrics', 'Sleep, HRV, resting heart rate')}
      {#each QUICK_METRICS as def}
        {@const entry = todaysMetric(def.id)}
        {@const spark = entriesFor(def.id).slice(-7)}
        <div class="flex items-center justify-between gap-3 p-2.5 bg-surface-elevated/40 rounded-control border border-border-strong/30">
          <div class="min-w-0">
            <p class="text-label text-content-subtle">{def.name}</p>
            {#if editingMetricId === def.id}
              <form onsubmit={(e) => { e.preventDefault(); saveMetric(def.id); }} class="flex items-center gap-2 mt-1">
                <input type="number" step="0.1" bind:value={draftValue} class="w-20 bg-surface-elevated text-content p-1.5 rounded-control border border-border-strong outline-none text-sm" />
                <button type="submit" class="p-1.5 bg-primary hover:bg-primary-hover text-white rounded-control"><Icon icon="ic:baseline-check" class="text-sm" /></button>
                <button type="button" onclick={() => editingMetricId = null} class="p-1.5 text-content-subtle hover:text-content"><Icon icon="ic:baseline-close" class="text-sm" /></button>
              </form>
            {:else}
              <button onclick={() => startEdit(def.id)} class="text-body text-content tabular-nums hover:text-primary transition-colors">
                {entry ? `${entry.value} ${def.unit}` : 'Log'}
              </button>
            {/if}
          </div>
          {#if spark.length > 1}
            <div class="h-8 flex items-end gap-0.5 shrink-0">
              {#each spark as s}
                <div class="w-1.5 rounded-t-control bg-primary/50" style="height: {sparkHeightPercent(s.value, spark.map((v) => v.value))}%"></div>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/snippet}

  {#snippet fatigueSection()}
    <div class="bg-surface/50 border border-border rounded-card p-5 shadow-card space-y-4">
      {@render sectionHeader('ic:baseline-bolt', 'Fatigue', 'Exponentially-decayed load, per axis')}
      {#if trainingState.fatigueChartStyle === 'radar'}
        <FatigueRadarChart fingers={fatigueDecay.fingers} arms={fatigueDecay.arms} core={fatigueDecay.core} systemic={fatigueDecay.systemic} />
      {:else}
        {#each FATIGUE_BARS as bar}
          {@const value = fatigueDecay[bar.key]}
          <div class="space-y-1.5">
            <div class="flex justify-between text-label text-content-subtle">
              <span>{bar.label}</span>
              <span class="tabular-nums text-content">{value !== undefined ? value.toFixed(1) : '—'} <span class="text-content-subtle">/ 10</span></span>
            </div>
            <div class="flex gap-1 h-2.5">
              {#each Array(10) as _, i}
                <div class="flex-1 rounded-[2px] transition-colors duration-500 {value !== undefined && i < Math.round(value) ? 'bg-primary' : 'bg-surface-elevated border border-border-strong/50'}"></div>
              {/each}
            </div>
          </div>
        {/each}
      {/if}
      {#if fatigueDecay.coverage.total > 0}
        <p class="text-caption text-content-subtle">Arms: {fatigueDecay.coverage.arms} of {fatigueDecay.coverage.total} sessions</p>
      {/if}
    </div>
  {/snippet}

  {#snippet thisWeekSection()}
    <div class="bg-surface/50 border border-border rounded-card p-5 shadow-card space-y-3">
      {@render sectionHeader('ic:baseline-trending-up', 'This Week', 'Actual vs planned load')}
      {#if weeklyAdherence.plannedLoad > 0 || weeklyAdherence.actualLoad > 0}
        {@const percent = weeklyAdherence.plannedLoad > 0 ? Math.min(100, (weeklyAdherence.actualLoad / weeklyAdherence.plannedLoad) * 100) : 100}
        <div class="flex items-baseline justify-between">
          <p class="text-metric text-content tabular-nums">{Math.round(weeklyAdherence.actualLoad)} <span class="text-caption text-content-subtle font-normal">of {Math.round(weeklyAdherence.plannedLoad)}</span></p>
          <span class="text-label text-success">{Math.round(weeklyAdherence.completionRate * 100)}% logged</span>
        </div>
        <div class="h-2.5 bg-surface-elevated rounded-control overflow-hidden border border-border-strong/30">
          <div class="h-full bg-success rounded-control transition-all duration-700" style="width: {percent}%"></div>
        </div>
      {:else}
        <p class="text-caption text-content-subtle italic">No load logged yet this week.</p>
      {/if}
    </div>
  {/snippet}

  {#snippet trainingBlockSection()}
    <div class="bg-surface/50 border border-border rounded-card p-5 shadow-card space-y-2">
      {@render sectionHeader('ic:baseline-view-week', 'Training Block')}
      {#if dominantBlock}
        <p class="text-body text-content font-bold">{dominantBlock.name}{currentPhaseName ? ` · ${currentPhaseName}` : ''}</p>
        {#if blockWeekPosition}
          <div class="flex items-center gap-3">
            <span class="text-caption text-content-subtle shrink-0">Week {blockWeekPosition.week} of {blockWeekPosition.of}</span>
            <div class="flex gap-1 flex-1">
              {#each Array(blockWeekPosition.of) as _, i}
                <div class="flex-1 h-1.5 rounded-control {i < blockWeekPosition.week ? 'bg-primary' : 'bg-surface-elevated border border-border-strong/50'}"></div>
              {/each}
            </div>
          </div>
        {/if}
      {:else}
        <p class="text-caption text-content-subtle italic">No training block covers this week.</p>
      {/if}
    </div>
  {/snippet}

  {#snippet competitionSection()}
    <div class="bg-surface/50 border border-border rounded-card p-5 shadow-card space-y-2">
      {@render sectionHeader('ic:baseline-flag', 'Next Competition')}
      {#if nextCompetition && daysUntilCompetition !== undefined}
        <div class="flex items-center gap-4">
          <div class="text-center shrink-0 px-2">
            <p class="text-display text-primary tabular-nums leading-none">{daysUntilCompetition}</p>
            <p class="text-caption text-content-subtle uppercase mt-1">{daysUntilCompetition === 1 ? 'day' : 'days'}</p>
          </div>
          <div class="min-w-0 border-l border-border-strong/50 pl-4">
            <p class="text-body font-bold text-content truncate">{nextCompetition.name}</p>
            <p class="text-caption text-content-subtle">{daysUntilCompetition === 0 ? 'Today' : formatDate(nextCompetition.date)}</p>
          </div>
        </div>
      {:else}
        <p class="text-caption text-content-subtle italic">No upcoming A-priority event.</p>
      {/if}
    </div>
  {/snippet}

  {#snippet recentActivitySection()}
    <div class="bg-surface/50 border border-border rounded-card p-5 shadow-card space-y-3">
      {@render sectionHeader('ic:baseline-history', 'Recent Activity')}
      {#each recentActivity as workout}
        <button onclick={() => trainingState.navigate('history')} class="w-full flex items-center gap-3 p-2.5 bg-surface-elevated/50 rounded-control border border-border-strong/50 text-left hover:border-border-strong transition-colors">
          <div class="w-8 h-8 rounded-control bg-success/10 text-success flex items-center justify-center shrink-0">
            <Icon icon="ic:baseline-check" class="text-base" />
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-label text-content truncate">{workout.notes}</p>
            <p class="text-caption text-content-subtle">{formatDate(workout.date)}</p>
          </div>
          <Icon icon="ic:baseline-chevron-right" class="text-content-subtle shrink-0" />
        </button>
      {:else}
        <p class="text-caption text-content-subtle italic">No completed sessions yet.</p>
      {/each}
    </div>
  {/snippet}

  {#snippet weatherSection()}
    <div class="bg-surface/50 border border-border rounded-card p-5 shadow-card space-y-2">
      {@render sectionHeader('ic:baseline-cloud', 'Weather')}
      {#if !trainingState.homeLocation}
        <p class="text-caption text-content-subtle italic">Set a home location in Settings to see conditions here.</p>
      {:else if trainingState.homeWeather.unavailable}
        <p class="text-caption text-content-subtle italic">Weather is currently unavailable.</p>
      {:else if trainingState.homeWeather.snapshot}
        {@const w = trainingState.homeWeather.snapshot}
        {@const code = describeWeatherCode(w.currentWeatherCode)}
        <div class="flex items-center gap-3">
          <Icon icon={code.icon} class="text-3xl text-primary" />
          <div class="min-w-0">
            <p class="text-metric text-content tabular-nums">{Math.round(w.currentTempC)}°C</p>
            <p class="text-caption text-content-subtle truncate">{code.label} · {trainingState.homeLocation.name}</p>
          </div>
        </div>
        {#if trainingState.homeWeather.stale && trainingState.homeWeather.fetchedAt}
          <p class="text-caption text-warning">Stale - last updated {formatRelativeAge(trainingState.homeWeather.fetchedAt)}</p>
        {/if}
      {:else}
        <p class="text-caption text-content-subtle italic">Loading conditions…</p>
      {/if}
    </div>

    {#if trainingState.tripLocation}
      <div class="bg-surface/50 border border-border rounded-card p-5 shadow-card space-y-3">
        {@render sectionHeader('ic:baseline-luggage', 'Trip Forecast')}
        {#if trainingState.tripWeather.unavailable}
          <p class="text-caption text-content-subtle italic">Weather is currently unavailable.</p>
        {:else if trainingState.tripWeather.snapshot}
          {@const t = trainingState.tripWeather.snapshot}
          <p class="text-caption text-content-subtle">{trainingState.tripLocation.name}</p>
          <div class="flex gap-3 overflow-x-auto no-scrollbar pb-1">
            {#each t.daily as day}
              {@const code = describeWeatherCode(day.weatherCode)}
              <div class="flex flex-col items-center gap-1 shrink-0 w-12">
                <span class="text-caption text-content-subtle">{new Date(day.date).toLocaleDateString(undefined, { weekday: 'short' })}</span>
                <Icon icon={code.icon} class="text-lg text-primary" />
                <span class="text-caption text-content tabular-nums">{Math.round(day.tempMaxC)}°</span>
                <span class="text-caption text-content-subtle tabular-nums">{Math.round(day.tempMinC)}°</span>
              </div>
            {/each}
          </div>
          {#if trainingState.tripWeather.stale && trainingState.tripWeather.fetchedAt}
            <p class="text-caption text-warning">Stale - last updated {formatRelativeAge(trainingState.tripWeather.fetchedAt)}</p>
          {/if}
        {:else}
          <p class="text-caption text-content-subtle italic">Loading forecast…</p>
        {/if}
      </div>
    {/if}
  {/snippet}

  {#each trainingState.homeSections as section (section.id)}
    {#if section.visible}
      {#if section.id === 'readiness'}{@render readinessSection()}
      {:else if section.id === 'today'}{@render todaySection()}
      {:else if section.id === 'metrics'}{@render metricsSection()}
      {:else if section.id === 'fatigue'}{@render fatigueSection()}
      {:else if section.id === 'thisWeek'}{@render thisWeekSection()}
      {:else if section.id === 'trainingBlock'}{@render trainingBlockSection()}
      {:else if section.id === 'competition'}{@render competitionSection()}
      {:else if section.id === 'recentActivity'}{@render recentActivitySection()}
      {:else if section.id === 'weather'}{@render weatherSection()}
      {/if}
    {/if}
  {/each}
</div>
