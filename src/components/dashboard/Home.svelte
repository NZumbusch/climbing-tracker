<script lang="ts">
  import { trainingState } from '../../lib/state.svelte';
  import { formatDate, getWeekIdRange, toUtcDayIndex } from '../../lib/dateUtils';
  import { generateId } from '../../lib/utils';
  import { DEFAULT_METRIC_DEFS } from '../../lib/constants';
  import { computeFatigueDecay, computeHrvBaseline, computeReadiness, type ReadinessStatus } from '../../lib/analytics/readiness';
  import { calculateRollingAcwr } from '../../lib/analytics/loadAnalytics';
  import { calculateWeeklyAdherence } from '../../lib/analytics/loadAnalytics';
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
  const RING_RADIUS = 42;
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
      <h2 class="text-title text-content">
        {currentPhaseName ?? 'Home'}{#if blockWeekPosition}<span class="text-content-subtle font-normal"> · Week {blockWeekPosition.week} of {blockWeekPosition.of}</span>{/if}
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

  <!-- Readiness hero -->
  <div class="bg-surface/50 border border-border rounded-card p-5 shadow-card flex items-center gap-5">
    <div class="relative w-24 h-24 shrink-0">
      <svg viewBox="0 0 100 100" class="w-24 h-24 -rotate-90">
        <circle cx="50" cy="50" r={RING_RADIUS} fill="none" stroke="var(--theme-border)" stroke-width="8" />
        {#if readiness.score !== undefined}
          <circle
            cx="50" cy="50" r={RING_RADIUS} fill="none" stroke-width="8" stroke-linecap="round"
            class={STATUS_COLOR[readiness.status]}
            stroke="currentColor"
            stroke-dasharray={RING_CIRCUMFERENCE}
            stroke-dashoffset={ringOffset}
          />
        {/if}
      </svg>
      <div class="absolute inset-0 flex items-center justify-center">
        <span class="text-display text-content tabular-nums">{readiness.score !== undefined ? Math.round(readiness.score) : '—'}</span>
      </div>
    </div>
    <div class="min-w-0 space-y-1">
      <span class="text-section uppercase {STATUS_COLOR[readiness.status]}">{readiness.status}</span>
      <p class="text-body text-content">{readiness.advice}</p>
      <p class="text-caption text-content-subtle">{readiness.confidence}</p>
    </div>
  </div>

  <!-- Today -->
  <div class="bg-surface/50 border border-border rounded-card p-5 shadow-card space-y-3">
    <div class="flex items-center gap-2 text-content-muted">
      <Icon icon="ic:baseline-today" class="text-lg" />
      <span class="text-section uppercase">Today</span>
    </div>
    {#each todaysWorkouts as workout}
      <div class="flex items-center justify-between p-3 bg-surface-elevated/50 rounded-control border border-border-strong/50">
        <div class="min-w-0 flex-1">
          <p class="text-body font-bold text-content truncate">{workout.notes}</p>
          <p class="text-caption text-content-subtle">{workout.exercises.length} exercises</p>
        </div>
        <button onclick={() => trainingState.navigate('add', workout)} class="text-label text-primary hover:scale-105 transition-transform shrink-0 ml-3">Start</button>
      </div>
    {:else}
      <div class="flex items-center justify-between gap-3">
        <p class="text-caption text-content-subtle italic">Nothing planned for today.</p>
        <button onclick={() => trainingState.navigate('add')} class="text-label text-primary shrink-0">Log a spontaneous session</button>
      </div>
    {/each}
  </div>

  <!-- Daily metrics quick-entry -->
  <div class="bg-surface/50 border border-border rounded-card p-5 shadow-card space-y-3">
    <div class="flex items-center gap-2 text-content-muted">
      <Icon icon="ic:baseline-favorite" class="text-lg" />
      <span class="text-section uppercase">Metrics</span>
    </div>
    {#each QUICK_METRICS as def}
      {@const entry = todaysMetric(def.id)}
      {@const spark = entriesFor(def.id).slice(-7)}
      <div class="flex items-center justify-between gap-3">
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

  <!-- Fatigue -->
  <div class="bg-surface/50 border border-border rounded-card p-5 shadow-card space-y-3">
    <div class="flex items-center gap-2 text-content-muted">
      <Icon icon="ic:baseline-bolt" class="text-lg" />
      <span class="text-section uppercase">Fatigue</span>
    </div>
    {#each FATIGUE_BARS as bar}
      {@const value = fatigueDecay[bar.key]}
      <div class="space-y-1">
        <div class="flex justify-between text-label text-content-subtle">
          <span>{bar.label}</span>
          <span class="tabular-nums">{value !== undefined ? value.toFixed(1) : '—'}</span>
        </div>
        <div class="h-2 bg-surface-elevated rounded-control overflow-hidden">
          <div class="h-full bg-primary rounded-control transition-all duration-500" style="width: {value !== undefined ? (value / 10) * 100 : 0}%"></div>
        </div>
      </div>
    {/each}
    {#if fatigueDecay.coverage.total > 0}
      <p class="text-caption text-content-subtle">Arms: {fatigueDecay.coverage.arms} of {fatigueDecay.coverage.total} sessions</p>
    {/if}
  </div>

  <!-- This Week -->
  <div class="bg-surface/50 border border-border rounded-card p-5 shadow-card space-y-1">
    <div class="flex items-center gap-2 text-content-muted">
      <Icon icon="ic:baseline-trending-up" class="text-lg" />
      <span class="text-section uppercase">This Week</span>
    </div>
    {#if weeklyAdherence.plannedLoad > 0 || weeklyAdherence.actualLoad > 0}
      <p class="text-body text-content">{Math.round(weeklyAdherence.actualLoad)} <span class="text-content-subtle">of</span> {Math.round(weeklyAdherence.plannedLoad)} <span class="text-content-subtle">planned load</span></p>
      <p class="text-caption text-content-subtle">{Math.round(weeklyAdherence.completionRate * 100)}% of prescribed exercises logged</p>
    {:else}
      <p class="text-caption text-content-subtle italic">No load logged yet this week.</p>
    {/if}
  </div>

  <!-- Training Block -->
  <div class="bg-surface/50 border border-border rounded-card p-5 shadow-card space-y-1">
    <div class="flex items-center gap-2 text-content-muted">
      <Icon icon="ic:baseline-view-week" class="text-lg" />
      <span class="text-section uppercase">Training Block</span>
    </div>
    {#if dominantBlock}
      <p class="text-body text-content">{dominantBlock.name}{currentPhaseName ? ` · ${currentPhaseName}` : ''}</p>
      {#if blockWeekPosition}
        <p class="text-caption text-content-subtle">Week {blockWeekPosition.week} of {blockWeekPosition.of}</p>
      {/if}
    {:else}
      <p class="text-caption text-content-subtle italic">No training block covers this week.</p>
    {/if}
  </div>

  <!-- Next Competition -->
  <div class="bg-surface/50 border border-border rounded-card p-5 shadow-card space-y-1">
    <div class="flex items-center gap-2 text-content-muted">
      <Icon icon="ic:baseline-flag" class="text-lg" />
      <span class="text-section uppercase">Next Competition</span>
    </div>
    {#if nextCompetition && daysUntilCompetition !== undefined}
      <p class="text-body text-content">{nextCompetition.name}</p>
      <p class="text-caption text-content-subtle">{daysUntilCompetition === 0 ? 'Today' : `${daysUntilCompetition} day${daysUntilCompetition === 1 ? '' : 's'} away`} · {formatDate(nextCompetition.date)}</p>
    {:else}
      <p class="text-caption text-content-subtle italic">No upcoming A-priority event.</p>
    {/if}
  </div>

  <!-- Recent Activity -->
  <div class="bg-surface/50 border border-border rounded-card p-5 shadow-card space-y-3">
    <div class="flex items-center gap-2 text-content-muted">
      <Icon icon="ic:baseline-history" class="text-lg" />
      <span class="text-section uppercase">Recent Activity</span>
    </div>
    {#each recentActivity as workout}
      <button onclick={() => trainingState.navigate('history')} class="w-full flex items-center justify-between p-2.5 bg-surface-elevated/50 rounded-control border border-border-strong/50 text-left hover:border-border-strong transition-colors">
        <div class="min-w-0">
          <p class="text-label text-content truncate">{workout.notes}</p>
          <p class="text-caption text-content-subtle">{formatDate(workout.date)}</p>
        </div>
        <Icon icon="ic:baseline-chevron-right" class="text-content-subtle shrink-0" />
      </button>
    {:else}
      <p class="text-caption text-content-subtle italic">No completed sessions yet.</p>
    {/each}
  </div>

  <!-- Weather (UI_PLAN.md §5.5/§8 - Stage 8, not yet built) -->
  <div class="bg-surface/50 border border-border rounded-card p-5 shadow-card space-y-1.5">
    <div class="flex items-center gap-2 text-content-muted">
      <Icon icon="ic:baseline-cloud" class="text-lg" />
      <span class="text-section uppercase">Weather</span>
    </div>
    <p class="text-caption text-content-subtle">Conditions at your home location will appear here once weather is set up in Settings (Stage 8).</p>
  </div>
</div>
