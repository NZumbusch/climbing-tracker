<script lang="ts">
  /**
   * Planned-vs-actual adherence panel (PLAN.md Phase 4) - the payoff for
   * Phase 1's `prescribed`/`logged` split.
   */
  import type { WeeklyAdherence } from '../../lib/analytics/loadAnalytics';
  import Icon from "@iconify/svelte";

  let { results, weekLabels }: { results: WeeklyAdherence[]; weekLabels: Record<string, string> } = $props();
</script>

<div class="bg-surface/50 border border-border rounded-3xl p-6 space-y-6 backdrop-blur-sm shadow-xl">
  <div class="flex items-center justify-between px-1">
    <div>
      <h3 class="text-xs font-bold text-content-muted uppercase tracking-widest">Plan Adherence</h3>
      <p class="text-[9px] text-content-subtle uppercase mt-0.5">Logged vs prescribed, per week</p>
    </div>
    <div class="p-2 bg-primary-hover/10 rounded-xl text-primary">
      <Icon icon="ic:baseline-fact-check" class="text-lg" />
    </div>
  </div>

  <div class="space-y-2">
    {#each results as r}
      <div class="flex items-center gap-3 p-2.5 bg-surface-elevated/40 rounded-xl border border-border-strong/40">
        <span class="text-[9px] font-bold text-content-subtle w-14 flex-shrink-0">{weekLabels[r.weekId] ?? r.weekId}</span>
        <div class="flex-1 h-2 bg-surface-elevated rounded-full overflow-hidden">
          <div class="h-full bg-gradient-to-r from-success-hover to-success rounded-full transition-all duration-500" style="width: {Math.round(r.completionRate * 100)}%"></div>
        </div>
        <span class="text-[9px] font-black text-content w-9 text-right flex-shrink-0">{Math.round(r.completionRate * 100)}%</span>
        <span class="text-[9px] font-bold w-16 text-right flex-shrink-0 {r.loadVariance < 0 ? 'text-danger' : 'text-content-subtle'}">{r.loadVariance >= 0 ? '+' : ''}{Math.round(r.loadVariance)}</span>
      </div>
    {:else}
      <p class="text-[10px] text-content-subtle italic uppercase tracking-widest text-center py-4">No completed sessions yet</p>
    {/each}
  </div>
</div>
