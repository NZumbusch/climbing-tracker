<script lang="ts">
  /**
   * Layout (UI_PLAN.md §4.7, Stage 8) - Week view, Fatigue chart style, and
   * Home section visibility + reorder.
   *
   * **Week view** stays a static "Day list" row rather than a real toggle -
   * the 7-column grid alternate is Stage 9's own job, explicitly listed as
   * "Deferred" in `UI_PLAN.md §6`'s Sequencing table. Offering a "Grid"
   * option here now would select a mode that renders nothing.
   *
   * **Home sections** reorder via `svelte-dnd-action`'s `dragHandleZone`/
   * `dragHandle` - the same handle-only pattern (not whole-row-draggable)
   * Stage 6 used for the Plan screen's day reassignment, so normal page
   * scrolling isn't interrupted by an accidental drag start.
   */
  import { trainingState } from '../../lib/state.svelte';
  import { dragHandleZone, dragHandle, type DndEvent } from 'svelte-dnd-action';
  import type { HomeSectionPreference } from '../../lib/preferences/migrate';
  import Icon from "@iconify/svelte";

  const SECTION_LABELS: Record<HomeSectionPreference['id'], string> = {
    readiness: 'Readiness',
    today: 'Today',
    metrics: 'Metrics',
    fatigue: 'Fatigue',
    thisWeek: 'This Week',
    trainingBlock: 'Training Block',
    competition: 'Next Competition',
    recentActivity: 'Recent Activity',
    weather: 'Weather',
  };

  // Local mutable mirror, same reasoning as TrainingPlan.svelte's `dayGroups`
  // (Stage 6) - the DnD library needs a locally-reorderable array for live
  // visual feedback; the actual write path is `setHomeSectionOrder`, called
  // only on drop.
  let items = $state<HomeSectionPreference[]>(trainingState.homeSections);
  $effect(() => {
    items = trainingState.homeSections;
  });

  function handleConsider(e: CustomEvent<DndEvent<HomeSectionPreference>>) {
    items = e.detail.items;
  }
  function handleFinalize(e: CustomEvent<DndEvent<HomeSectionPreference>>) {
    items = e.detail.items;
    trainingState.setHomeSectionOrder(items.map((s) => s.id));
  }
</script>

<div class="bg-surface border border-border rounded-card p-5 space-y-5 backdrop-blur-sm shadow-card animate-in fade-in">
  <div class="space-y-2">
    <h3 class="text-section uppercase text-content-muted px-1">Layout</h3>
  </div>

  <div class="space-y-2">
    <p class="text-label text-content-subtle px-1">Week view</p>
    <div class="p-3.5 rounded-control border border-border-strong/50 bg-surface-elevated/30 flex items-center justify-between">
      <span class="text-body text-content">Day list</span>
      <span class="text-caption text-content-subtle italic">Grid view coming in a future update</span>
    </div>
  </div>

  <div class="space-y-2">
    <p class="text-label text-content-subtle px-1">Fatigue chart</p>
    <div class="flex bg-surface-elevated/50 p-1 rounded-control">
      <button
        onclick={() => trainingState.setFatigueChartStyle('bars')}
        class="flex-1 py-2 text-label rounded-control transition-all {trainingState.fatigueChartStyle === 'bars' ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}"
      >
        Bars
      </button>
      <button
        onclick={() => trainingState.setFatigueChartStyle('radar')}
        class="flex-1 py-2 text-label rounded-control transition-all {trainingState.fatigueChartStyle === 'radar' ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}"
      >
        Radar
      </button>
    </div>
  </div>

  <div class="space-y-2">
    <p class="text-label text-content-subtle px-1">Home sections</p>
    <p class="text-caption text-content-subtle px-1">Drag the handle to reorder; toggle to show or hide.</p>
    <div
      class="space-y-1.5"
      use:dragHandleZone={{ items, flipDurationMs: 150, dropTargetClasses: ['ring-2', 'ring-primary/40'] }}
      onconsider={handleConsider}
      onfinalize={handleFinalize}
    >
      {#each items as section (section.id)}
        <div class="flex items-center gap-2 p-2.5 rounded-control border border-border-strong/50 bg-surface-elevated/30">
          <div use:dragHandle class="cursor-grab active:cursor-grabbing text-content-subtle touch-none p-1" aria-label="Drag to reorder {SECTION_LABELS[section.id]}">
            <Icon icon="ic:baseline-drag-indicator" class="text-lg" />
          </div>
          <span class="text-body text-content flex-1">{SECTION_LABELS[section.id]}</span>
          <input
            type="checkbox"
            checked={section.visible}
            onchange={(e) => trainingState.setHomeSectionVisible(section.id, e.currentTarget.checked)}
            class="w-5 h-5 rounded accent-primary"
          />
        </div>
      {/each}
    </div>
  </div>
</div>
