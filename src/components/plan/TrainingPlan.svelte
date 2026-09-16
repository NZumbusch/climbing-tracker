<script lang="ts">
  import { trainingState } from '../../lib/state.svelte';
  import { getWeekId, getWeekDateRange } from '../../lib/dateUtils';
  import { generateId } from '../../lib/utils';
  import { getBlocksForWeek, getDominantBlockForWeek } from '../../lib/planning/trainingBlocks';
  import type { Workout, Benchmark } from '../../lib/types';
  import Icon from "@iconify/svelte";
  import BenchmarkForm from '../common/BenchmarkForm.svelte';
  import AIPromptModal from './AIPromptModal.svelte';
  import AIImportModal from './AIImportModal.svelte';
  import WeekCalendar from './WeekCalendar.svelte';
  import BlockManager from './BlockManager.svelte';
  import CompetitionCalendar from './CompetitionCalendar.svelte';

  // --- Theme ---
  const FALLBACK_PHASE_COLOR = 'bg-zinc-500';

  /** Only non-archived phases are offered for new assignment; archived ones stay resolvable for display via phaseDefById. */
  const selectablePhases = $derived(
    [...trainingState.phaseDefs]
      .filter((p) => !p.archived)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
  );

  const phaseDefById = $derived(new Map(trainingState.phaseDefs.map((p) => [p.id, p])));
  const phaseColor = (phaseId?: string) => (phaseId && phaseDefById.get(phaseId)?.color) || FALLBACK_PHASE_COLOR;
  const phaseName = (phaseId?: string) => (phaseId && phaseDefById.get(phaseId)?.name) || undefined;

  // --- State ---

  let showPhaseDropdown = $state(false);
  let isAddingBenchmark = $state(false);
  let editingBenchmark = $state<Benchmark | null>(null);
  let showAIPrompt = $state(false);
  let showAIImport = $state(false);
  let showBlockManager = $state(false);

  // --- Logic: Calendar Generation ---

  const weeks = $derived.by(() => {
    const currentWeekId = trainingState.currentWeekId;
    const tempWeeks: { id: string; label: string; phaseId?: string; isCurrent: boolean; year: number; hasOverlap: boolean }[] = [];

    const startOffset = -25 + (trainingState.weekOffset * 50);
    const endOffset = 24 + (trainingState.weekOffset * 50);

    for (let i = startOffset; i <= endOffset; i++) {
      const d = new Date();
      d.setDate(d.getDate() + (i * 7));
      const id = getWeekId(d);
      const covering = getBlocksForWeek(trainingState.trainingBlocks, id);
      const dominant = getDominantBlockForWeek(trainingState.trainingBlocks, id);

      tempWeeks.push({
        id,
        label: `Week ${id.split('-W')[1]}`,
        phaseId: dominant?.phaseId,
        isCurrent: id === currentWeekId,
        year: d.getUTCFullYear(),
        hasOverlap: covering.length > 1,
      });
    }
    return tempWeeks;
  });

  const calendarWeeks = $derived(
    weeks.map((w) => ({
      id: w.id,
      label: w.label,
      year: w.year,
      isCurrent: w.isCurrent,
      color: phaseColor(w.phaseId),
      tooltip: `${w.id}${phaseName(w.phaseId) ? ` - ${phaseName(w.phaseId)}` : ''}${w.hasOverlap ? ' (overlapping blocks)' : ''}`,
      hasOverlap: w.hasOverlap,
    })),
  );

  /** Every block covering the selected week, for the "Active Blocks" list - not just the dominant one. */
  const selectedWeekBlocks = $derived(
    trainingState.selectedWeekId ? getBlocksForWeek(trainingState.trainingBlocks, trainingState.selectedWeekId) : [],
  );

  $effect(() => {
    if (!trainingState.selectedWeekId) trainingState.selectedWeekId = trainingState.currentWeekId;
  });

  // --- Helpers ---
  const selectedWeekData = $derived(weeks.find(w => w.id === trainingState.selectedWeekId));
  
  const dayOrder: Record<string, number> = {
    'Monday': 0, 'Tuesday': 1, 'Wednesday': 2, 'Thursday': 3, 'Friday': 4, 'Saturday': 5, 'Sunday': 6
  };

  const weekWorkouts = $derived.by(() => {
    const workouts = trainingState.workouts.filter((w: Workout) => w.weekId === trainingState.selectedWeekId);
    return [...workouts].sort((a, b) => {
      const orderA = a.dayOfWeek ? dayOrder[a.dayOfWeek] : 99;
      const orderB = b.dayOfWeek ? dayOrder[b.dayOfWeek] : 99;
      if (orderA !== orderB) return orderA - orderB;
      const timeA = a.startTime || "24:00";
      const timeB = b.startTime || "24:00";
      if (timeA !== timeB) return timeA.localeCompare(timeB);
      return a.id.localeCompare(b.id);
    });
  });

  const weekBenchmarks = $derived(trainingState.benchmarks.filter((b: Benchmark) => b.weekId === trainingState.selectedWeekId));

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

  async function handleAssign(phaseId: string) {
    if (!trainingState.selectedWeekId) return;
    await trainingState.assignPhase(trainingState.selectedWeekId, phaseId);
    showPhaseDropdown = false;
  }

  function navigate(direction: 'prev' | 'next' | 'today') {
    if (direction === 'prev') trainingState.weekOffset--;
    else if (direction === 'next') trainingState.weekOffset++;
    else if (direction === 'today') {
      trainingState.weekOffset = 0;
      trainingState.selectedWeekId = trainingState.currentWeekId;
    }
    showPhaseDropdown = false;
  }

  function handleAddWorkout(weekId: string) {
    const dominantBlock = getDominantBlockForWeek(trainingState.trainingBlocks, weekId);
    const newWorkout: Workout = {
      id: generateId(),
      status: 'planned',
      date: null,
      weekId,
      notes: 'New Session',
      loadFactor: 0,
      exercises: [],
      blockId: dominantBlock?.id,
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
      <h2 class="text-xl font-bold text-content tracking-tight">Training Plan</h2>
      <div class="flex items-center gap-2">
        <button
          onclick={() => showBlockManager = true}
          class="px-2 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg transition-all active:scale-95"
          aria-label="Manage Training Blocks"
          title="Manage Training Blocks"
        >
          <Icon icon="ic:baseline-view-week" class="text-sm" />
        </button>
        <button
          onclick={() => showAIPrompt = true}
          class="px-2 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg transition-all active:scale-95"
          aria-label="Generate AI Prompt"
          title="Generate AI Prompt"
        >
          <Icon icon="ic:baseline-auto-awesome" class="text-sm" />
        </button>
        <button
          onclick={() => showAIImport = true}
          class="px-2 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg transition-all active:scale-95"
          aria-label="Import AI Plan"
          title="Import AI Plan"
        >
          <Icon icon="ic:baseline-file-upload" class="text-sm" />
        </button>
        <button
          onclick={() => navigate('today')}
          class="px-3 py-1.5 bg-surface-elevated/50 hover:bg-surface-elevated text-[9px] font-black text-content-muted hover:text-content uppercase tracking-widest rounded-lg border border-border-strong/50 transition-all active:scale-95"
        >
          Today
        </button>
        <div class="flex bg-surface/50 rounded-xl border border-border p-1">
          <button onclick={() => navigate('prev')} class="p-1.5 hover:bg-surface-elevated text-content-subtle hover:text-content rounded-lg transition-colors active:scale-90"><Icon icon="ic:baseline-chevron-left" class="text-lg" /></button>
          <button onclick={() => navigate('next')} class="p-1.5 hover:bg-surface-elevated text-content-subtle hover:text-content rounded-lg transition-colors active:scale-90"><Icon icon="ic:baseline-chevron-right" class="text-lg" /></button>
        </div>
      </div>
    </div>
    
    <div class="flex flex-wrap gap-x-3 gap-y-1.5 px-1">
      {#each selectablePhases as phase}
        <div class="flex items-center gap-1">
          <div class="w-2.5 h-2.5 rounded-sm {phase.color || FALLBACK_PHASE_COLOR}"></div>
          <span class="text-[9px] font-bold text-content-subtle uppercase tracking-widest">{phase.name}</span>
        </div>
      {/each}
    </div>

    <div class="grid grid-cols-2 gap-3 px-1">
      <button 
        onclick={() => trainingState.navigate('analytics')}
        class="bg-surface/50 border border-border p-4 rounded-2xl backdrop-blur-sm relative overflow-hidden group text-left transition-all hover:bg-surface-elevated/80 active:scale-95"
      >
        <span class="block text-[10px] font-bold uppercase tracking-widest text-content-subtle mb-1">Rolling Load</span>
        <div class="flex items-baseline gap-1">
          <span class="text-2xl font-black text-content tracking-tighter">{Math.round(rollingLoad)}</span>
          <span class="text-[9px] font-bold text-primary">AVG</span>
        </div>
        <Icon icon="ic:baseline-chevron-right" class="absolute right-3 bottom-3 text-zinc-700 group-hover:text-primary transition-colors" />
      </button>
      
      <div class="bg-surface/50 border border-border p-4 rounded-2xl backdrop-blur-sm relative overflow-hidden group">
        <span class="block text-[10px] font-bold uppercase tracking-widest text-content-subtle mb-1">Weekly Sessions</span>
        <div class="flex items-baseline gap-1">
          <span class="text-2xl font-black text-content tracking-tighter">{weeklyWorkoutsCount}</span>
          <span class="text-[9px] font-bold text-success">DONE</span>
        </div>
      </div>
    </div>

    <WeekCalendar
      weeks={calendarWeeks}
      selectedWeekId={trainingState.selectedWeekId}
      onSelectWeek={(weekId) => { trainingState.selectedWeekId = weekId; showPhaseDropdown = false; }}
    />
  </div>

  {#if trainingState.selectedWeekId && selectedWeekData}
    <div class="bg-surface/50 border border-border p-6 rounded-3xl backdrop-blur-sm space-y-5 shadow-xl relative {showPhaseDropdown ? 'z-30' : ''}">
      <div class="flex justify-between items-start">
        <div class="flex-1 relative">
          <span class="text-[9px] font-black uppercase tracking-[0.15em] text-primary mb-0.5 block">{selectedWeekData.isCurrent ? 'Current Week' : selectedWeekData.id} <span class="text-content-subtle opacity-70 ml-2 lowercase tracking-normal">({getWeekDateRange(selectedWeekData.id)})</span></span>
          <button onclick={() => showPhaseDropdown = !showPhaseDropdown} class="text-left group flex items-center gap-2">
            <h3 class="text-xl font-bold text-content tracking-tight group-hover:text-primary-hover transition-colors">{phaseName(selectedWeekData.phaseId) ?? 'No Phase'}</h3>
            <span class="text-content-subtle group-hover:text-primary-hover transition-colors"><Icon icon="ic:baseline-arrow-drop-down" class="text-xl" /></span>
          </button>

          {#if showPhaseDropdown}
            <div class="absolute left-0 mt-2 w-44 bg-surface border border-border rounded-xl shadow-2xl z-20 overflow-hidden animate-in zoom-in-95 duration-200">
              <div class="p-2 border-b border-border bg-surface/50"><span class="text-[8px] font-black text-content-subtle uppercase tracking-widest px-1">Select Phase</span></div>
              {#each selectablePhases as phase}
                <button onclick={() => handleAssign(phase.id)} class="w-full text-left px-3 py-2.5 text-[10px] font-bold text-content-muted hover:bg-surface-elevated hover:text-content transition-colors border-b border-border last:border-0 flex items-center gap-2">
                  <div class="w-2 h-2 rounded-full {phase.color || FALLBACK_PHASE_COLOR}"></div>{phase.name}
                </button>
              {/each}
            </div>
          {/if}

          {#if selectedWeekBlocks.length > 1}
            <div class="flex flex-wrap gap-1.5 mt-2">
              {#each selectedWeekBlocks as block}
                <span class="flex items-center gap-1.5 px-2 py-1 bg-surface-elevated/70 rounded-lg border border-border-strong/50 text-[8px] font-bold text-content-muted uppercase tracking-wider">
                  <span class="w-1.5 h-1.5 rounded-full {block.color || phaseColor(block.phaseId)}"></span>
                  {block.name}
                </span>
              {/each}
            </div>
          {/if}
        </div>

        <button
          onclick={() => trainingState.clearWeek(trainingState.selectedWeekId!)}
          class="flex items-center gap-2 px-3 py-2 bg-surface-elevated/50 hover:bg-danger/10 text-white-subtle hover:text-danger rounded-xl border border-border-strong/50 hover:border-red-500/20 transition-all text-[9px] font-black uppercase tracking-widest active:scale-95"
          title="Clear all data for this week"
        >
          <Icon icon="ic:baseline-delete-sweep" class="text-sm" />
          Clear Week
        </button>
      </div>

      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <h4 class="text-[10px] font-bold text-content-subtle uppercase tracking-widest">Scheduled Sessions</h4>
          <div class="flex items-center gap-3">
            <span class="text-[9px] text-content-subtle font-bold">{weekWorkouts.length} Total</span>
            <button onclick={() => handleAddWorkout(trainingState.selectedWeekId!)} class="bg-surface-elevated hover:bg-surface-elevated-hover text-content p-1 rounded-md transition-colors"><Icon icon="ic:baseline-plus" class="text-sm" /></button>
          </div>
        </div>

        {#each weekWorkouts as workout}
          <div class="flex items-center justify-between p-3.5 bg-surface-elevated/50 rounded-xl border border-border-strong/50 hover:border-zinc-600 transition-colors group/item">
            <div class="flex items-center gap-2.5 flex-1 min-w-0">
              <div class="w-1.5 h-1.5 rounded-full {workout.status === 'completed' ? 'bg-green-500' : 'bg-primary-hover'}"></div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <div class="flex items-center gap-1.5">
                    {#if workout.dayOfWeek}
                      <span class="text-[8px] font-black text-primary-hover uppercase bg-primary-hover/10 px-1.5 py-0.5 rounded leading-none shrink-0">{workout.dayOfWeek.slice(0, 3)}</span>
                    {/if}
                    {#if workout.startTime}
                      <span class="text-[8px] font-black text-content-muted uppercase bg-surface-elevated px-1.5 py-0.5 rounded border border-border leading-none shrink-0">{workout.startTime}</span>
                    {/if}
                  </div>
                  <p class="text-xs font-bold text-content leading-tight truncate">{workout.notes}</p>
                </div>
                <p class="text-[9px] text-content-subtle mt-0.5 uppercase tracking-tighter">{workout.exercises.length} Exercises</p>
              </div>
            </div>
            
            <div class="flex items-center gap-2 ml-4">
              <button onclick={() => trainingState.duplicateWorkout(workout)} class="p-1.5 text-content-subtle hover:text-content transition-colors" title="Duplicate"><Icon icon="ic:baseline-content-copy" class="text-sm" /></button>
              <button onclick={() => trainingState.navigate('add', workout)} class="p-1.5 text-content-subtle hover:text-content transition-colors"><Icon icon="ic:baseline-edit" class="text-sm" /></button>
              <button onclick={() => trainingState.deleteWorkout(workout.id)} class="p-1.5 text-content-subtle hover:text-danger transition-colors"><Icon icon="ic:baseline-delete" class="text-sm" /></button>
              {#if workout.status === 'completed'}
                <span class="text-[9px] font-black text-success uppercase tracking-widest">Done</span>
              {:else}
                <button onclick={() => trainingState.navigate('add', workout)} class="text-[9px] font-black text-primary uppercase tracking-widest hover:scale-105 transition-transform">Start</button>
              {/if}
            </div>
          </div>
        {:else}
          <div class="p-4 bg-surface-elevated/20 rounded-xl border border-dashed border-border text-center"><p class="text-[10px] text-content-subtle italic uppercase tracking-widest">No workouts planned</p></div>
        {/each}
      </div>

      <div class="pt-4 space-y-3">
        <div class="flex items-center justify-between">
          <h4 class="text-[10px] font-bold text-content-subtle uppercase tracking-widest">Benchmark Tests</h4>
          <button onclick={handleAddBenchmark} class="bg-surface-elevated hover:bg-surface-elevated-hover text-content p-1 rounded-md transition-colors"><Icon icon="ic:baseline-plus" class="text-sm" /></button>
        </div>

        {#if isAddingBenchmark}
          <BenchmarkForm 
            weekId={trainingState.selectedWeekId!} 
            initialData={editingBenchmark}
            onSave={() => { isAddingBenchmark = false; editingBenchmark = null; }}
            onCancel={() => { isAddingBenchmark = false; editingBenchmark = null; }}
          />
        {/if}

        <div class="space-y-2">
          {#each weekBenchmarks as benchmark}
            <div class="flex items-center justify-between p-3.5 bg-primary-hover/5 rounded-xl border border-primary/10 group/benchmark">
              <div class="flex-1 min-w-0">
                <p class="text-xs font-bold text-content leading-tight truncate">{benchmark.type}</p>
                <p class="text-[9px] text-primary-hover mt-0.5 uppercase font-black">{benchmark.value} {benchmark.unit}</p>
              </div>
              <div class="flex items-center gap-2">
                <button onclick={() => handleEditBenchmark(benchmark)} class="p-1.5 text-content-subtle hover:text-content transition-colors opacity-0 group-hover/benchmark:opacity-100"><Icon icon="ic:baseline-edit" class="text-sm" /></button>
                <button onclick={() => trainingState.deleteBenchmark(benchmark.id)} class="p-1.5 text-content-subtle hover:text-danger transition-colors opacity-0 group-hover/benchmark:opacity-100"><Icon icon="ic:baseline-delete" class="text-sm" /></button>
              </div>
            </div>
          {:else}
            {#if !isAddingBenchmark}
              <div class="p-4 bg-surface-elevated/20 rounded-xl border border-dashed border-border text-center"><p class="text-[10px] text-content-subtle italic uppercase tracking-widest">No benchmarks logged</p></div>
            {/if}
          {/each}
        </div>
      </div>
    </div>
  {/if}

  <CompetitionCalendar />
</div>

{#if showAIPrompt}
  <AIPromptModal onClose={() => showAIPrompt = false} />
{/if}

{#if showAIImport}
  <AIImportModal mode="plan" onClose={() => showAIImport = false} />
{/if}

{#if showBlockManager}
  <BlockManager onClose={() => showBlockManager = false} />
{/if}

