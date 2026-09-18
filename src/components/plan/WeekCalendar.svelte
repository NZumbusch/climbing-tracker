<script lang="ts">
  /**
   * Presentational calendar grid extracted out of `TrainingPlan.svelte`
   * (PLAN.md Phase 4) - pure rendering of a row of week cells, with no
   * knowledge of `trainingState`/blocks/phases itself. A week can be
   * covered by more than one overlapping `TrainingBlock` now, so each cell
   * takes an already-resolved `color` (the dominant block's color, via
   * `getDominantBlockForWeek`) plus a plain `hasOverlap` flag rather than
   * the block list itself, keeping this component decoupled from block
   * resolution logic.
   */
  interface CalendarWeek {
    id: string;
    label: string;
    year: number;
    isCurrent: boolean;
    color?: string;
    tooltip: string;
    hasOverlap: boolean;
  }

  let {
    weeks,
    selectedWeekId,
    onSelectWeek,
  }: {
    weeks: CalendarWeek[];
    selectedWeekId: string | null;
    onSelectWeek: (weekId: string) => void;
  } = $props();

  const FALLBACK_COLOR = 'bg-surface-elevated/50 hover:bg-surface-elevated';
</script>

<div class="bg-surface/50 border border-border p-5 rounded-card backdrop-blur-sm relative">
  <div class="grid grid-cols-10 gap-2 min-w-[280px]">
    {#each weeks as week, i}
      {@const showYear = i === 0 || weeks[i].year !== weeks[i - 1].year}
      <button
        onclick={() => onSelectWeek(week.id)}
        class="aspect-square rounded-control transition-all duration-300 relative group hover:z-20
          {week.color || FALLBACK_COLOR}
          {selectedWeekId === week.id ? 'ring-2 ring-white ring-offset-2 ring-offset-surface scale-110 z-10 shadow-lg' : 'hover:scale-110'}
          {week.isCurrent ? 'border-2 border-primary' : ''}"
      >
        {#if showYear}<div class="absolute -top-1.5 -left-1.5 z-20 px-1 py-px rounded-control bg-surface-elevated text-content border border-border-strong shadow-sm text-caption font-bold whitespace-nowrap">{week.year}</div>{/if}
        {#if week.isCurrent}<div class="absolute -top-1 -right-1 w-2.5 h-2.5 bg-primary-hover rounded-full border-2 border-app-bg z-20"></div>{/if}
        {#if week.hasOverlap}<div class="absolute -bottom-1 -left-1 w-2 h-2 bg-white rounded-full border border-app-bg z-20" title="Multiple training blocks overlap this week"></div>{/if}
        <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-surface-elevated text-caption text-content rounded-control opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-30 shadow-card border border-border-strong">{week.tooltip}</div>
      </button>
    {/each}
  </div>
</div>
