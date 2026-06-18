<script lang="ts">
  import { trainingState } from '../../lib/state.svelte';
  import { generateId } from '../../lib/utils';
  import type { Workout, Exercise, DayOfWeek } from '../../lib/types';
  import ExerciseForm from './ExerciseForm.svelte';
  import BenchmarkForm from '../common/BenchmarkForm.svelte';
  import Icon from "@iconify/svelte";

  // --- Props ---
  let { 
    plannedWorkouts = [], 
    workout: initialWorkout = null
  } = $props<{ 
    plannedWorkouts: Workout[], 
    workout: Workout | null
  }>();

  // --- State ---
  let workout = $state<Workout | null>(null);
  let isAddingExercise = $state(false);
  let isAddingBenchmark = $state(false);
  let editingExercise = $state<Exercise | null>(null);

  $effect(() => {
    if (initialWorkout && !workout) {
      workout = $state.snapshot(initialWorkout);
    }
  });

  // --- Session Handlers ---

  function handleStartNew() {
    const d = new Date();
    workout = {
      id: generateId(),
      status: 'planned',
      date: d.toISOString(),
      weekId: trainingState.currentWeekId, 
      notes: 'New Session',
      loadFactor: 0,
      exercises: []
    };
  }

  function handleSelectPlanned(p: Workout) {
    workout = { ...$state.snapshot(p), date: new Date().toISOString(), status: 'completed' };
  }

  // --- Benchmark Handlers ---

  function handleAddBenchmark() {
    isAddingBenchmark = true;
  }

  // --- Exercise Handlers ---

  function handleAddExercise() {
    editingExercise = null;
    isAddingExercise = true;
  }

  function handleEditExercise(exercise: Exercise) {
    editingExercise = exercise;
    isAddingExercise = true;
  }

  function saveExercise(data: Omit<Exercise, 'id'>) {
    if (!workout) return;
    
    if (editingExercise) {
      const index = workout.exercises.findIndex((e: Exercise) => e.id === editingExercise?.id);
      if (index !== -1) {
        workout.exercises[index] = { ...data, id: editingExercise.id };
        workout.exercises = [...workout.exercises]; 
      }
    } else {
      const newExercise = { ...data, id: generateId() };
      workout.exercises = [...workout.exercises, newExercise];
    }
    
    isAddingExercise = false;
    editingExercise = null;
  }

  function removeExercise(id: string) {
    if (!workout) return;
    workout.exercises = workout.exercises.filter((e: Exercise) => e.id !== id);
  }

  // --- Persistence Handlers ---

  const days: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  function handleComplete() {
    if (!workout) return;
    workout.status = 'completed';
    trainingState.processWorkoutSave(workout);
  }

  function handleSaveToPlan() {
    if (!workout) return;
    workout.status = 'planned';
    trainingState.processWorkoutSave(workout);
  }
</script>

<div class="w-full max-w-lg space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
  {#if !workout}
    <div class="space-y-5">
      <div class="flex items-center justify-between px-1">
        <h2 class="text-xl font-bold text-white tracking-tight">Start Session</h2>
        <div class="h-1 w-10 bg-blue-500 rounded-full"></div>
      </div>

      <div class="grid gap-3.5">
        <button 
          onclick={handleStartNew}
          class="p-5 bg-blue-600 hover:bg-blue-500 text-white rounded-3xl shadow-xl shadow-blue-900/20 transition-all active:scale-[0.98] text-left group"
        >
          <div class="flex justify-between items-center">
            <div>
              <p class="text-base font-bold">New Session</p>
              <p class="text-[10px] text-blue-200 mt-0.5">Start fresh from scratch</p>
            </div>
            <Icon icon="ic:baseline-plus" class="text-xl group-hover:translate-x-1 transition-transform" />
          </div>
        </button>

        <button 
          onclick={handleAddBenchmark}
          class="p-5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-3xl shadow-xl shadow-emerald-900/20 transition-all active:scale-[0.98] text-left group"
        >
          <div class="flex justify-between items-center">
            <div>
              <p class="text-base font-bold">Log Benchmark</p>
              <p class="text-[10px] text-emerald-200 mt-0.5">Record a test result</p>
            </div>
            <Icon icon="ic:baseline-insights" class="text-xl group-hover:translate-x-1 transition-transform" />
          </div>
        </button>

        {#if isAddingBenchmark}
          <div class="pt-2">
            <BenchmarkForm 
              weekId={trainingState.currentWeekId}
              onSave={() => isAddingBenchmark = false}
              onCancel={() => isAddingBenchmark = false}
            />
          </div>
        {/if}

        {#if plannedWorkouts.length > 0}
          <div class="pt-2 space-y-2.5">
            <h3 class="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-3">Planned for this week</h3>
            {#each plannedWorkouts as p}
              <button 
                onclick={() => handleSelectPlanned(p)}
                class="w-full p-5 bg-zinc-900/50 border border-zinc-800 hover:bg-zinc-800 rounded-3xl text-left transition-all group"
              >
                <div class="flex justify-between items-center">
                  <div class="min-w-0 flex-1">
                    <p class="text-base font-bold text-white truncate">{p.notes}</p>
                    <p class="text-[10px] text-zinc-500 mt-0.5">{p.exercises.length} Exercises</p>
                  </div>
                  <Icon icon="ic:baseline-chevron-right" class="text-lg text-zinc-600 group-hover:text-blue-500 transition-colors ml-4" />
                </div>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>

  {:else if isAddingExercise}
    <div class="space-y-4">
      <button 
        onclick={() => { isAddingExercise = false; editingExercise = null; }}
        class="text-[10px] font-black text-zinc-500 hover:text-white uppercase tracking-widest flex items-center gap-2 px-1"
      >
        <Icon icon="ic:baseline-arrow-back" class="text-sm" />
        Back to Session
      </button>
      <ExerciseForm initialData={editingExercise} onSave={saveExercise} />
    </div>

  {:else}
    <div class="space-y-6">
      <div class="flex items-center justify-between px-1">
        <div class="min-w-0 flex-1">
          <input 
            bind:value={workout.notes}
            class="w-full bg-transparent text-xl font-bold text-white tracking-tight outline-none border-b border-transparent focus:border-blue-500/30 pb-1 transition-colors"
            placeholder="Session Name"
          />
          <textarea 
            bind:value={workout.description}
            class="w-full bg-transparent text-xs font-medium text-zinc-400 outline-none border-b border-transparent focus:border-blue-500/30 pb-1 mt-1 transition-colors resize-none overflow-hidden placeholder:text-zinc-600"
            placeholder="Add session notes or goals here..."
            rows="1"
            oninput={(e) => { e.currentTarget.style.height = 'auto'; e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px'; }}
          ></textarea>
          <div class="flex items-center gap-2 mt-1">
            <span class="text-[9px] font-bold text-blue-500 uppercase tracking-widest">
              {workout.status === 'planned' ? 'Planning' : 'Active Session'}
            </span>
            {#if workout.date}
              <span class="w-1 h-1 bg-zinc-700 rounded-full"></span>
              <span class="text-[9px] font-medium text-zinc-500 uppercase tracking-tighter">
                {new Date(workout.date).toLocaleDateString()}
              </span>
            {/if}
          </div>
        </div>
        <button onclick={() => trainingState.navigate('plan')} class="p-2 text-zinc-600 hover:text-white transition-colors" aria-label="Cancel">
          <Icon icon="ic:baseline-close" class="text-xl" />
        </button>
      </div>

      <div class="space-y-3.5">
        <div class="space-y-1.5 px-1">
          <span class="text-[9px] font-bold text-zinc-500 uppercase tracking-widest ml-1 block">Day of Week</span>
          <div class="flex flex-wrap gap-1.5">
            {#each days as day}
              <button 
                onclick={() => workout!.dayOfWeek = day}
                class="px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all border
                  {workout.dayOfWeek === day 
                    ? 'bg-blue-600 border-blue-500 text-white shadow-lg' 
                    : 'bg-zinc-800/50 border-zinc-700 text-zinc-500 hover:text-zinc-300'}"
              >
                {day.slice(0, 3)}
              </button>
            {/each}
            <button 
              onclick={() => workout!.dayOfWeek = undefined}
              class="px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all border
                {!workout.dayOfWeek 
                  ? 'bg-zinc-600 border-zinc-500 text-white shadow-lg' 
                  : 'bg-zinc-800/50 border-zinc-700 text-zinc-500 hover:text-zinc-300'}"
            >
              None
            </button>
          </div>
        </div>

        <div class="flex items-center justify-between px-1">
          <h3 class="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Exercises</h3>
          <button 
            onclick={handleAddExercise}
            class="bg-zinc-800 hover:bg-zinc-700 text-white p-1.5 rounded-lg transition-colors shadow-lg shadow-black/20"
            aria-label="Add Exercise"
          >
            <Icon icon="ic:baseline-plus" class="text-lg" />
          </button>
        </div>

        <div class="space-y-2.5">
          {#each workout.exercises as exercise}
            <div class="p-4 bg-zinc-900/50 border border-zinc-800 rounded-2xl flex justify-between items-center group/item hover:border-zinc-700 transition-all">
              <div class="flex-1 min-w-0">
                <p class="font-bold text-sm text-white truncate">{exercise.type}</p>
                {#if exercise.duration}
                  <p class="text-[9px] text-zinc-500 uppercase tracking-tighter">{exercise.duration} mins</p>
                {/if}
              </div>
              
              <div class="flex items-center gap-1">
                <button 
                  onclick={() => handleEditExercise(exercise)}
                  class="p-2 text-zinc-600 hover:text-blue-500 transition-colors"
                  aria-label="Edit Details"
                >
                  <Icon icon="ic:baseline-edit" class="text-sm" />
                </button>
                <button 
                  onclick={() => removeExercise(exercise.id)}
                  class="p-2 text-zinc-600 hover:text-red-500 transition-colors"
                  aria-label="Remove"
                >
                  <Icon icon="ic:baseline-delete" class="text-sm" />
                </button>
              </div>
            </div>
          {:else}
            <div class="py-10 border-2 border-dashed border-zinc-900 rounded-3xl text-center bg-zinc-900/10">
              <p class="text-[10px] text-zinc-600 italic font-medium uppercase tracking-widest">No exercises added yet</p>
            </div>
          {/each}
        </div>
      </div>

      <div class="grid grid-cols-1 gap-3 pt-4">
        <button 
          onclick={handleComplete}
          disabled={workout.exercises.length === 0}
          class="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold py-4 rounded-2xl shadow-xl shadow-blue-900/20 transition-all active:scale-[0.98]"
        >
          {workout.status === 'completed' ? 'Save Changes' : 'Finish & Rate Session'}
        </button>
        
        {#if workout.status === 'planned'}
          <button 
            onclick={handleSaveToPlan}
            class="w-full bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-bold py-3.5 rounded-xl border border-zinc-700/50 transition-all"
          >
            Update Plan
          </button>
        {/if}
      </div>
    </div>
  {/if}
</div>
