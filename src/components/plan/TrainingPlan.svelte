<script lang="ts">
  import { storage } from '../../lib/storage';
  import { getWeekId } from '../../lib/dateUtils';
  import type { PhaseType, PeriodizationWeek, Workout } from '../../lib/types';
  import Icon from "@iconify/svelte";

  // --- Props ---
  let { 
    periodization = [], 
    workouts = [],
    onAssignPhase,
    onSelectWeek,
    onAddWorkout,
    onEditWorkout,
    onDeleteWorkout,
    onShowAnalytics
  } = $props<{ 
    periodization: PeriodizationWeek[], 
    workouts: Workout[],
    onAssignPhase: () => void,
    onSelectWeek: (data: { weekId: string; phase?: PhaseType }) => void,
    onAddWorkout: (weekId: string) => void,
    onEditWorkout: (workout: Workout) => void,
    onDeleteWorkout: (id: number) => void,
    onShowAnalytics: () => void
  }>();

  // --- Theme ---
  const phaseColors: Record<PhaseType, string> = {
    'Endurance': 'bg-emerald-500',
    'Strength': 'bg-rose-500',
    'Power': 'bg-amber-500',
    'Power Endurance': 'bg-purple-500',
    'Maintenance': 'bg-sky-500'
  };

  const phases: PhaseType[] = ['Endurance', 'Strength', 'Power', 'Power Endurance', 'Maintenance'];

  // --- State ---
  let weeks = $state<{ id: string; label: string; phase?: PhaseType; isCurrent: boolean; year: number }[]>([]);
  let selectedWeekId = $state<string | null>(null);
  let weekOffset = $state(0); 
  let showPhaseDropdown = $state(false);

  // --- Logic: Calendar Generation ---

  function initWeeks() {
    const now = new Date();
    const currentWeekId = getWeekId(now);
    const tempWeeks = [];

    const startOffset = -25 + (weekOffset * 50);
    const endOffset = 24 + (weekOffset * 50);

    for (let i = startOffset; i <= endOffset; i++) {
      const d = new Date();
      d.setDate(d.getDate() + (i * 7));
      const id = getWeekId(d);
      const phaseEntry = periodization.find(p => p.weekId === id);
      
      tempWeeks.push({
        id,
        label: `Week ${id.split('-W')[1]}`,
        phase: phaseEntry?.phase,
        isCurrent: id === currentWeekId,
        year: d.getUTCFullYear()
      });
    }
    weeks = tempWeeks;
    if (!selectedWeekId) selectedWeekId = currentWeekId;
  }

  $effect(() => {
    if (periodization || weekOffset !== undefined) initWeeks();
  });

  // --- Helpers ---
  const selectedWeekData = $derived(weeks.find(w => w.id === selectedWeekId));
  const weekWorkouts = $derived(workouts.filter(w => w.weekId === selectedWeekId));

  const rollingLoad = $derived(
    workouts
      .filter(w => w.status === 'completed')
      .slice(-5)
      .reduce((acc, w) => acc + (w.loadFactor || 0), 0) / Math.max(1, Math.min(workouts.length, 5))
  );
  
  const weeklyWorkoutsCount = $derived(
    workouts.filter(w => {
      if (!w.date || w.status !== 'completed') return false;
      const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      return new Date(w.date).getTime() > oneWeekAgo;
    }).length
  );

  // --- Handlers ---

  async function handleAssign(phase: PhaseType) {
    if (!selectedWeekId) return;
    await storage.assignPhaseToWeek(selectedWeekId, phase);
    onAssignPhase();
    showPhaseDropdown = false;
  }

  function navigate(direction: 'prev' | 'next' | 'today') {
    if (direction === 'prev') weekOffset--;
    else if (direction === 'next') weekOffset++;
    else if (direction === 'today') weekOffset = 0;
    showPhaseDropdown = false;
  }
</script>

<div class="w-full max-w-lg space-y-6 animate-in fade-in duration-700 pb-12">
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between px-1">
      <h2 class="text-xl font-bold text-white tracking-tight">Training Plan</h2>
      <div class="flex items-center gap-2">
        <button 
          onclick={() => navigate('today')}
          class="px-3 py-1.5 bg-zinc-800/50 hover:bg-zinc-800 text-[9px] font-black text-zinc-400 hover:text-white uppercase tracking-widest rounded-lg border border-zinc-700/50 transition-all active:scale-95"
        >
          Today
        </button>
        <div class="flex bg-zinc-900/50 rounded-xl border border-zinc-800 p-1">
          <button onclick={() => navigate('prev')} class="p-1.5 hover:bg-zinc-800 text-zinc-500 hover:text-white rounded-lg transition-colors active:scale-90"><Icon icon="ic:baseline-chevron-left" class="text-lg" /></button>
          <button onclick={() => navigate('next')} class="p-1.5 hover:bg-zinc-800 text-zinc-500 hover:text-white rounded-lg transition-colors active:scale-90"><Icon icon="ic:baseline-chevron-right" class="text-lg" /></button>
        </div>
      </div>
    </div>
    
    <div class="flex flex-wrap gap-x-3 gap-y-1.5 px-1">
      {#each phases as phase}
        <div class="flex items-center gap-1">
          <div class="w-2.5 h-2.5 rounded-sm {phaseColors[phase]}"></div>
          <span class="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">{phase}</span>
        </div>
      {/each}
    </div>

    <div class="grid grid-cols-2 gap-3 px-1">
      <button 
        onclick={onShowAnalytics}
        class="bg-zinc-900/50 border border-zinc-800 p-4 rounded-2xl backdrop-blur-sm relative overflow-hidden group text-left transition-all hover:bg-zinc-800/80 active:scale-95"
      >
        <span class="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Rolling Load</span>
        <div class="flex items-baseline gap-1">
          <span class="text-2xl font-black text-white tracking-tighter">{Math.round(rollingLoad)}</span>
          <span class="text-[9px] font-bold text-blue-500">AVG</span>
        </div>
        <Icon icon="ic:baseline-chevron-right" class="absolute right-3 bottom-3 text-zinc-700 group-hover:text-blue-500 transition-colors" />
      </button>
      
      <div class="bg-zinc-900/50 border border-zinc-800 p-4 rounded-2xl backdrop-blur-sm relative overflow-hidden group">
        <span class="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Weekly Sessions</span>
        <div class="flex items-baseline gap-1">
          <span class="text-2xl font-black text-white tracking-tighter">{weeklyWorkoutsCount}</span>
          <span class="text-[9px] font-bold text-emerald-500">DONE</span>
        </div>
      </div>
    </div>

    <div class="bg-zinc-900/50 border border-zinc-800 p-5 rounded-3xl backdrop-blur-sm relative">
      <div class="grid grid-cols-10 gap-2 min-w-[280px]">
        {#each weeks as week, i}
          {@const showYear = i === 0 || weeks[i].year !== weeks[i-1].year}
          <button 
            onclick={() => { selectedWeekId = week.id; showPhaseDropdown = false; }}
            class="aspect-square rounded-lg transition-all duration-300 relative group
              {week.phase ? phaseColors[week.phase] : 'bg-zinc-800/50 hover:bg-zinc-800'}
              {selectedWeekId === week.id ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-900 scale-110 z-10 shadow-lg' : 'hover:scale-110'}
              {week.isCurrent ? 'border-2 border-blue-500' : ''}"
          >
            {#if showYear}<div class="absolute -top-4 left-0 text-[7px] font-black text-zinc-600 uppercase tracking-widest whitespace-nowrap">{week.year}</div>{/if}
            {#if week.isCurrent}<div class="absolute -top-1 -right-1 w-2.5 h-2.5 bg-blue-500 rounded-full border-2 border-[#121214] z-20"></div>{/if}
            <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-zinc-800 text-[8px] font-bold text-white rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-30 shadow-xl border border-zinc-700">{week.id} {week.phase ? `- ${week.phase}` : ''}</div>
          </button>
        {/each}
      </div>
    </div>
  </div>

  {#if selectedWeekId && selectedWeekData}
    <div class="bg-zinc-900/50 border border-zinc-800 p-6 rounded-3xl backdrop-blur-sm space-y-5 shadow-xl">
      <div class="flex justify-between items-start">
        <div class="flex-1 relative">
          <span class="text-[9px] font-black uppercase tracking-[0.15em] text-blue-500 mb-0.5 block">{selectedWeekData.isCurrent ? 'Current Week' : selectedWeekData.id}</span>
          <button onclick={() => showPhaseDropdown = !showPhaseDropdown} class="text-left group flex items-center gap-2">
            <h3 class="text-xl font-bold text-white tracking-tight group-hover:text-blue-400 transition-colors">{selectedWeekData.phase ? selectedWeekData.phase : 'No Phase'}</h3>
            <span class="text-zinc-600 group-hover:text-blue-400 transition-colors"><Icon icon="ic:baseline-arrow-drop-down" class="text-xl" /></span>
          </button>

          {#if showPhaseDropdown}
            <div class="absolute left-0 mt-2 w-44 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl z-20 overflow-hidden animate-in zoom-in-95 duration-200">
              <div class="p-2 border-b border-zinc-800 bg-zinc-900/50"><span class="text-[8px] font-black text-zinc-500 uppercase tracking-widest px-1">Select Phase</span></div>
              {#each phases as phase}
                <button onclick={() => handleAssign(phase)} class="w-full text-left px-3 py-2.5 text-[10px] font-bold text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors border-b border-zinc-800 last:border-0 flex items-center gap-2">
                  <div class="w-2 h-2 rounded-full {phaseColors[phase]}"></div>{phase}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <h4 class="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Scheduled Sessions</h4>
          <div class="flex items-center gap-3">
            <span class="text-[9px] text-zinc-600 font-bold">{weekWorkouts.length} Total</span>
            <button onclick={() => onAddWorkout(selectedWeekId!)} class="bg-zinc-800 hover:bg-zinc-700 text-white p-1 rounded-md transition-colors"><Icon icon="ic:baseline-plus" class="text-sm" /></button>
          </div>
        </div>

        {#each weekWorkouts as workout}
          <div class="flex items-center justify-between p-3.5 bg-zinc-800/50 rounded-xl border border-zinc-700/50 hover:border-zinc-600 transition-colors group/item">
            <div class="flex items-center gap-2.5 flex-1 min-w-0">
              <div class="w-1.5 h-1.5 rounded-full {workout.status === 'completed' ? 'bg-green-500' : 'bg-blue-500'}"></div>
              <div class="min-w-0 flex-1">
                <p class="text-xs font-bold text-white leading-tight truncate">{workout.notes}</p>
                <p class="text-[9px] text-zinc-500 mt-0.5 uppercase tracking-tighter">{workout.exercises.length} Exercises</p>
              </div>
            </div>
            
            <div class="flex items-center gap-2 ml-4">
              {#if workout.status === 'planned'}
                <button onclick={() => onEditWorkout(workout)} class="p-1.5 text-zinc-500 hover:text-white transition-colors"><Icon icon="ic:baseline-edit" class="text-sm" /></button>
              {/if}
              <button onclick={() => onDeleteWorkout(workout.id)} class="p-1.5 text-zinc-500 hover:text-red-500 transition-colors"><Icon icon="ic:baseline-delete" class="text-sm" /></button>
              <button onclick={() => onSelectWeek({ weekId: workout.weekId })} class="text-[9px] font-black {workout.status === 'completed' ? 'text-green-500' : 'text-blue-500'} uppercase tracking-widest hover:scale-105 transition-transform">{workout.status === 'completed' ? 'Done' : 'Start'}</button>
            </div>
          </div>
        {:else}
          <div class="p-4 bg-zinc-800/20 rounded-xl border border-dashed border-zinc-800 text-center"><p class="text-[10px] text-zinc-500 italic uppercase tracking-widest">No workouts planned</p></div>
        {/each}
      </div>
    </div>
  {/if}
</div>
