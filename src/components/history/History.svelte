<script lang="ts">
  import { trainingState } from '../../lib/state.svelte';
  import type { Workout } from '../../lib/types';
  import { formatDate } from '../../lib/dateUtils';
  import Icon from "@iconify/svelte";

  const completedWorkouts = $derived(trainingState.completedWorkouts);
  let limit = $state(50);
  
  let showFilters = $state(false);
  let filterFromDate = $state<string>('');
  let filterAnalyticsType = $state<string>('');
  let filterMinDuration = $state<number | ''>('');
  let filterMaxDuration = $state<number | ''>('');

  const filteredWorkouts = $derived(completedWorkouts.slice().sort((a, b) => {
    const timeA = new Date(a.date || 0).getTime();
    const timeB = new Date(b.date || 0).getTime();
    if (timeA !== timeB) return timeA - timeB;
    const startA = a.startTime || "00:00";
    const startB = b.startTime || "00:00";
    return startA.localeCompare(startB);
  }).reverse().filter(w => {
    if (filterFromDate && w.date && w.date < filterFromDate) return false;
    
    const totalDuration = w.exercises?.reduce((acc, e) => acc + (e.duration || 0), 0) || 0;
    if (filterMinDuration !== '' && totalDuration < filterMinDuration) return false;
    if (filterMaxDuration !== '' && totalDuration > filterMaxDuration) return false;
    
    if (filterAnalyticsType) {
      if (!w.exercises || w.exercises.length === 0) return false;
      const hasCategory = w.exercises.some(e => {
        if (e.category === filterAnalyticsType) return true;
        if (!e.category) {
          const typeDef = trainingState.exerciseTypes.find(t => t.name === e.type);
          if (typeDef && typeDef.category === filterAnalyticsType) return true;
        }
        return false;
      });
      if (!hasCategory) return false;
    }
    
    return true;
  }));

  const displayedWorkouts = $derived(filteredWorkouts.slice(0, limit));
</script>

<div class="w-full max-w-lg space-y-5 animate-in fade-in duration-700 pb-12">
  <div class="flex items-center justify-between px-1">
    <div class="flex items-center gap-3">
      <button 
        onclick={() => trainingState.navigate('settings')}
        class="p-2 bg-surface-elevated/50 rounded-xl border border-border-strong/50 text-content-subtle hover:text-content transition-colors"
        aria-label="Settings"
      >
        <Icon icon="ic:baseline-settings" class="text-lg" />
      </button>
      <h3 class="text-xl font-bold text-content tracking-tight">Timeline</h3>
    </div>
    <div class="h-px flex-1 bg-surface mx-3"></div>
    <span class="text-[9px] font-black text-content-subtle uppercase tracking-widest">{filteredWorkouts.length} Sessions</span>
    <button 
      onclick={() => showFilters = !showFilters}
      class="ml-3 p-2 rounded-xl border transition-colors {showFilters ? 'bg-primary border-primary text-white' : 'bg-surface-elevated/50 border-border-strong/50 text-content-subtle hover:text-content'}"
      aria-label="Toggle Filters"
    >
      <Icon icon="ic:baseline-filter-list" class="text-lg" />
    </button>
  </div>

  {#if showFilters}
    <div class="p-5 bg-surface/50 border border-border rounded-3xl space-y-4 animate-in slide-in-from-top-2">
      <div class="flex items-center justify-between">
        <h4 class="text-[10px] font-bold text-content-muted uppercase tracking-widest">Filters</h4>
        <button onclick={() => { filterFromDate = ''; filterAnalyticsType = ''; filterMinDuration = ''; filterMaxDuration = ''; }} class="text-[9px] font-black text-content-subtle hover:text-primary uppercase tracking-widest transition-colors">Clear All</button>
      </div>
      <div class="grid grid-cols-1 gap-4">
        <div class="space-y-1.5">
          <label for="filter-date" class="text-[9px] font-bold text-content-subtle uppercase tracking-widest ml-1">From Date</label>
          <input id="filter-date" type="date" bind:value={filterFromDate} class="w-full bg-surface-elevated text-content p-3 rounded-xl border border-border-strong outline-none text-sm" />
        </div>
        <div class="space-y-1.5">
          <label for="filter-type" class="text-[9px] font-bold text-content-subtle uppercase tracking-widest ml-1">Includes Analytics Type</label>
          <select id="filter-type" bind:value={filterAnalyticsType} class="w-full bg-surface-elevated text-content p-3 rounded-xl border border-border-strong outline-none text-sm appearance-none">
            <option value="">Any</option>
            {#each trainingState.analyticsCategories as cat}
              <option value={cat.name}>{cat.name}</option>
            {/each}
          </select>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <label for="filter-min-dur" class="text-[9px] font-bold text-content-subtle uppercase tracking-widest ml-1">Min Duration (m)</label>
            <input id="filter-min-dur" type="number" bind:value={filterMinDuration} class="w-full bg-surface-elevated text-content p-3 rounded-xl border border-border-strong outline-none text-sm" placeholder="Any" />
          </div>
          <div class="space-y-1.5">
            <label for="filter-max-dur" class="text-[9px] font-bold text-content-subtle uppercase tracking-widest ml-1">Max Duration (m)</label>
            <input id="filter-max-dur" type="number" bind:value={filterMaxDuration} class="w-full bg-surface-elevated text-content p-3 rounded-xl border border-border-strong outline-none text-sm" placeholder="Any" />
          </div>
        </div>
      </div>
    </div>
  {/if}

  <div class="space-y-4">
    {#each displayedWorkouts as workout}
      <div class="group p-5 bg-surface/30 hover:bg-surface/50 rounded-3xl border border-border/50 transition-all duration-300">
        <div class="flex justify-between items-start gap-4">
          <div class="space-y-2.5 flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="text-[10px] font-bold text-primary uppercase tracking-widest truncate">
                {workout.status === 'completed' ? 'Completed' : 'Planned'}
              </span>
              <span class="w-1 h-1 bg-surface-elevated-hover rounded-full flex-shrink-0"></span>
              <span class="text-[9px] font-medium text-content-subtle uppercase tracking-tighter">
                {formatDate(workout.date)}
              </span>
            </div>
            
            <div class="min-w-0">
              <p class="text-base font-bold text-content tracking-tight truncate">{workout.notes || 'Unnamed Session'}</p>
              <div class="flex flex-wrap gap-1.5 mt-1.5">
                {#each workout.exercises as exercise}
                  <span class="text-[9px] px-2 py-0.5 bg-surface-elevated text-content-muted rounded-lg border border-border-strong">
                    {exercise.type}
                  </span>
                {/each}
              </div>
            </div>

            <div class="flex gap-4 pt-1">
              <button 
                onclick={() => trainingState.navigate('add', workout)}
                class="text-[9px] font-black text-content-subtle hover:text-primary uppercase tracking-widest transition-colors"
              >
                Edit
              </button>
              <button 
                onclick={() => trainingState.deleteWorkout(workout.id)}
                class="text-[9px] font-black text-content-subtle hover:text-danger uppercase tracking-widest transition-colors"
              >
                Delete
              </button>
            </div>
          </div>

          <div class="text-right flex-shrink-0">
            <div class="bg-primary-hover/10 px-2.5 py-1 rounded-xl border border-primary/20 mb-0.5 inline-block">
              <span class="text-base font-black text-primary tracking-tighter">{Math.round(workout.loadFactor)}</span>
            </div>
            <p class="text-[7px] font-black uppercase text-content-subtle tracking-widest">LOAD</p>
          </div>
        </div>
      </div>
    {:else}
      <div class="py-12 text-center bg-surface/10 rounded-3xl border border-dashed border-zinc-900">
        <p class="text-content-subtle italic text-sm">No workout history yet.</p>
      </div>
    {/each}

    {#if filteredWorkouts.length > limit}
      <button 
        onclick={() => limit += 50}
        class="w-full py-4 bg-surface hover:bg-surface-elevated text-content-muted hover:text-content text-xs font-bold uppercase tracking-widest rounded-2xl transition-all border border-border"
      >
        Load More
      </button>
    {/if}
  </div>
</div>
