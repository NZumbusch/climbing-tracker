<script lang="ts">
  /**
   * Bodyweight tracking (PLAN.md Phase 6). Uses Phase 1's existing
   * MetricDef/DailyMetricEntry system - no new entity, per PLAN.md's own
   * scope note. One entry per date (upsert on save, keyed by date).
   */
  import { trainingState } from '../../lib/state.svelte';
  import { BODYWEIGHT_METRIC_ID } from '../../lib/constants';
  import { generateId } from '../../lib/utils';
  import { formatDate } from '../../lib/dateUtils';
  import type { DailyMetricEntry } from '../../lib/types';
  import Icon from '@iconify/svelte';

  function todayIso(): string {
    return new Date().toISOString().split('T')[0];
  }

  let date = $state(todayIso());
  let weight = $state<number | undefined>(undefined);

  const entries = $derived(
    trainingState.dailyMetrics
      .filter((m) => m.metricId === BODYWEIGHT_METRIC_ID)
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date)),
  );

  const latest = $derived(entries[0]);

  const chartEntries = $derived(entries.slice(0, 12).slice().reverse());
  const chartRange = $derived.by(() => {
    if (chartEntries.length === 0) return { min: 0, max: 0 };
    const values = chartEntries.map((e) => e.value);
    return { min: Math.min(...values), max: Math.max(...values) };
  });

  function barHeightPercent(value: number): number {
    const { min, max } = chartRange;
    if (max === min) return 50;
    return 10 + ((value - min) / (max - min)) * 80;
  }

  async function handleSave() {
    if (!weight || weight <= 0) return;

    // Upsert by date - re-logging the same day updates it rather than
    // creating a second entry for that date.
    const existing = trainingState.dailyMetrics.find(
      (m) => m.metricId === BODYWEIGHT_METRIC_ID && m.date === date,
    );

    const entry: DailyMetricEntry = {
      id: existing?.id ?? generateId(),
      metricId: BODYWEIGHT_METRIC_ID,
      date,
      value: weight,
    };

    await trainingState.saveDailyMetric(entry, { id: BODYWEIGHT_METRIC_ID, name: 'Bodyweight', unit: 'kg' });
    weight = undefined;
  }

  async function handleDelete(id: string) {
    await trainingState.deleteDailyMetric(id);
  }
</script>

<div class="bg-surface/50 border border-border rounded-3xl p-6 space-y-6 backdrop-blur-sm shadow-xl">
  <div class="flex items-center justify-between px-1">
    <div>
      <h3 class="text-xs font-bold text-content-muted uppercase tracking-widest">Bodyweight</h3>
      <p class="text-[9px] text-content-subtle uppercase mt-0.5">
        {#if latest}Latest: {latest.value} kg ({formatDate(latest.date)}){:else}No entries yet{/if}
      </p>
    </div>
    <div class="p-2 bg-primary-hover/10 rounded-xl text-primary">
      <Icon icon="ic:baseline-monitor-weight" class="text-lg" />
    </div>
  </div>

  <form onsubmit={(e) => { e.preventDefault(); handleSave(); }} class="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
    <div class="space-y-1">
      <label for="bw-date" class="text-[9px] font-bold text-content-subtle uppercase tracking-widest ml-1">Date</label>
      <input id="bw-date" type="date" bind:value={date} class="w-full bg-surface-elevated text-content p-3 rounded-xl border border-border-strong outline-none text-sm" />
    </div>
    <div class="space-y-1">
      <label for="bw-weight" class="text-[9px] font-bold text-content-subtle uppercase tracking-widest ml-1">Weight (kg)</label>
      <input id="bw-weight" type="number" step="0.1" min="0" bind:value={weight} placeholder="70.5" class="w-full bg-surface-elevated text-content p-3 rounded-xl border border-border-strong outline-none text-sm" />
    </div>
    <button type="submit" disabled={!weight} class="p-3 bg-primary hover:bg-primary-hover text-white rounded-xl shadow-lg transition-transform active:scale-95 disabled:opacity-50 disabled:pointer-events-none">
      <Icon icon="ic:baseline-add" class="text-xl" />
    </button>
  </form>

  {#if chartEntries.length > 1}
    <div class="h-28 flex items-end justify-between gap-1.5 px-1">
      {#each chartEntries as e}
        <div class="flex-1 flex flex-col items-center group relative h-full justify-end">
          <div
            class="w-full rounded-t-lg bg-gradient-to-t from-primary/60 to-primary transition-all duration-500 relative"
            style="height: {barHeightPercent(e.value)}%"
          >
            <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-surface-elevated text-[9px] font-black text-content rounded-lg opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap z-20 border border-border-strong shadow-2xl pointer-events-none">
              {e.value} kg
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  {#if entries.length > 0}
    <div class="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
      {#each entries as e}
        <div class="flex items-center justify-between p-2.5 bg-surface-elevated/50 rounded-xl border border-border-strong/50">
          <span class="text-xs font-bold text-content">{formatDate(e.date)}</span>
          <div class="flex items-center gap-3">
            <span class="text-xs font-mono text-content-muted">{e.value} kg</span>
            <button onclick={() => handleDelete(e.id)} class="text-content-subtle hover:text-danger transition-colors" aria-label="Delete entry">
              <Icon icon="ic:baseline-close" class="text-sm" />
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
