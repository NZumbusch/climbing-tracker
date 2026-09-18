<script lang="ts">
  /**
   * Acute:chronic workload ratio / ramp-rate panel (PLAN.md Phase 4).
   * Mirrors the existing Rolling Load chart's bar styling for visual
   * consistency rather than introducing a new chart style.
   */
  import type { AcwrResult } from '../../lib/analytics/loadAnalytics';
  import Icon from "@iconify/svelte";

  let { results, weekLabels }: { results: AcwrResult[]; weekLabels: Record<string, string> } = $props();

  // UI_PLAN.md §5.3: "Weeks where `sufficient` is false render as a gap, not
  // as a plotted value" - an inflated early-history ratio isn't a real bar
  // to compare against. A defined-but-not-yet-`sufficient` ratio is
  // "building history"; an `undefined` ratio (no load in the window at all)
  // is a plain gap either way.
  const definedRatios = $derived(results.filter((r) => r.ratio !== undefined).map((r) => r.ratio as number));
  const maxRatio = $derived(Math.max(...definedRatios, 1.5) * 1.15);
</script>

<div class="bg-surface/50 border border-border rounded-card p-5 space-y-4 backdrop-blur-sm shadow-card">
  <div class="flex items-center justify-between px-1">
    <div>
      <h3 class="text-section uppercase text-content-muted">Acute:Chronic Load Ratio</h3>
      <p class="text-caption text-content-subtle mt-0.5">Ramp-rate spikes flagged when week-over-week load jumps &gt;10%</p>
    </div>
    <div class="p-2 bg-primary-hover/10 rounded-control text-primary">
      <Icon icon="ic:baseline-speed" class="text-lg" />
    </div>
  </div>

  <div class="h-40 flex items-end justify-between gap-2 px-1">
    {#each results as r}
      <div class="flex-1 flex flex-col items-center group relative h-full justify-end">
        {#if r.ratio !== undefined}
          <div
            class="w-full rounded-t-lg transition-all duration-500 relative {r.spike ? 'bg-gradient-to-t from-status-risk/70 to-status-risk' : !r.sufficient ? 'bg-gradient-to-t from-status-neutral/50 to-status-neutral' : 'bg-gradient-to-t from-status-good/60 to-status-good'}"
            style="height: {Math.max((r.ratio / maxRatio) * 100, 2)}%"
          >
            <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 px-2 py-1.5 bg-surface-elevated text-caption text-content rounded-control opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap z-20 border border-border-strong shadow-card pointer-events-none">
              Ratio: {r.ratio.toFixed(2)}{r.spike ? ' · SPIKE' : ''}{!r.sufficient ? ' · building history' : ''}
            </div>
          </div>
        {:else}
          <div class="w-full h-0.5 bg-border-strong/50 relative group">
            <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 px-2 py-1.5 bg-surface-elevated text-caption text-content-subtle rounded-control opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap z-20 border border-border-strong shadow-card pointer-events-none">
              No load in window
            </div>
          </div>
        {/if}
      </div>
    {/each}
  </div>
  <div class="flex justify-between gap-2 px-1">
    {#each results as r}
      <span class="flex-1 text-center text-caption text-content-subtle">{weekLabels[r.weekId] ?? r.weekId}</span>
    {/each}
  </div>

  {#if results.length === 0}
    <p class="text-caption text-content-subtle italic text-center py-4">No completed sessions yet</p>
  {/if}
</div>
