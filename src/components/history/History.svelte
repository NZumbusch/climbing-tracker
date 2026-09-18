<script lang="ts">
  import { trainingState } from '../../lib/state.svelte';
  import type { Workout } from '../../lib/types';
  import { formatDate } from '../../lib/dateUtils';
  import { slotValues, slotTypeName } from '../../lib/exerciseSlot';
  import WorkoutShareImage from './WorkoutShareImage.svelte';
  import Icon from "@iconify/svelte";

  // Stage 4 (UI_PLAN.md §6/§4.5): History overhaul - overflow menu, month
  // grouping, richer row content (duration/fatigue/block), and the new
  // typeId/block/search/to-date filters, on top of Stage 3's Share wiring.

  const completedWorkouts = $derived(trainingState.completedWorkouts);
  let limit = $state(50);

  let showFilters = $state(false);
  let filterFromDate = $state<string>('');
  let filterToDate = $state<string>('');
  let filterAnalyticsType = $state<string>('');
  let filterExerciseTypeId = $state<string>('');
  let filterBlockId = $state<string>('');
  let filterSearch = $state<string>('');
  let filterMinDuration = $state<number | ''>('');
  let filterMaxDuration = $state<number | ''>('');
  let workoutToShare = $state<Workout | null>(null);
  let openMenuId = $state<string | null>(null);
  let expandedId = $state<string | null>(null);

  function workoutDuration(w: Workout): number {
    return w.exercises?.reduce((acc, e) => acc + (slotValues(e).duration || 0), 0) || 0;
  }

  function blockForWorkout(w: Workout) {
    return w.blockId ? trainingState.trainingBlocks.find((b) => b.id === w.blockId) : undefined;
  }
  function phaseNameForBlock(phaseId?: string) {
    return phaseId ? trainingState.phaseDefs.find((p) => p.id === phaseId)?.name : undefined;
  }

  const FATIGUE_AXES: { key: 'fingers' | 'arms' | 'core' | 'systemic'; label: string }[] = [
    { key: 'fingers', label: 'Fingers' },
    { key: 'arms', label: 'Arms' },
    { key: 'core', label: 'Core' },
    { key: 'systemic', label: 'Systemic' },
  ];

  const filteredWorkouts = $derived(completedWorkouts.slice().sort((a, b) => {
    const timeA = new Date(a.date || 0).getTime();
    const timeB = new Date(b.date || 0).getTime();
    if (timeA !== timeB) return timeA - timeB;
    const startA = a.startTime || "00:00";
    const startB = b.startTime || "00:00";
    return startA.localeCompare(startB);
  }).reverse().filter(w => {
    if (filterFromDate && w.date && w.date < filterFromDate) return false;
    if (filterToDate && w.date && w.date > filterToDate) return false;

    const totalDuration = workoutDuration(w);
    if (filterMinDuration !== '' && totalDuration < filterMinDuration) return false;
    if (filterMaxDuration !== '' && totalDuration > filterMaxDuration) return false;

    if (filterAnalyticsType) {
      if (!w.exercises || w.exercises.length === 0) return false;
      const hasCategory = w.exercises.some(e => {
        const catName = e.categoryId
          ? trainingState.analyticsCategories.find(c => c.id === e.categoryId)?.name
          : trainingState.exerciseTypes.find(t => t.id === e.typeId)?.category;
        return catName === filterAnalyticsType;
      });
      if (!hasCategory) return false;
    }

    if (filterExerciseTypeId) {
      if (!w.exercises?.some(e => e.typeId === filterExerciseTypeId)) return false;
    }

    if (filterBlockId && w.blockId !== filterBlockId) return false;

    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      const matches = w.notes?.toLowerCase().includes(q) || w.description?.toLowerCase().includes(q);
      if (!matches) return false;
    }

    return true;
  }));

  const displayedWorkouts = $derived(filteredWorkouts.slice(0, limit));

  function monthKey(dateStr: string | null): string {
    if (!dateStr) return 'unknown';
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  function monthLabel(dateStr: string | null): string {
    if (!dateStr) return 'Unknown';
    return new Date(dateStr).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }

  const groupedWorkouts = $derived.by(() => {
    const groups: { key: string; label: string; workouts: Workout[]; totalLoad: number }[] = [];
    for (const w of displayedWorkouts) {
      const key = monthKey(w.date);
      let group = groups.find(g => g.key === key);
      if (!group) {
        group = { key, label: monthLabel(w.date), workouts: [], totalLoad: 0 };
        groups.push(group);
      }
      group.workouts.push(w);
      group.totalLoad += w.loadFactor || 0;
    }
    return groups;
  });

  function clearFilters() {
    filterFromDate = '';
    filterToDate = '';
    filterAnalyticsType = '';
    filterExerciseTypeId = '';
    filterBlockId = '';
    filterSearch = '';
    filterMinDuration = '';
    filterMaxDuration = '';
  }

  function toggleMenu(id: string) {
    openMenuId = openMenuId === id ? null : id;
  }
  function toggleExpanded(id: string) {
    expandedId = expandedId === id ? null : id;
  }

  function shareWorkout(w: Workout) {
    workoutToShare = w;
    openMenuId = null;
  }
  function duplicateWorkout(w: Workout) {
    trainingState.duplicateWorkout(w);
    openMenuId = null;
  }
  function deleteWorkout(id: string) {
    trainingState.deleteWorkout(id);
    openMenuId = null;
  }
</script>

<div class="w-full max-w-lg space-y-5 animate-in fade-in duration-700 pb-12">
  <div class="flex items-center justify-between px-1">
    <div class="flex items-center gap-3">
      <h3 class="text-title text-content">Timeline</h3>
    </div>
    <div class="h-px flex-1 bg-surface mx-3"></div>
    <span class="text-label text-content-subtle">{filteredWorkouts.length} Sessions</span>
    <button
      onclick={() => showFilters = !showFilters}
      class="ml-3 p-2 rounded-control border transition-colors {showFilters ? 'bg-primary border-primary text-white' : 'bg-surface-elevated/50 border-border-strong/50 text-content-subtle hover:text-content'}"
      aria-label="Toggle Filters"
    >
      <Icon icon="ic:baseline-filter-list" class="text-lg" />
    </button>
  </div>

  {#if showFilters}
    <div class="p-5 bg-surface/50 border border-border rounded-card space-y-4 animate-in slide-in-from-top-2">
      <div class="flex items-center justify-between">
        <h4 class="text-section uppercase text-content-muted">Filters</h4>
        <button onclick={clearFilters} class="text-label text-content-subtle hover:text-primary transition-colors">Clear All</button>
      </div>
      <div class="grid grid-cols-1 gap-4">
        <div class="space-y-1.5">
          <label for="filter-search" class="text-label text-content-subtle ml-1">Search</label>
          <input id="filter-search" type="text" bind:value={filterSearch} placeholder="Name or notes" class="w-full bg-surface-elevated text-content p-3 rounded-control border border-border-strong outline-none text-sm" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <label for="filter-date" class="text-label text-content-subtle ml-1">From Date</label>
            <input id="filter-date" type="date" bind:value={filterFromDate} class="w-full bg-surface-elevated text-content p-3 rounded-control border border-border-strong outline-none text-sm" />
          </div>
          <div class="space-y-1.5">
            <label for="filter-date-to" class="text-label text-content-subtle ml-1">To Date</label>
            <input id="filter-date-to" type="date" bind:value={filterToDate} class="w-full bg-surface-elevated text-content p-3 rounded-control border border-border-strong outline-none text-sm" />
          </div>
        </div>
        <div class="space-y-1.5">
          <label for="filter-type" class="text-label text-content-subtle ml-1">Includes Analytics Type</label>
          <select id="filter-type" bind:value={filterAnalyticsType} class="w-full bg-surface-elevated text-content p-3 rounded-control border border-border-strong outline-none text-sm appearance-none">
            <option value="">Any</option>
            {#each trainingState.analyticsCategories as cat}
              <option value={cat.name}>{cat.name}</option>
            {/each}
          </select>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <label for="filter-exercise-type" class="text-label text-content-subtle ml-1">Exercise Type</label>
            <select id="filter-exercise-type" bind:value={filterExerciseTypeId} class="w-full bg-surface-elevated text-content p-3 rounded-control border border-border-strong outline-none text-sm appearance-none">
              <option value="">Any</option>
              {#each trainingState.exerciseTypes as type}
                <option value={type.id}>{type.name}</option>
              {/each}
            </select>
          </div>
          <div class="space-y-1.5">
            <label for="filter-block" class="text-label text-content-subtle ml-1">Training Block</label>
            <select id="filter-block" bind:value={filterBlockId} class="w-full bg-surface-elevated text-content p-3 rounded-control border border-border-strong outline-none text-sm appearance-none">
              <option value="">Any</option>
              {#each trainingState.trainingBlocks as block}
                <option value={block.id}>{block.name}</option>
              {/each}
            </select>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <label for="filter-min-dur" class="text-label text-content-subtle ml-1">Min Duration (m)</label>
            <input id="filter-min-dur" type="number" bind:value={filterMinDuration} class="w-full bg-surface-elevated text-content p-3 rounded-control border border-border-strong outline-none text-sm" placeholder="Any" />
          </div>
          <div class="space-y-1.5">
            <label for="filter-max-dur" class="text-label text-content-subtle ml-1">Max Duration (m)</label>
            <input id="filter-max-dur" type="number" bind:value={filterMaxDuration} class="w-full bg-surface-elevated text-content p-3 rounded-control border border-border-strong outline-none text-sm" placeholder="Any" />
          </div>
        </div>
      </div>
    </div>
  {/if}

  <div class="space-y-6">
    {#each groupedWorkouts as group (group.key)}
      <div class="space-y-3">
        <div class="flex items-center justify-between px-1">
          <span class="text-section uppercase text-content-muted">{group.label}</span>
          <span class="text-caption text-content-subtle">{group.workouts.length} session{group.workouts.length === 1 ? '' : 's'} · {Math.round(group.totalLoad)} load</span>
        </div>

        {#each group.workouts as workout (workout.id)}
          {@const block = blockForWorkout(workout)}
          {@const phaseName = phaseNameForBlock(block?.phaseId)}
          {@const duration = workoutDuration(workout)}
          <div class="group p-5 bg-surface/30 hover:bg-surface/50 rounded-card border border-border/50 transition-all duration-300">
            <div class="flex justify-between items-start gap-4">
              <button onclick={() => toggleExpanded(workout.id)} class="space-y-2.5 flex-1 min-w-0 text-left">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-label text-primary truncate">
                    {formatDate(workout.date)}
                  </span>
                  {#if duration > 0}
                    <span class="w-1 h-1 bg-surface-elevated-hover rounded-full flex-shrink-0"></span>
                    <span class="text-caption text-content-subtle">{duration}m</span>
                  {/if}
                  {#if block}
                    <span class="w-1 h-1 bg-surface-elevated-hover rounded-full flex-shrink-0"></span>
                    <span class="flex items-center gap-1 text-caption text-content-subtle truncate">
                      <span class="w-1.5 h-1.5 rounded-full flex-shrink-0 {block.color || 'bg-status-neutral'}"></span>
                      {block.name}{phaseName ? ` · ${phaseName}` : ''}
                    </span>
                  {/if}
                </div>

                <div class="min-w-0">
                  <p class="text-body font-bold text-content truncate">{workout.notes || 'Unnamed Session'}</p>
                  <div class="flex flex-wrap gap-1.5 mt-1.5">
                    {#each workout.exercises as exercise}
                      <span class="text-label px-2 py-0.5 bg-surface-elevated text-content-muted rounded-control border border-border-strong">
                        {slotTypeName(exercise, trainingState.exerciseTypes)}
                      </span>
                    {/each}
                  </div>
                </div>

                <div class="flex items-center gap-3 flex-wrap">
                  {#each FATIGUE_AXES as axis}
                    <span class="text-caption text-content-subtle tabular-nums">{axis.label[0]}:{workout[axis.key] ?? '—'}</span>
                  {/each}
                  <Icon icon="ic:baseline-expand-more" class="text-content-subtle text-base transition-transform {expandedId === workout.id ? 'rotate-180' : ''}" />
                </div>
              </button>

              <div class="flex flex-col items-end gap-2 flex-shrink-0">
                <div class="text-right">
                  <div class="bg-primary-hover/10 px-2.5 py-1 rounded-control border border-primary/20 mb-0.5 inline-block">
                    <span class="text-body font-black text-primary tabular-nums">{Math.round(workout.loadFactor)}</span>
                  </div>
                  <p class="text-caption text-content-subtle">Load</p>
                </div>

                <div class="relative">
                  <button
                    onclick={() => toggleMenu(workout.id)}
                    class="p-1.5 text-content-subtle hover:text-content transition-colors"
                    aria-label="More actions"
                    aria-expanded={openMenuId === workout.id}
                  >
                    <Icon icon="ic:baseline-more-vert" class="text-lg" />
                  </button>
                  {#if openMenuId === workout.id}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div class="fixed inset-0 z-40" onclick={() => openMenuId = null}></div>
                    <div class="absolute right-0 top-full mt-1 z-50 w-36 bg-surface-elevated border border-border-strong rounded-control shadow-card overflow-hidden animate-in fade-in slide-in-from-top-2">
                      <button onclick={() => { trainingState.navigate('add', workout); openMenuId = null; }} class="w-full flex items-center gap-2 px-3 py-2.5 text-label text-content hover:bg-surface transition-colors text-left">
                        <Icon icon="ic:baseline-edit" class="text-sm" /> Edit
                      </button>
                      <button onclick={() => shareWorkout(workout)} class="w-full flex items-center gap-2 px-3 py-2.5 text-label text-content hover:bg-surface transition-colors text-left">
                        <Icon icon="ic:baseline-share" class="text-sm" /> Share
                      </button>
                      <button onclick={() => duplicateWorkout(workout)} class="w-full flex items-center gap-2 px-3 py-2.5 text-label text-content hover:bg-surface transition-colors text-left">
                        <Icon icon="ic:baseline-content-copy" class="text-sm" /> Duplicate
                      </button>
                      <button onclick={() => deleteWorkout(workout.id)} class="w-full flex items-center gap-2 px-3 py-2.5 text-label text-danger hover:bg-surface transition-colors text-left">
                        <Icon icon="ic:baseline-delete" class="text-sm" /> Delete
                      </button>
                    </div>
                  {/if}
                </div>
              </div>
            </div>

            {#if expandedId === workout.id}
              <div class="mt-4 pt-4 border-t border-border-strong/50 space-y-2 animate-in fade-in">
                {#each workout.exercises as exercise}
                  {@const v = slotValues(exercise)}
                  <div class="flex justify-between items-center gap-2">
                    <span class="text-label text-content truncate">{slotTypeName(exercise, trainingState.exerciseTypes)}</span>
                    <span class="text-caption text-content-subtle tabular-nums flex-shrink-0">
                      {#if v.sets && v.reps}
                        {v.sets}x{v.reps}
                      {:else if v.duration}
                        {v.duration}m
                      {:else if v.distance}
                        {v.distance}km
                      {:else}
                        Done
                      {/if}
                      {#if v.weight || v.maxWeightPercent}
                        @ {v.weight ? `${v.weight}kg` : `${v.maxWeightPercent}%`}
                      {/if}
                    </span>
                  </div>
                {:else}
                  <p class="text-caption text-content-subtle italic">No exercises logged.</p>
                {/each}
                {#if workout.description}
                  <p class="text-caption text-content-subtle pt-1">{workout.description}</p>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {:else}
      <div class="py-12 text-center bg-surface/10 rounded-card border border-dashed border-border">
        <p class="text-content-subtle italic text-body">No workout history yet.</p>
      </div>
    {/each}

    {#if filteredWorkouts.length > limit}
      <button
        onclick={() => limit += 50}
        class="w-full py-4 bg-surface hover:bg-surface-elevated text-content-muted hover:text-content text-label rounded-card transition-all border border-border"
      >
        Load More
      </button>
    {/if}
  </div>
</div>

{#if workoutToShare}
  <WorkoutShareImage workout={workoutToShare} onClose={() => workoutToShare = null} />
{/if}
