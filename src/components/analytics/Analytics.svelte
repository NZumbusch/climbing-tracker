<script lang="ts">
  import { trainingState } from '../../lib/state.svelte';
  import { getWeekId, getWeekDates } from '../../lib/dateUtils';
  import type { Workout, ExerciseTypeDef, Benchmark, ExerciseCategory } from '../../lib/types';
  import { slotValues } from '../../lib/exerciseSlot';
  import {
    calculateAcwrForWeeks,
    calculateWeeklyAdherence,
    findRecoveryWarnings,
    correlatePainWithLoadSpikes,
    ACWR_SWEET_SPOT_MIN,
    ACWR_CAUTION_RATIO,
    ACWR_HIGH_RISK_RATIO,
    type AcwrResult,
  } from '../../lib/analytics/loadAnalytics';
  import { computeFatigueDecay } from '../../lib/analytics/readiness';
  import { parseFontGrade } from '../../lib/analytics/grades';
  import { BODYWEIGHT_METRIC_ID } from '../../lib/constants';
  import AdherencePanel from './AdherencePanel.svelte';
  import RecoveryWarningsPanel from './RecoveryWarningsPanel.svelte';
  import FatiguePanel from './FatiguePanel.svelte';
  import OutdoorAscentsPanel from './OutdoorAscentsPanel.svelte';
  import Icon from "@iconify/svelte";

  // Stage 5 (UI_PLAN.md §6/§4.6): sticky shared header + section-jump chips,
  // ACWR merged into Rolling Load (this file), and three new panels
  // (Fatigue, Outdoor Ascents, Bodyweight Trend). AdherencePanel/
  // RecoveryWarningsPanel/Benchmark Progress are otherwise unchanged -
  // Stage 0 already retrofitted their tokens/radii, so "restyle only"
  // needed no further edits there.

  // --- State ---
  const categories = $derived(trainingState.analyticsCategories);
  let selectedBenchmarkType = $state<string>('');
  let viewOffset = $state<number>(0);

  // --- Section-jump chips (§4.6: "one sticky header owning the week-window
  // control... add section-jump chips"). ACWR is merged into the Load panel
  // below, so its chip scrolls to the same anchor as Load - §4.6 still lists
  // it as a separate chip alongside Load/Mix/Fatigue/Adherence/Benchmarks,
  // so it's kept as a distinct (if same-target) entry rather than dropped. -->
  const SECTIONS: { id: string; label: string }[] = [
    { id: 'section-load', label: 'Load' },
    { id: 'section-mix', label: 'Mix' },
    { id: 'section-load', label: 'ACWR' },
    { id: 'section-fatigue', label: 'Fatigue' },
    { id: 'section-adherence', label: 'Adherence' },
    { id: 'section-benchmarks', label: 'Benchmarks' },
  ];
  function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // --- Training Mix Controls ---
  let showRelative = $state(true);
  let showSettings = $state(false);
  let includePlanned = $state(true);
  let hiddenCategoryIds = $state<Set<string>>(new Set());
  // --- Handlers ---
  function navigate(direction: 'prev' | 'next' | 'today') {
    if (direction === 'prev') viewOffset--;
    else if (direction === 'next') viewOffset++;
    else if (direction === 'today') viewOffset = 0;
  }

  // --- Logic: Data Processing ---

  /**
   * Derives chart data for the "Rolling Load" and "Exercise Volume" graphs.
   * Processes the last 12 weeks of data, aggregating total actual load, total
   * planned load, and counts of exercise categories.
   */
  const chartData = $derived.by(() => {
    const data = trainingState.workouts;
    const types = trainingState.exerciseTypes;

    // Quick lookup for assigning categories to recorded exercises
    const typeToCategory = new Map<string, ExerciseCategory>();
    types.forEach((t: ExerciseTypeDef) => typeToCategory.set(t.id, t.category));

    const completedWorkouts = data
      .filter((w: Workout) => w.status === 'completed' && w.date)
      .sort((a: Workout, b: Workout) => new Date(a.date!).getTime() - new Date(b.date!).getTime());

    const allRelevantWorkouts = data.filter(w => w.weekId);

    const weeksMap = new Map<string, {
      load: number,
      plannedLoad: number,
      completedCount: number,
      totalCount: number,
      categories: Record<string, number>,
      completedCategories: Record<string, number>
    }>();

    const weeksToDisplay: string[] = [];
    // Display 12 weeks at a time. If viewOffset is 0, show 9 weeks back to 2 weeks ahead.
    const startOffset = -9 + (viewOffset * 12);
    const endOffset = 2 + (viewOffset * 12);

    for (let i = startOffset; i <= endOffset; i++) {
      const d = new Date();
      d.setDate(d.getDate() + (i * 7));
      const id = getWeekId(d);
      weeksToDisplay.push(id);

      weeksMap.set(id, {
        load: 0,
        plannedLoad: 0,
        completedCount: 0,
        totalCount: 0,
        categories: Object.fromEntries(categories.map(c => [c.name, 0])),
        completedCategories: Object.fromEntries(categories.map(c => [c.name, 0]))
      });
    }

    // Only process workouts that fall within our displayed weeks
    const visibleWorkouts = allRelevantWorkouts.filter(w => weeksToDisplay.includes(w.weekId));

    visibleWorkouts.forEach((w: Workout) => {
      const week = weeksMap.get(w.weekId)!;

      week.plannedLoad += (w.plannedLoad || 0);
      week.totalCount += 1;

      if (w.status === 'completed') {
        week.load += (w.loadFactor || 0);
        week.completedCount += 1;
      }

      // Count exercises for both planned and completed to show Training Mix
      w.exercises?.forEach(slot => {
        let categoryName = slot.categoryId
          ? categories.find(c => c.id === slot.categoryId)?.name
          : typeToCategory.get(slot.typeId);

        // Every typeId is guaranteed resolvable to some ExerciseTypeDef
        // (Phase 1's migration creates an archived placeholder for any
        // that can't resolve a real one), so this is just a final
        // safety net, not name-matching guesswork.
        if (!categoryName) categoryName = 'Other';

        // Ensure category exists in map (if user deleted a category)
        if (!categories.find(c => c.name === categoryName)) {
           categoryName = categories.length > 0 ? categories[0].name : 'Other';
        }

        // Weight the ratio by duration (default to 30 mins if not specified)
        const exValues = slotValues(slot);
        const durationWeight = exValues.duration ? exValues.duration : 30;

        if (week.categories[categoryName] !== undefined) {
          week.categories[categoryName] += durationWeight;
        } else {
          week.categories[categoryName] = durationWeight;
        }

        if (w.status === 'completed') {
          if (week.completedCategories[categoryName] !== undefined) {
            week.completedCategories[categoryName] += durationWeight;
          } else {
            week.completedCategories[categoryName] = durationWeight;
          }
        }
      });
    });

    const sortedWeeks = weeksToDisplay.map(id => [id, weeksMap.get(id)!] as const);

    const getWeeklyTotal = (v: any) => v.load || 0;
    const getWeeklyPlannedTotal = (v: any) => v.plannedLoad || 0;

    const maxLoad = Math.max(...sortedWeeks.map(([_, v]) => Math.max(getWeeklyTotal(v), getWeeklyPlannedTotal(v))), 100) * 1.15;

    return {
      weeks: sortedWeeks.map(([id, data]) => ({
        id,
        label: id.split('-W')[1],
        totalLoad: getWeeklyTotal(data),
        totalPlannedLoad: getWeeklyPlannedTotal(data),
        categories: data.categories,
        completedCategories: data.completedCategories,
        totalDuration: Object.values(data.categories).reduce((a: number, b: number) => a + b, 0),
        isCurrent: id === trainingState.currentWeekId
      })),
      maxLoad
    };
  });

  // --- Phase 4: load analytics (ACWR/ramp-rate, adherence, recovery
  // warnings, injury-vs-load correlation) - scoped to the same visible
  // week window as the charts above, consistent with this view's existing
  // prev/next/today navigation rather than recomputing over full history.
  const orderedWeekIds = $derived(chartData.weeks.map((w) => w.id));
  const weekLabels = $derived(Object.fromEntries(chartData.weeks.map((w) => [w.id, `W${w.label}`])));
  const acwrResults = $derived(calculateAcwrForWeeks(trainingState.workouts, orderedWeekIds));
  const weeksWithCompletedSessions = $derived(new Set(trainingState.completedWorkouts.map((w) => w.weekId)));
  const weeklyAdherenceResults = $derived(
    orderedWeekIds
      .filter((id) => weeksWithCompletedSessions.has(id))
      .map((id) => calculateWeeklyAdherence(trainingState.workouts, id)),
  );
  const recoveryWarnings = $derived(findRecoveryWarnings(trainingState.workouts, trainingState.dailyMetrics, orderedWeekIds));
  const painCorrelations = $derived(correlatePainWithLoadSpikes(trainingState.painLogs, acwrResults));

  const visibleCategories = $derived(categories.filter(c => !hiddenCategoryIds.has(c.id)));
  const maxVisibleDuration = $derived(Math.max(...chartData.weeks.map(w => visibleCategories.reduce((acc, cat) => acc + ((includePlanned ? w.categories[cat.name] : w.completedCategories[cat.name]) || 0), 0)), 1));

  // --- Stage 5 (UI_PLAN.md §4.6): ACWR merged into the Rolling Load panel.
  // Same `AcwrResult[]` the standalone AcwrPanel used to render - only the
  // presentation moved, not the calculation (Stage 2's rolling ACWR is
  // consumed as-is, per this session's Stage 5 instruction).
  type RatioStatus = 'good' | 'caution' | 'risk' | 'neutral';
  const RATIO_STATUS_VAR: Record<RatioStatus, string> = {
    good: 'var(--color-status-good)',
    caution: 'var(--color-status-caution)',
    risk: 'var(--color-status-risk)',
    neutral: 'var(--color-status-neutral)',
  };
  function ratioStatus(r: AcwrResult): RatioStatus {
    if (r.ratio === undefined || !r.sufficient) return 'neutral';
    if (r.ratio >= ACWR_HIGH_RISK_RATIO) return 'risk';
    if (r.ratio >= ACWR_CAUTION_RATIO) return 'caution';
    return 'good';
  }
  const acwrDefinedRatios = $derived(acwrResults.filter((r) => r.ratio !== undefined).map((r) => r.ratio as number));
  const acwrMaxRatio = $derived(Math.max(...acwrDefinedRatios, ACWR_HIGH_RISK_RATIO) * 1.15);
  function ratioToY(ratio: number): number {
    return 100 - (ratio / acwrMaxRatio) * 100;
  }
  const acwrOverlayPoints = $derived(acwrResults.map((r, i) => {
    const week = chartData.weeks[i];
    return {
      weekId: r.weekId,
      x: ((i + 0.5) / Math.max(acwrResults.length, 1)) * 100,
      ratioY: r.ratio !== undefined ? ratioToY(r.ratio) : null,
      ratio: r.ratio,
      sufficient: r.sufficient,
      status: ratioStatus(r),
      spike: r.spike,
      rampRate: r.rampRate,
      barTopY: week ? 100 - (week.totalLoad / chartData.maxLoad) * 100 : 100,
    };
  }));
  function buildLineSegments(points: { x: number; y: number | null }[]): { x: number; y: number }[][] {
    const segments: { x: number; y: number }[][] = [];
    let current: { x: number; y: number }[] = [];
    for (const p of points) {
      if (p.y === null) {
        if (current.length > 1) segments.push(current);
        current = [];
      } else {
        current.push({ x: p.x, y: p.y });
      }
    }
    if (current.length > 1) segments.push(current);
    return segments;
  }
  const acwrRatioSegments = $derived(buildLineSegments(acwrOverlayPoints.map((p) => ({ x: p.x, y: p.ratioY }))));

  // --- Stage 5: Fatigue panel data (UI_PLAN.md §5.4) - `computeFatigueDecay`
  // sampled at each displayed week's end date, mirroring the sampling
  // pattern `calculateRollingAcwrSeries` established in Stage 2, so this is
  // a trend rather than duplicating Home's single "now" snapshot (§2: "Home
  // = now, Analytics = history, no duplicated panels").
  const fatigueSamples = $derived(chartData.weeks.map((w) => {
    const dates = getWeekDates(w.id);
    const asOf = dates ? dates.end : new Date();
    const decay = computeFatigueDecay(trainingState.completedWorkouts, asOf);
    return { weekId: w.id, fingers: decay.fingers, arms: decay.arms, core: decay.core, systemic: decay.systemic };
  }));
  const fatigueCoverage = $derived.by(() => {
    const inWindow = trainingState.completedWorkouts.filter((w) => w.weekId && orderedWeekIds.includes(w.weekId));
    const c = { total: inWindow.length, fingers: 0, arms: 0, core: 0, systemic: 0 };
    inWindow.forEach((w) => {
      if (w.fingers !== undefined) c.fingers++;
      if (w.arms !== undefined) c.arms++;
      if (w.core !== undefined) c.core++;
      if (w.systemic !== undefined) c.systemic++;
    });
    return c;
  });

  // --- Stage 5: Outdoor Ascents panel data (UI_PLAN.md §4.6) - grouped into
  // the same displayed week window, grade parsed via the new Font-grade
  // helper. Ascents whose grade doesn't parse are counted, never dropped
  // silently (see grades.ts's documented French-grade limitation).
  const outdoorAscentData = $derived.by(() => {
    const weekIdSet = new Set(orderedWeekIds);
    const byWeek = new Map<string, { id: string; grade: string; rank: number; date: string; name?: string; style?: string }[]>();
    let unparsedCount = 0;
    for (const a of trainingState.outdoorAscents) {
      const weekId = getWeekId(new Date(a.date));
      if (!weekIdSet.has(weekId)) continue;
      const rank = parseFontGrade(a.grade);
      if (rank === undefined) {
        unparsedCount++;
        continue;
      }
      if (!byWeek.has(weekId)) byWeek.set(weekId, []);
      byWeek.get(weekId)!.push({ id: a.id, grade: a.grade, rank, date: a.date, name: a.name, style: a.style });
    }
    return {
      weeks: orderedWeekIds.map((id) => ({ weekId: id, ascents: byWeek.get(id) ?? [] })),
      unparsedCount,
    };
  });

  // --- Stage 5: Bodyweight trend panel (UI_PLAN.md §4.6) - last 10 entries,
  // matching Benchmark Progress's own established "last 10, not window-
  // bound" precedent below. Uses a min/max-padded scale rather than
  // Benchmark Progress's 0-based one: bodyweight has no meaningful "0"
  // floor, and a 0-based scale would flatten a normal few-kg fluctuation
  // into an almost-flat line.
  const bodyweightTrend = $derived.by(() => {
    const entries = trainingState.dailyMetrics
      .filter((m) => m.metricId === BODYWEIGHT_METRIC_ID)
      .slice()
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-10);

    if (entries.length === 0) return { history: [], areaPath: '', linePath: '' };

    const maxValue = Math.max(...entries.map((e) => e.value)) * 1.02;
    const minValue = Math.min(...entries.map((e) => e.value)) * 0.98;
    const range = Math.max(maxValue - minValue, 0.1);

    const history = entries.map((e) => ({ ...e, height: ((e.value - minValue) / range) * 100 }));
    const count = history.length;
    const points = history.map((e, i) => ({ x: (i / Math.max(count - 1, 1)) * 100, y: 100 - e.height }));
    const areaPath = count > 1 ? `M 0,100 ${points.map((p) => `L ${p.x},${p.y}`).join(' ')} L 100,100 Z` : '';
    const linePath = count > 1 ? `M ${points.map((p) => `${p.x},${p.y}`).join(' L ')}` : '';

    return { history, areaPath, linePath };
  });

  /**
   * Derives chart data for the "Benchmark Progress" line graph.
   * Filters the last 10 historical entries for the currently selected benchmark type
   * and calculates SVG paths for the interactive line and area gradient.
   */
  const benchmarkProgress = $derived.by(() => {
    const data = trainingState.benchmarks;
    const benchmarkTypes = trainingState.benchmarkTypes;

    if (benchmarkTypes.length === 0) {
      return { types: [], history: [], maxValue: 1, unit: '', areaPath: '', linePath: '' };
    }

    const availableTypes = benchmarkTypes;

    // Use a local variable for the effective selection to avoid mutating state in derived
    let effectiveTypeId = selectedBenchmarkType;
    if (!effectiveTypeId || !availableTypes.find(t => t.id === effectiveTypeId)) {
      effectiveTypeId = availableTypes[0].id;
    }

    const filtered = data
      .filter(b => b.typeId === effectiveTypeId)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-10);

    const maxValue = filtered.length > 0 ? Math.max(...filtered.map(b => b.value), 1) * 1.25 : 1;
    const selectedTypeInfo = availableTypes.find(t => t.id === effectiveTypeId);
    const unit = selectedTypeInfo ? selectedTypeInfo.unit : '';

    const history = filtered.map(b => ({
      ...b,
      height: (b.value / maxValue) * 100
    }));

    const count = history.length;
    const points = history.map((b, i) => ({
      x: (i / Math.max(count - 1, 1)) * 100,
      y: 100 - b.height
    }));

    const areaPath = count > 1 ? `M 0,100 ${points.map(p => `L ${p.x},${p.y}`).join(' ')} L 100,100 Z` : '';
    const linePath = count > 1 ? `M ${points.map(p => `${p.x},${p.y}`).join(' L ')}` : '';

    return {
      types: availableTypes,
      history,
      maxValue,
      unit,
      areaPath,
      linePath
    };
  });

  $effect(() => {
    const benchmarkTypes = trainingState.benchmarkTypes;
    if (benchmarkTypes.length > 0) {
      if (!selectedBenchmarkType || !benchmarkTypes.find(t => t.id === selectedBenchmarkType)) {
        selectedBenchmarkType = benchmarkTypes[0].id;
      }
    }
  });
</script>

<div class="w-full max-w-lg space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-24">
  <div class="sticky top-0 z-20 pb-3 bg-surface/95 backdrop-blur-sm space-y-3">
    <div class="flex items-center justify-between px-1">
      <h2 class="text-title text-content">Analytics</h2>
      <button
        onclick={() => trainingState.exportToCSV()}
        class="flex items-center gap-2 px-3 py-2 bg-surface-elevated hover:bg-surface-elevated-hover text-content-muted hover:text-content rounded-control border border-border-strong/50 transition-all text-label active:scale-95"
      >
        <Icon icon="ic:baseline-download" class="text-sm" />
        CSV Export
      </button>
    </div>

    <div class="flex items-center justify-between gap-2 px-1">
      <div class="flex gap-1.5 overflow-x-auto no-scrollbar">
        {#each SECTIONS as s}
          <button
            onclick={() => scrollToSection(s.id)}
            class="shrink-0 px-3 py-1.5 bg-surface-elevated/50 hover:bg-surface-elevated text-label text-content-muted hover:text-content rounded-control border border-border-strong/50 transition-colors"
          >
            {s.label}
          </button>
        {/each}
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <button onclick={() => navigate('today')} class="px-2 py-1 bg-surface-elevated/50 hover:bg-surface-elevated text-label text-content-muted hover:text-content rounded-control transition-all active:scale-95 border border-border-strong/50">Today</button>
        <div class="flex bg-surface/50 rounded-control border border-border p-1">
          <button onclick={() => navigate('prev')} class="p-1.5 hover:bg-surface-elevated text-content-subtle hover:text-content rounded-control transition-colors"><Icon icon="ic:baseline-chevron-left" class="text-lg" /></button>
          <button onclick={() => navigate('next')} class="p-1.5 hover:bg-surface-elevated text-content-subtle hover:text-content rounded-control transition-colors"><Icon icon="ic:baseline-chevron-right" class="text-lg" /></button>
        </div>
      </div>
    </div>
  </div>

  <div class="space-y-5">
    <div id="section-load" class="scroll-mt-28 bg-surface/50 border border-border rounded-card p-5 space-y-4 shadow-card overflow-hidden relative">
      <div class="px-1 relative z-10">
        <h3 class="text-section uppercase text-content-muted">Rolling Load</h3>
        <p class="text-caption text-content-subtle mt-0.5">Weekly targets vs actual output, with acute:chronic load ratio overlay</p>
      </div>

      <div class="h-56 flex flex-col gap-2 relative z-10 px-1">
        <!-- Chart Area -->
        <div class="flex-1 relative flex items-end justify-between gap-2">
          <!-- Grid Lines -->
          <div class="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20 py-2">
            <div class="border-t border-border-strong w-full"></div>
            <div class="border-t border-border-strong w-full"></div>
            <div class="border-t border-border-strong w-full"></div>
          </div>

          <!-- ACWR sweet-spot / caution / risk bands (UI_PLAN.md §3.3/§4.6) -->
          <svg class="absolute inset-0 w-full h-full overflow-visible pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
            <rect x="0" y={ratioToY(acwrMaxRatio)} width="100" height={Math.max(ratioToY(ACWR_HIGH_RISK_RATIO) - ratioToY(acwrMaxRatio), 0)} fill="var(--color-status-risk)" opacity="0.08" />
            <rect x="0" y={ratioToY(ACWR_HIGH_RISK_RATIO)} width="100" height={Math.max(ratioToY(ACWR_CAUTION_RATIO) - ratioToY(ACWR_HIGH_RISK_RATIO), 0)} fill="var(--color-status-caution)" opacity="0.08" />
            <rect x="0" y={ratioToY(ACWR_CAUTION_RATIO)} width="100" height={Math.max(ratioToY(ACWR_SWEET_SPOT_MIN) - ratioToY(ACWR_CAUTION_RATIO), 0)} fill="var(--color-status-good)" opacity="0.08" />
          </svg>

          <!-- Planned Load Line (SVG) -->
          <svg
            class="absolute inset-0 w-full h-full overflow-visible pointer-events-none"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {#if chartData.weeks.length > 1}
              {@const planPoints = chartData.weeks.map((w, i) => ({
                x: ((i + 0.5) / chartData.weeks.length) * 100,
                y: 100 - (w.totalPlannedLoad / chartData.maxLoad) * 100,
                val: w.totalPlannedLoad
              }))}

              {@const connectedPoints = planPoints.filter(p => p.val > 0)}

              {#if connectedPoints.length > 1}
                <path
                  d="M {connectedPoints.map(p => `${p.x} ${p.y}`).join(' L ')}"
                  fill="none"
                  stroke="var(--color-success)"
                  stroke-width="2"
                  stroke-dasharray="4 3"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  vector-effect="non-scaling-stroke"
                  class="transition-all duration-1000"
                />
              {/if}

              <!-- Target Dots -->
              {#each planPoints as p}
                {#if p.val > 0}
                  <circle cx={p.x} cy={p.y} r="1.5" fill="var(--color-success)" class="transition-all duration-1000" />
                {/if}
              {/each}
            {/if}
          </svg>

          {#each chartData.weeks as week}
            <div class="flex-1 flex flex-col items-center group relative h-full justify-end">
              <div
                class="w-full bg-gradient-to-t from-primary/60 to-primary-hover rounded-t-lg transition-all duration-700 group-hover:from-primary group-hover:to-primary-hover relative shadow-[0_-4px_12px_color-mix(in_srgb,var(--color-primary)_20%,transparent)]"
                style="height: {(week.totalLoad / chartData.maxLoad) * 100}%"
              >
                <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 px-2 py-1.5 bg-surface-elevated text-caption text-content rounded-control opacity-0 group-hover:opacity-100 transition-all scale-95 group-hover:scale-100 whitespace-nowrap z-20 border border-border-strong shadow-card pointer-events-none">
                  <div class="flex flex-col gap-1">
                    <div class="flex items-center gap-2">
                      <div class="w-1.5 h-1.5 rounded-full bg-primary-hover"></div>
                      <span>Actual: {Math.round(week.totalLoad)}</span>
                    </div>
                    <div class="flex items-center gap-2 text-success-hover">
                      <div class="w-1.5 h-1.5 rounded-full bg-success-hover"></div>
                      <span>Target: {Math.round(week.totalPlannedLoad)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          {/each}

          <!-- ACWR ratio line (SVG, on top of the bars) -->
          <svg class="absolute inset-0 w-full h-full overflow-visible pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
            {#each acwrRatioSegments as seg}
              <path
                d="M {seg.map((p) => `${p.x} ${p.y}`).join(' L ')}"
                fill="none"
                stroke="var(--theme-border-strong)"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                vector-effect="non-scaling-stroke"
              />
            {/each}
          </svg>

          <!-- ACWR ratio dots + ramp-rate spike flags (HTML, so they get the same hover-tooltip treatment as the bars/dashed line above) -->
          <div class="absolute inset-0 pointer-events-none">
            {#each acwrOverlayPoints as p}
              {#if p.ratioY !== null}
                <div class="absolute pointer-events-auto group" style="left: {p.x}%; top: {p.ratioY}%; transform: translate(-50%, -50%);">
                  <div
                    class="w-2.5 h-2.5 rounded-full border-2 transition-transform group-hover:scale-150"
                    style="background: {p.sufficient ? RATIO_STATUS_VAR[p.status] : 'transparent'}; border-color: {RATIO_STATUS_VAR[p.status]};"
                  ></div>
                  <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1.5 bg-surface-elevated text-caption text-content rounded-control opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap z-30 border border-border-strong shadow-card pointer-events-none">
                    ACWR: {p.ratio?.toFixed(2)}{!p.sufficient ? ' · building history' : ''}
                  </div>
                </div>
              {/if}
              {#if p.spike}
                <div class="absolute pointer-events-auto group" style="left: {p.x}%; top: {Math.max(p.barTopY - 8, 2)}%; transform: translate(-50%, -50%);">
                  <Icon icon="ic:baseline-warning" class="text-status-risk text-sm drop-shadow" />
                  <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1.5 bg-surface-elevated text-caption text-content rounded-control opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap z-30 border border-border-strong shadow-card pointer-events-none">
                    Ramp-rate spike: +{Math.round(p.rampRate * 100)}%
                  </div>
                </div>
              {/if}
            {/each}
          </div>
        </div>

        <!-- X-Axis Labels -->
        <div class="flex justify-between gap-2 h-4">
          {#each chartData.weeks as week}
            <div class="flex-1 flex justify-center">
              <span class="text-caption text-content-subtle {week.isCurrent ? 'text-primary' : ''}">W{week.label}</span>
            </div>
          {/each}
        </div>
      </div>

      <div class="flex items-center gap-4 px-1 pt-2 relative z-10 flex-wrap">
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 rounded-control bg-gradient-to-t from-primary/80 to-primary-hover"></div>
          <span class="text-label text-content-muted">Actual Output</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="w-4 h-0 border-t-2 border-dashed border-success"></div>
          <span class="text-label text-content-muted">Target Path</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="w-2.5 h-2.5 rounded-full border-2" style="border-color: var(--color-status-good);"></div>
          <span class="text-label text-content-muted">ACWR (sweet spot / caution / risk)</span>
        </div>
      </div>

      {#if acwrResults.length === 0}
        <p class="text-caption text-content-subtle italic text-center py-2">No completed sessions yet</p>
      {/if}
    </div>

    <div id="section-mix" class="scroll-mt-28 bg-surface/50 border border-border rounded-card p-5 space-y-4 backdrop-blur-sm shadow-card relative z-30">
      <div class="flex flex-col gap-4 px-1 relative z-50">
        <div>
          <h3 class="text-section uppercase text-content-muted">Training Mix</h3>
          <p class="text-caption text-content-subtle mt-0.5">Activity breakdown by category</p>
        </div>

        <div class="flex items-center justify-between gap-4 border-t border-border/50 pt-4">
          <div class="relative z-50">
            <button
              onclick={() => showSettings = !showSettings}
              class="flex items-center gap-2 px-3 py-1.5 bg-surface-elevated/50 hover:bg-surface-elevated border border-border-strong/50 rounded-control transition-colors text-label text-content-muted hover:text-content"
            >
              <Icon icon="ic:baseline-settings" />
              Graph Settings
            </button>

            {#if showSettings}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="fixed inset-0 z-40" onclick={() => showSettings = false}></div>
              <div class="absolute top-full left-0 mt-2 w-56 bg-surface border border-border-strong rounded-card shadow-card z-50 p-3 space-y-4 animate-in fade-in zoom-in-95 origin-top-left">

                <div class="space-y-2">
                  <h4 class="text-section uppercase text-content-subtle mb-2 px-1">Display Mode</h4>
                  <label class="flex items-center justify-between cursor-pointer group px-1">
                    <span class="text-label text-content-muted">Relative (%)</span>
                    <div class="relative inline-flex items-center">
                      <input type="checkbox" bind:checked={showRelative} class="sr-only peer" />
                      <div class="w-8 h-4 bg-surface-elevated-hover rounded-full peer peer-checked:after:translate-x-4 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary-hover"></div>
                    </div>
                  </label>
                  <label class="flex items-center justify-between cursor-pointer group px-1">
                    <span class="text-label text-content-muted">Include Planned</span>
                    <div class="relative inline-flex items-center">
                      <input type="checkbox" bind:checked={includePlanned} class="sr-only peer" />
                      <div class="w-8 h-4 bg-surface-elevated-hover rounded-full peer peer-checked:after:translate-x-4 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-success-hover"></div>
                    </div>
                  </label>
                </div>

                <div class="border-t border-border pt-3">
                  <h4 class="text-section uppercase text-content-subtle mb-2 px-1">Visible Categories</h4>
                  <div class="space-y-1">
                    {#each categories as cat}
                      <label class="flex items-center gap-3 p-1.5 hover:bg-surface-elevated rounded-control cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          checked={!hiddenCategoryIds.has(cat.id)}
                          onchange={(e) => {
                            if (e.currentTarget.checked) {
                              hiddenCategoryIds.delete(cat.id);
                            } else {
                              hiddenCategoryIds.add(cat.id);
                            }
                            hiddenCategoryIds = new Set(hiddenCategoryIds);
                          }}
                          class="w-3.5 h-3.5 bg-surface-elevated border-border-strong rounded text-primary focus:ring-primary/50 focus:ring-offset-surface"
                        />
                        <div class="w-2.5 h-2.5 rounded-full {cat.color}"></div>
                        <span class="text-label text-content">{cat.name}</span>
                      </label>
                    {/each}
                  </div>
                </div>
              </div>
            {/if}
          </div>
        </div>
      </div>

      <div class="h-48 flex items-end justify-between gap-2 px-1 relative">
        {#each chartData.weeks as week}
          {@const visibleTotalDuration = visibleCategories.reduce((acc, cat) => acc + ((includePlanned ? week.categories[cat.name] : week.completedCategories[cat.name]) || 0), 0)}
          {@const weekHeightPercent = showRelative ? (visibleTotalDuration > 0 ? 100 : 0) : (visibleTotalDuration / maxVisibleDuration) * 100}
          <div class="flex-1 flex flex-col items-center gap-2 group relative h-full justify-end">
            <div class="w-full flex flex-col-reverse rounded-t-lg overflow-hidden justify-end shadow-lg transition-all duration-500"
                 style="height: {weekHeightPercent}%">
              {#each visibleCategories as cat}
                {@const catDuration = (includePlanned ? week.categories[cat.name] : week.completedCategories[cat.name]) || 0}
                {#if catDuration > 0 && visibleTotalDuration > 0}
                  <div
                    class="{cat.color} w-full border-t border-border/20 first:border-0 opacity-90 hover:opacity-100 transition-opacity relative group/bar"
                    style="height: {(catDuration / visibleTotalDuration) * 100}%"
                  >
                    <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-surface-elevated text-caption text-content rounded-control opacity-0 group-hover/bar:opacity-100 transition-all pointer-events-none z-30 whitespace-nowrap shadow-card border border-border-strong">
                      {cat.name}: {Math.round(catDuration)} min
                    </div>
                  </div>
                {/if}
              {/each}
            </div>
            <span class="text-caption text-content-subtle group-hover:text-content-muted">W{week.label}</span>
          </div>
        {/each}
      </div>

      <div class="flex flex-wrap gap-x-4 gap-y-2 px-1 pt-2 relative z-10">
        {#each visibleCategories as cat}
          <div class="flex items-center gap-2">
            <div class="w-2.5 h-2.5 rounded-full {cat.color} shadow-[0_0_8px_rgba(0,0,0,0.3)]"></div>
            <span class="text-label text-content-subtle">{cat.name}</span>
          </div>
        {/each}
      </div>
    </div>

    <div id="section-fatigue" class="scroll-mt-28">
      <FatiguePanel samples={fatigueSamples} {weekLabels} coverage={fatigueCoverage} />
    </div>

    <div id="section-adherence" class="scroll-mt-28">
      <AdherencePanel results={weeklyAdherenceResults} {weekLabels} />
    </div>

    <RecoveryWarningsPanel warnings={recoveryWarnings} {painCorrelations} />

    <OutdoorAscentsPanel weeks={outdoorAscentData.weeks} {weekLabels} unparsedCount={outdoorAscentData.unparsedCount} />

    <div class="bg-surface/50 border border-border rounded-card p-5 space-y-4 backdrop-blur-sm shadow-card">
      <div class="flex items-center justify-between px-1">
        <div>
          <h3 class="text-section uppercase text-content-muted">Bodyweight Trend</h3>
          <p class="text-caption text-content-subtle mt-0.5">Last {bodyweightTrend.history.length || 10} entries</p>
        </div>
        <div class="p-2 bg-primary-hover/10 rounded-control text-primary">
          <Icon icon="ic:baseline-monitor-weight" class="text-lg" />
        </div>
      </div>

      {#if bodyweightTrend.history.length > 0}
        <div class="h-40 relative px-1">
          <div class="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20 py-2">
            <div class="border-t border-border-strong w-full"></div>
            <div class="border-t border-border-strong w-full"></div>
            <div class="border-t border-border-strong w-full"></div>
          </div>

          <svg class="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
            <defs>
              <linearGradient id="bodyweight-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="var(--color-primary)" stop-opacity="0.3" />
                <stop offset="100%" stop-color="var(--color-primary)" stop-opacity="0" />
              </linearGradient>
            </defs>
            {#if bodyweightTrend.history.length > 1}
              <path d={bodyweightTrend.areaPath} fill="url(#bodyweight-gradient)" class="transition-all duration-700" />
              <path d={bodyweightTrend.linePath} fill="none" stroke="var(--color-primary)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="transition-all duration-700" />
            {/if}
          </svg>

          <div class="absolute inset-0 flex justify-between items-end h-full">
            {#each bodyweightTrend.history as entry, i}
              {@const xPos = (i / Math.max(bodyweightTrend.history.length - 1, 1)) * 100}
              <div class="absolute flex flex-col items-center group" style="left: {xPos}%; height: 100%;">
                <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 px-2 py-1 bg-surface-elevated text-caption text-content rounded-control opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20 border border-border-strong shadow-card pointer-events-none">
                  {entry.value} kg
                </div>
                <div class="w-3 h-3 bg-primary-hover rounded-full border-4 border-surface shadow-lg group-hover:scale-150 transition-transform z-10 absolute -translate-x-1/2" style="bottom: {entry.height}%; left: 0;"></div>
                <span class="text-caption text-content-subtle group-hover:text-content-muted absolute top-full mt-2 rotate-[-45deg] origin-top-left whitespace-nowrap">
                  {new Date(entry.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              </div>
            {/each}
          </div>
        </div>
        <div class="h-6"></div>
      {:else}
        <p class="text-caption text-content-subtle italic text-center py-4 px-4 leading-relaxed">Log your bodyweight in Settings › Health to see your trend</p>
      {/if}
    </div>

    {#if benchmarkProgress.types.length > 0}
      <div id="section-benchmarks" class="scroll-mt-28 bg-surface/50 border border-border rounded-card p-5 space-y-4 backdrop-blur-sm shadow-card">
        <div class="flex items-center justify-between px-1">
          <div>
            <h3 class="text-section uppercase text-content-muted">Benchmark Progress</h3>
            <div class="relative mt-1">
              <select
                bind:value={selectedBenchmarkType}
                class="bg-transparent text-label text-primary outline-none appearance-none pr-4 cursor-pointer"
              >
                {#each benchmarkProgress.types as type}
                  <option value={type.id}>{type.name}</option>
                {/each}
              </select>
              <Icon icon="ic:baseline-arrow-drop-down" class="absolute right-0 top-1/2 -translate-y-1/2 text-primary pointer-events-none" />
            </div>
          </div>
          <div class="p-2 bg-primary-hover/10 rounded-control text-primary">
            <Icon icon="ic:baseline-insights" class="text-lg" />
          </div>
        </div>

        <div class="h-48 relative px-1">
          <!-- Grid Lines -->
          <div class="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20 py-2">
            <div class="border-t border-border-strong w-full"></div>
            <div class="border-t border-border-strong w-full"></div>
            <div class="border-t border-border-strong w-full"></div>
          </div>

          <!-- SVG Line Graph -->
          <svg class="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
            <defs>
              <linearGradient id="line-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="var(--color-primary)" stop-opacity="0.3" />
                <stop offset="100%" stop-color="var(--color-primary)" stop-opacity="0" />
              </linearGradient>
            </defs>

            {#if benchmarkProgress.history.length > 1}
              <!-- Area under line -->
              <path
                d={benchmarkProgress.areaPath}
                fill="url(#line-gradient)"
                class="transition-all duration-700"
              />

              <!-- The Line -->
              <path
                d={benchmarkProgress.linePath}
                fill="none"
                stroke="var(--color-primary)"
                stroke-width="3"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="transition-all duration-700"
              />
            {/if}
          </svg>

          <!-- Data Points & Labels -->
          <div class="absolute inset-0 flex justify-between items-end h-full">
            {#each benchmarkProgress.history as entry, i}
              {@const xPos = (i / Math.max(benchmarkProgress.history.length - 1, 1)) * 100}
              <div class="absolute flex flex-col items-center group" style="left: {xPos}%; height: 100%;">
                <!-- Tooltip -->
                <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 px-2 py-1 bg-surface-elevated text-caption text-content rounded-control opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20 border border-border-strong shadow-card pointer-events-none">
                  {entry.value} {entry.unit}
                </div>

                <!-- Dot -->
                <div
                  class="w-3 h-3 bg-primary-hover rounded-full border-4 border-surface shadow-lg group-hover:scale-150 transition-transform z-10 absolute -translate-x-1/2"
                  style="bottom: {entry.height}%; left: 0;"
                ></div>

                <!-- Date Label -->
                <span class="text-caption text-content-subtle group-hover:text-content-muted absolute top-full mt-2 rotate-[-45deg] origin-top-left whitespace-nowrap">
                  {new Date(entry.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              </div>
            {/each}
          </div>

          {#if benchmarkProgress.history.length === 0}
            <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
              <p class="text-caption text-content-subtle italic text-center px-4 leading-relaxed">
                Log a {benchmarkProgress.types.find(t => t.id === selectedBenchmarkType)?.name || 'benchmark'} to see your progress
              </p>
            </div>
          {/if}
        </div>
        <div class="h-6"></div> <!-- Spacer for rotated labels -->
      </div>
    {/if}

    {#if trainingState.completedWorkouts.length === 0}
      <div class="py-12 text-center bg-surface-elevated/20 rounded-card border border-dashed border-border">
        <Icon icon="ic:baseline-insights" class="text-3xl text-content-subtle mx-auto mb-3" />
        <p class="text-caption text-content-subtle italic px-8 leading-relaxed">
          Complete some sessions to unlock detailed training analytics
        </p>
      </div>
    {/if}
  </div>
</div>
