<script lang="ts">
  /**
   * Acute:chronic workload ratio / ramp-rate panel (PLAN.md Phase 4).
   * Mirrors the existing Rolling Load chart's bar styling for visual
   * consistency rather than introducing a new chart style.
   */
  import type { AcwrResult } from '../../lib/analytics/loadAnalytics';
  import Icon from "@iconify/svelte";

  let { results, weekLabels }: { results: AcwrResult[]; weekLabels: Record<string, string> } = $props();

  const maxRatio = $derived(Math.max(...results.map((r) => r.ratio), 1.5) * 1.15);
</script>

<div class="bg-surface/50 border border-border rounded-3xl p-6 space-y-6 backdrop-blur-sm shadow-xl">
  <div class="flex items-center justify-between px-1">
    <div>
      <h3 class="text-xs font-bold text-content-muted uppercase tracking-widest">Acute:Chronic Load Ratio</h3>
      <p class="text-[9px] text-content-subtle uppercase mt-0.5">Ramp-rate spikes flagged when week-over-week load jumps &gt;10%</p>
    </div>
    <div class="p-2 bg-primary-hover/10 rounded-xl text-primary">
      <Icon icon="ic:baseline-speed" class="text-lg" />
    </div>
  </div>

  <div class="h-40 flex items-end justify-between gap-2 px-1">
    {#each results as r}
      <div class="flex-1 flex flex-col items-center group relative h-full justify-end">
        <div
          class="w-full rounded-t-lg transition-all duration-500 relative {r.spike ? 'bg-gradient-to-t from-danger/70 to-danger' : 'bg-gradient-to-t from-blue-600/60 to-blue-400'}"
          style="height: {Math.max((r.ratio / maxRatio) * 100, 2)}%"
        >
          <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 px-2 py-1.5 bg-surface-elevated text-[9px] font-black text-content rounded-lg opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap z-20 border border-border-strong shadow-2xl pointer-events-none">
            Ratio: {r.ratio.toFixed(2)}{r.spike ? ' · SPIKE' : ''}
          </div>
        </div>
      </div>
    {/each}
  </div>
  <div class="flex justify-between gap-2 px-1">
    {#each results as r}
      <span class="flex-1 text-center text-[8px] font-bold text-content-subtle">{weekLabels[r.weekId] ?? r.weekId}</span>
    {/each}
  </div>

  {#if results.length === 0}
    <p class="text-[10px] text-content-subtle italic uppercase tracking-widest text-center py-4">No completed sessions yet</p>
  {/if}
</div>
