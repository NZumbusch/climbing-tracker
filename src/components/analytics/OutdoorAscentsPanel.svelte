<script lang="ts">
  /**
   * Outdoor ascent grade distribution over the displayed week window
   * (UI_PLAN.md §4.6, Stage 5) - `outdoorAscents` are imported and stored
   * (Phase 6) but nothing charted them until now. Each ascent is plotted
   * as a dot: x = the week it fell in, y = its grade rank (see
   * `../../lib/analytics/grades.ts`) - a scatter, not a bar chart, so the
   * spread of grades climbed each week ("distribution") is visible
   * directly rather than collapsed into a single per-week number.
   */
  import { formatDate } from '../../lib/dateUtils';
  import Icon from "@iconify/svelte";

  export interface WeekAscentPoint {
    id: string;
    grade: string;
    rank: number;
    date: string;
    name?: string;
    style?: string;
  }
  export interface WeekAscentGroup {
    weekId: string;
    ascents: WeekAscentPoint[];
  }

  let { weeks, weekLabels, unparsedCount }: {
    weeks: WeekAscentGroup[];
    weekLabels: Record<string, string>;
    unparsedCount: number;
  } = $props();

  const allRanks = $derived(weeks.flatMap((w) => w.ascents.map((a) => a.rank)));
  const hasAscents = $derived(allRanks.length > 0);
  const minRank = $derived(Math.min(...allRanks));
  const maxRank = $derived(Math.max(...allRanks));

  // 8% top/bottom padding so a single-grade window doesn't plot flush against the edges.
  function yPercent(rank: number): number {
    if (maxRank === minRank) return 50;
    return 8 + ((rank - minRank) / (maxRank - minRank)) * 84;
  }
</script>

<div class="bg-surface/50 border border-border rounded-card p-5 space-y-4 backdrop-blur-sm shadow-card">
  <div class="flex items-center justify-between px-1">
    <div>
      <h3 class="text-section uppercase text-content-muted">Outdoor Ascents</h3>
      <p class="text-caption text-content-subtle mt-0.5">Grade distribution, by week</p>
    </div>
    <div class="p-2 bg-tertiary-hover/10 rounded-control text-tertiary">
      <Icon icon="ic:baseline-terrain" class="text-lg" />
    </div>
  </div>

  {#if hasAscents}
    <div class="h-40 relative px-1">
      {#each weeks as week, i}
        {@const xPercent = ((i + 0.5) / weeks.length) * 100}
        {#each week.ascents as ascent}
          <div class="absolute -translate-x-1/2 group" style="left: {xPercent}%; bottom: {yPercent(ascent.rank)}%;">
            <div class="w-2.5 h-2.5 bg-tertiary rounded-full border-2 border-surface shadow-card group-hover:scale-150 transition-transform"></div>
            <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1.5 bg-surface-elevated text-caption text-content rounded-control opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap z-20 border border-border-strong shadow-card pointer-events-none">
              {ascent.grade}{ascent.name ? ` · ${ascent.name}` : ''}{ascent.style ? ` · ${ascent.style}` : ''} · {formatDate(ascent.date)}
            </div>
          </div>
        {/each}
      {/each}
    </div>
    <div class="flex justify-between gap-2 px-1">
      {#each weeks as week}
        <span class="flex-1 text-center text-caption text-content-subtle">{weekLabels[week.weekId] ?? week.weekId}</span>
      {/each}
    </div>
  {:else}
    <p class="text-caption text-content-subtle italic text-center py-4">No outdoor ascents logged in this window</p>
  {/if}

  {#if unparsedCount > 0}
    <p class="text-caption text-content-subtle italic">{unparsedCount} ascent{unparsedCount === 1 ? '' : 's'} in this window {unparsedCount === 1 ? 'has' : 'have'} a grade format that couldn't be plotted.</p>
  {/if}
</div>
