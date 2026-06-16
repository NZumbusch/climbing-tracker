<script lang="ts">
  import { trainingState } from '../../lib/state.svelte';
  import { getWeekId } from '../../lib/dateUtils';
  import { generateId } from '../../lib/utils';
  import type { PhaseType, PeriodizationWeek, Workout, Benchmark } from '../../lib/types';
  import Icon from "@iconify/svelte";
  import BenchmarkForm from '../common/BenchmarkForm.svelte';

  // --- Theme ---
  const phaseColors: Record<PhaseType, string> = {
    'Work Capacity': 'bg-emerald-500',
    'Max Strength': 'bg-rose-500',
    'Power': 'bg-amber-500',
    'Power Endurance': 'bg-purple-500',
    'Performance / Taper': 'bg-sky-500',
    'Deload': 'bg-zinc-500'
  };

  const phases: PhaseType[] = ['Work Capacity', 'Max Strength', 'Power', 'Power Endurance', 'Performance / Taper', 'Deload'];

  // --- State ---
  let selectedWeekId = $state<string | null>(null);
  let weekOffset = $state(0); 
  let showPhaseDropdown = $state(false);
  let isAddingBenchmark = $state(false);
  let editingBenchmark = $state<Benchmark | null>(null);

  // --- Logic: Calendar Generation ---

  const weeks = $derived.by(() => {
    const currentWeekId = trainingState.currentWeekId;
    const tempWeeks: { id: string; label: string; phase?: PhaseType; isCurrent: boolean; year: number }[] = [];

    const startOffset = -25 + (weekOffset * 50);
    const endOffset = 24 + (weekOffset * 50);

    for (let i = startOffset; i <= endOffset; i++) {
      const d = new Date();
      d.setDate(d.getDate() + (i * 7));
      const id = getWeekId(d);
      const phaseEntry = trainingState.periodization.find((p: PeriodizationWeek) => p.weekId === id);
      
      tempWeeks.push({
        id,
        label: `Week ${id.split('-W')[1]}`,
        phase: phaseEntry?.phase,
        isCurrent: id === currentWeekId,
        year: d.getUTCFullYear()
      });
    }
    return tempWeeks;
  });

  $effect(() => {
    if (!selectedWeekId) selectedWeekId = trainingState.currentWeekId;
  });

  // --- Helpers ---
  const selectedWeekData = $derived(weeks.find(w => w.id === selectedWeekId));
  
  const dayOrder: Record<string, number> = {
    'Monday': 0, 'Tuesday': 1, 'Wednesday': 2, 'Thursday': 3, 'Friday': 4, 'Saturday': 5, 'Sunday': 6
  };

  const weekWorkouts = $derived.by(() => {
    const workouts = trainingState.workouts.filter((w: Workout) => w.weekId === selectedWeekId);
    return [...workouts].sort((a, b) => {
      const orderA = a.dayOfWeek ? dayOrder[a.dayOfWeek] : 99;
      const orderB = b.dayOfWeek ? dayOrder[b.dayOfWeek] : 99;
      return orderA - orderB || a.id.localeCompare(b.id);
    });
  });

  const weekBenchmarks = $derived(trainingState.benchmarks.filter((b: Benchmark) => b.weekId === selectedWeekId));

  const rollingLoad = $derived.by(() => {
    const completed = trainingState.completedWorkouts;
    const recent = completed.slice(-5);
    if (recent.length === 0) return 0;
    return recent.reduce((acc: number, w: Workout) => acc + (w.loadFactor || 0), 0) / recent.length;
  });
  
  const weeklyWorkoutsCount = $derived.by(() => {
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return trainingState.completedWorkouts.filter((w: Workout) => {
      if (!w.date) return false;
      return new Date(w.date).getTime() > oneWeekAgo;
    }).length;
  });

  // --- Handlers ---

  async function handleAssign(phase: PhaseType) {
    if (!selectedWeekId) return;
    await trainingState.assignPhase(selectedWeekId, phase);
    showPhaseDropdown = false;
  }

  function navigate(direction: 'prev' | 'next' | 'today') {
    if (direction === 'prev') weekOffset--;
    else if (direction === 'next') weekOffset++;
    else if (direction === 'today') weekOffset = 0;
    showPhaseDropdown = false;
  }

  function handleAddWorkout(weekId: string) {
    const newWorkout: Workout = {
      id: generateId(),
      status: 'planned',
      date: null,
      weekId,
      notes: 'New Session',
      loadFactor: 0,
      exercises: []
    };
    trainingState.navigate('add', newWorkout);
  }

  function handleAddBenchmark() {
    editingBenchmark = null;
    isAddingBenchmark = true;
  }

  function handleEditBenchmark(benchmark: Benchmark) {
    editingBenchmark = benchmark;
    isAddingBenchmark = true;
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
        onclick={() => trainingState.navigate('analytics')}
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

        <button 
          onclick={() => trainingState.clearWeek(selectedWeekId!)}
          class="flex items-center gap-2 px-3 py-2 bg-zinc-800/50 hover:bg-red-500/10 text-zinc-500 hover:text-red-500 rounded-xl border border-zinc-700/50 hover:border-red-500/20 transition-all text-[9px] font-black uppercase tracking-widest active:scale-95"
          title="Clear all data for this week"
        >
          <Icon icon="ic:baseline-delete-sweep" class="text-sm" />
          Clear Week
        </button>
      </div>

      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <h4 class="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Scheduled Sessions</h4>
          <div class="flex items-center gap-3">
            <span class="text-[9px] text-zinc-600 font-bold">{weekWorkouts.length} Total</span>
            <button onclick={() => handleAddWorkout(selectedWeekId!)} class="bg-zinc-800 hover:bg-zinc-700 text-white p-1 rounded-md transition-colors"><Icon icon="ic:baseline-plus" class="text-sm" /></button>
          </div>
        </div>

        {#each weekWorkouts as workout}
          <div class="flex items-center justify-between p-3.5 bg-zinc-800/50 rounded-xl border border-zinc-700/50 hover:border-zinc-600 transition-colors group/item">
            <div class="flex items-center gap-2.5 flex-1 min-w-0">
              <div class="w-1.5 h-1.5 rounded-full {workout.status === 'completed' ? 'bg-green-500' : 'bg-blue-500'}"></div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  {#if workout.dayOfWeek}
                    <span class="text-[8px] font-black text-blue-400 uppercase bg-blue-500/10 px-1.5 py-0.5 rounded leading-none shrink-0">{workout.dayOfWeek.slice(0, 3)}</span>
                  {/if}
                  <p class="text-xs font-bold text-white leading-tight truncate">{workout.notes}</p>
                </div>
                <p class="text-[9px] text-zinc-500 mt-0.5 uppercase tracking-tighter">{workout.exercises.length} Exercises</p>
              </div>
            </div>
            
            <div class="flex items-center gap-2 ml-4">
              <button onclick={() => trainingState.duplicateWorkout(workout)} class="p-1.5 text-zinc-500 hover:text-white transition-colors" title="Duplicate"><Icon icon="ic:baseline-content-copy" class="text-sm" /></button>
              <button onclick={() => trainingState.navigate('add', workout)} class="p-1.5 text-zinc-500 hover:text-white transition-colors"><Icon icon="ic:baseline-edit" class="text-sm" /></button>
              <button onclick={() => trainingState.deleteWorkout(workout.id)} class="p-1.5 text-zinc-500 hover:text-red-500 transition-colors"><Icon icon="ic:baseline-delete" class="text-sm" /></button>
              <button onclick={() => trainingState.navigate('add', workout)} class="text-[9px] font-black {workout.status === 'completed' ? 'text-green-500' : 'text-blue-500'} uppercase tracking-widest hover:scale-105 transition-transform">{workout.status === 'completed' ? 'Done' : 'Start'}</button>
            </div>
          </div>
        {:else}
          <div class="p-4 bg-zinc-800/20 rounded-xl border border-dashed border-zinc-800 text-center"><p class="text-[10px] text-zinc-500 italic uppercase tracking-widest">No workouts planned</p></div>
        {/each}
      </div>

      <div class="pt-4 space-y-3">
        <div class="flex items-center justify-between">
          <h4 class="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Benchmark Tests</h4>
          <button onclick={handleAddBenchmark} class="bg-zinc-800 hover:bg-zinc-700 text-white p-1 rounded-md transition-colors"><Icon icon="ic:baseline-plus" class="text-sm" /></button>
        </div>

        {#if isAddingBenchmark}
          <BenchmarkForm 
            weekId={selectedWeekId!} 
            initialData={editingBenchmark}
            onSave={() => { isAddingBenchmark = false; editingBenchmark = null; }}
            onCancel={() => { isAddingBenchmark = false; editingBenchmark = null; }}
          />
        {/if}

        <div class="space-y-2">
          {#each weekBenchmarks as benchmark}
            <div class="flex items-center justify-between p-3.5 bg-blue-500/5 rounded-xl border border-blue-500/10 group/benchmark">
              <div class="flex-1 min-w-0">
                <p class="text-xs font-bold text-white leading-tight truncate">{benchmark.type}</p>
                <p class="text-[9px] text-blue-400 mt-0.5 uppercase font-black">{benchmark.value} {benchmark.unit}</p>
              </div>
              <div class="flex items-center gap-2">
                <button onclick={() => handleEditBenchmark(benchmark)} class="p-1.5 text-zinc-500 hover:text-white transition-colors opacity-0 group-hover/benchmark:opacity-100"><Icon icon="ic:baseline-edit" class="text-sm" /></button>
                <button onclick={() => trainingState.deleteBenchmark(benchmark.id)} class="p-1.5 text-zinc-500 hover:text-red-500 transition-colors opacity-0 group-hover/benchmark:opacity-100"><Icon icon="ic:baseline-delete" class="text-sm" /></button>
              </div>
            </div>
          {:else}
            {#if !isAddingBenchmark}
              <div class="p-4 bg-zinc-800/20 rounded-xl border border-dashed border-zinc-800 text-center"><p class="text-[10px] text-zinc-500 italic uppercase tracking-widest">No benchmarks logged</p></div>
            {/if}
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>
