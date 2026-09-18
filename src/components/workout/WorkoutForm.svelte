<script lang="ts">
  import { trainingState } from '../../lib/state.svelte';
  import { generateId, showConfirm } from '../../lib/utils';
  import type { Workout, ExerciseSlot, ExerciseValues, ParameterBlock, DayOfWeek } from '../../lib/types';
  import { slotValues, slotTypeName } from '../../lib/exerciseSlot';
  import { dndzone, type DndEvent } from 'svelte-dnd-action';
  import { flip } from 'svelte/animate';
  import ExerciseForm from './ExerciseForm.svelte';
  import BenchmarkForm from '../common/BenchmarkForm.svelte';
  import AIImportModal from '../plan/AIImportModal.svelte';
  import TimerWidget from './TimerWidget.svelte';
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
  let editingSlot = $state<ExerciseSlot | null>(null);
  let isImportingAILog = $state(false);

  // Which ExerciseValues bucket the form edits - wired to the existing
  // planned/completed status distinction (see PLAN.md Phase 1).
  const exerciseFormMode = $derived<'prescribed' | 'logged'>(
    workout?.status === 'completed' ? 'logged' : 'prescribed',
  );

  /** For every slot missing `logged`, seed it from `prescribed` as the starting point for editing - never leave it undefined once a workout is being actively logged. */
  function ensureLoggedInitialized(w: Workout) {
    w.exercises = w.exercises.map(e => e.logged ? e : { ...e, logged: { ...(e.prescribed ?? {}) } });
  }

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
      startTime: d.toTimeString().slice(0, 5),
      loadFactor: 0,
      exercises: []
    };
  }

  function handleSelectPlanned(p: Workout) {
    const d = new Date();
    workout = { ...$state.snapshot(p), date: d.toISOString(), startTime: p.startTime || d.toTimeString().slice(0, 5), status: 'completed' };
    ensureLoggedInitialized(workout);
  }

  // --- Benchmark Handlers ---

  function handleAddBenchmark() {
    isAddingBenchmark = true;
  }

  // --- Exercise Handlers ---

  function handleAddExercise() {
    editingSlot = null;
    isAddingExercise = true;
  }

  function handleEditExercise(exercise: ExerciseSlot) {
    editingSlot = exercise;
    isAddingExercise = true;
  }

  function saveExercise(data: { typeId: string; categoryId?: string; activeParameters: ParameterBlock[]; values: ExerciseValues }) {
    if (!workout) return;
    const mode = exerciseFormMode;

    if (editingSlot) {
      const index = workout.exercises.findIndex((e: ExerciseSlot) => e.id === editingSlot?.id);
      if (index !== -1) {
        const existing = workout.exercises[index];
        workout.exercises[index] = {
          ...existing,
          typeId: data.typeId,
          categoryId: data.categoryId,
          activeParameters: data.activeParameters,
          [mode]: data.values
        };
        workout.exercises = [...workout.exercises];
      }
    } else {
      const newSlot: ExerciseSlot = {
        id: generateId(),
        typeId: data.typeId,
        categoryId: data.categoryId,
        activeParameters: data.activeParameters,
        [mode]: data.values
      };
      workout.exercises = [...workout.exercises, newSlot];
    }

    isAddingExercise = false;
    editingSlot = null;
  }

  /** Appends AI-parsed exercises to this session - see AIImportModal's "workoutLog" mode. */
  function handleImportAILog(slots: ExerciseSlot[]) {
    if (!workout) return;
    workout.exercises = [...workout.exercises, ...slots];
    isImportingAILog = false;
  }

  async function removeExercise(id: string) {
    if (!workout) return;
    const confirmed = await showConfirm('Remove Exercise', 'Are you sure you want to remove this exercise?');
    if (confirmed) {
      workout.exercises = workout.exercises.filter((e: ExerciseSlot) => e.id !== id);
    }
  }

  function handleDndConsider(e: CustomEvent<DndEvent<ExerciseSlot>>) {
    if (!workout) return;
    workout.exercises = e.detail.items;
  }

  function handleDndFinalize(e: CustomEvent<DndEvent<ExerciseSlot>>) {
    if (!workout) return;
    workout.exercises = e.detail.items;
  }

  async function handleCancel() {
    if (workout && workout.exercises.length > 0) {
      const confirmed = await showConfirm('Discard Session', 'Are you sure you want to discard this session? All unsaved changes will be lost.');
      if (!confirmed) return;
    }
    trainingState.navigate('plan');
  }

  // --- Persistence Handlers ---

  const days: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  function handleComplete() {
    if (!workout) return;
    if (workout.status !== 'completed') ensureLoggedInitialized(workout);
    workout.status = 'completed';
    trainingState.processWorkoutSave(workout);
  }

  function handleSaveToPlan() {
    if (!workout) return;
    workout.status = 'planned';
    trainingState.processWorkoutSave(workout);
  }
</script>

<div class="w-full max-w-lg space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
  {#if !workout}
    <div class="space-y-5">
      <div class="flex items-center justify-between px-1">
        <h2 class="text-title text-content">Start Session</h2>
        <div class="h-1 w-10 bg-primary-hover rounded-full"></div>
      </div>

      <div class="grid gap-3.5">
        <button
          onclick={handleStartNew}
          class="p-5 bg-primary hover:bg-primary-hover text-white rounded-card shadow-xl shadow-primary/20 transition-all active:scale-[0.98] text-left group"
        >
          <div class="flex justify-between items-center">
            <div>
              <p class="text-body font-bold">New Session</p>
              <p class="text-caption text-white/80 mt-0.5">Start fresh from scratch</p>
            </div>
            <Icon icon="ic:baseline-plus" class="text-xl group-hover:translate-x-1 transition-transform" />
          </div>
        </button>

        <button
          onclick={handleAddBenchmark}
          class="p-5 bg-success hover:bg-success-hover text-white rounded-card shadow-xl shadow-success/20 transition-all active:scale-[0.98] text-left group"
        >
          <div class="flex justify-between items-center">
            <div>
              <p class="text-body font-bold">Log Benchmark</p>
              <p class="text-caption text-white/80 mt-0.5">Record a test result</p>
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
            <h3 class="text-section uppercase text-content-subtle ml-3">Planned for this week</h3>
            {#each plannedWorkouts as p}
              <button
                onclick={() => handleSelectPlanned(p)}
                class="w-full p-5 bg-surface/50 border border-border hover:bg-surface-elevated rounded-card text-left transition-all group"
              >
                <div class="flex justify-between items-center">
                  <div class="min-w-0 flex-1">
                    <p class="text-body font-bold text-content truncate">{p.notes}</p>
                    <p class="text-caption text-content-subtle mt-0.5">{p.exercises.length} Exercises</p>
                  </div>
                  <Icon icon="ic:baseline-chevron-right" class="text-lg text-content-subtle group-hover:text-primary transition-colors ml-4" />
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
        onclick={() => { isAddingExercise = false; editingSlot = null; }}
        class="text-label text-content-subtle hover:text-content flex items-center gap-2 px-1"
      >
        <Icon icon="ic:baseline-arrow-back" class="text-sm" />
        Back to Session
      </button>
      <ExerciseForm initialSlot={editingSlot} mode={exerciseFormMode} onSave={saveExercise} />
    </div>

  {:else}
    <div class="space-y-4">
      <div class="flex items-center justify-between px-1">
        <div class="min-w-0 flex-1">
          <input
            bind:value={workout.notes}
            class="w-full bg-transparent text-title text-content outline-none border-b border-transparent focus:border-primary/30 pb-1 transition-colors"
            placeholder="Session Name"
          />
          <textarea
            bind:value={workout.description}
            class="w-full bg-transparent text-body text-content-muted outline-none border-b border-transparent focus:border-primary/30 pb-1 mt-1 transition-colors resize-none overflow-hidden placeholder:text-content-subtle"
            placeholder="Add session notes or goals here..."
            rows="1"
            oninput={(e) => { e.currentTarget.style.height = 'auto'; e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px'; }}
          ></textarea>
          <div class="flex items-center gap-2 mt-1">
            <span class="text-label text-primary">
              {workout.status === 'planned' ? 'Planning' : 'Active Session'}
            </span>
            {#if workout.date}
              <span class="w-1 h-1 bg-surface-elevated-hover rounded-full"></span>
              <span class="text-caption text-content-subtle">
                {new Date(workout.date).toLocaleDateString()}
              </span>
            {/if}
          </div>
        </div>
        <button onclick={handleCancel} class="p-2 text-content-subtle hover:text-content transition-colors" aria-label="Cancel">
          <Icon icon="ic:baseline-close" class="text-xl" />
        </button>
      </div>

      <div class="space-y-3.5">
        <div class="flex items-center gap-4 px-1">
          <div class="space-y-1.5">
            <span class="text-label text-content-subtle ml-1 block">Start Time</span>
            <input
              type="time"
              bind:value={workout.startTime}
              class="px-3 py-1.5 bg-surface-elevated text-content rounded-control border border-border-strong text-sm outline-none w-full"
            />
          </div>
        </div>

        <div class="space-y-1.5 px-1">
          <span class="text-label text-content-subtle ml-1 block">Day of Week</span>
          <div class="flex flex-wrap gap-1.5">
            {#each days as day}
              <button
                onclick={() => workout!.dayOfWeek = day}
                class="px-2.5 py-1.5 rounded-control text-label transition-all border
                  {workout.dayOfWeek === day
                    ? 'bg-primary border-primary text-white shadow-lg'
                    : 'bg-surface-elevated/50 border-border-strong text-content-subtle hover:text-content-muted'}"
              >
                {day.slice(0, 3)}
              </button>
            {/each}
            <button
              onclick={() => workout!.dayOfWeek = undefined}
              class="px-2.5 py-1.5 rounded-control text-label transition-all border
                {!workout.dayOfWeek
                  ? 'bg-surface-elevated-hover border-border-strong text-content shadow-lg'
                  : 'bg-surface-elevated/50 border-border-strong text-content-subtle hover:text-content-muted'}"
            >
              None
            </button>
          </div>
        </div>

        <div class="flex items-center justify-between px-1">
          <h3 class="text-section uppercase text-content-subtle">Exercises</h3>
          <div class="flex items-center gap-1.5">
            <button
              onclick={() => isImportingAILog = true}
              class="bg-surface-elevated hover:bg-surface-elevated-hover text-content p-1.5 rounded-control transition-colors shadow-lg shadow-black/20"
              aria-label="Paste AI Workout Log"
              title="Paste AI Workout Log"
            >
              <Icon icon="ic:baseline-auto-awesome" class="text-lg" />
            </button>
            <button
              onclick={handleAddExercise}
              class="bg-surface-elevated hover:bg-surface-elevated-hover text-content p-1.5 rounded-control transition-colors shadow-lg shadow-black/20"
              aria-label="Add Exercise"
            >
              <Icon icon="ic:baseline-plus" class="text-lg" />
            </button>
          </div>
        </div>

        <section
          class="space-y-2.5 outline-none min-h-[50px]"
          use:dndzone={{items: workout.exercises, dropTargetStyle: {}}}
          onconsider={handleDndConsider}
          onfinalize={handleDndFinalize}
        >
          {#each workout.exercises as exercise (exercise.id)}
            <div animate:flip={{duration: 200}} class="p-3 bg-surface/50 border border-border rounded-card flex justify-between items-center group/item hover:border-border-strong transition-all">
              <div class="flex flex-col items-center justify-center mr-3 opacity-40 group-hover/item:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
                <Icon icon="ic:baseline-drag-indicator" class="text-xl text-content-subtle hover:text-content" />
              </div>

              <div class="flex-1 min-w-0">
                <p class="text-body font-bold text-content truncate">{slotTypeName(exercise, trainingState.exerciseTypes)}</p>
                {#if slotValues(exercise).duration}
                  <p class="text-caption text-content-subtle">{slotValues(exercise).duration} mins</p>
                {/if}
              </div>

              <div class="flex items-center gap-1">
                <button
                  onclick={() => handleEditExercise(exercise)}
                  class="p-2 text-content-subtle hover:text-primary transition-colors"
                  aria-label="Edit Details"
                >
                  <Icon icon="ic:baseline-edit" class="text-sm" />
                </button>
                <button
                  onclick={() => removeExercise(exercise.id)}
                  class="p-2 text-content-subtle hover:text-danger transition-colors"
                  aria-label="Remove"
                >
                  <Icon icon="ic:baseline-delete" class="text-sm" />
                </button>
              </div>
            </div>
          {/each}
          {#if workout.exercises.length === 0}
            <div class="py-10 border-2 border-dashed border-border rounded-card text-center bg-surface/10">
              <p class="text-caption text-content-subtle italic">No exercises added yet</p>
            </div>
          {/if}
        </section>
      </div>

      <div class="grid grid-cols-1 gap-3 pt-4">
        <button
          onclick={handleComplete}
          disabled={workout.exercises.length === 0}
          class="w-full bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold py-4 rounded-control shadow-xl shadow-primary/20 transition-all active:scale-[0.98]"
        >
          {workout.status === 'completed' ? 'Save Changes' : 'Finish & Rate Session'}
        </button>

        {#if workout.status === 'planned'}
          <button
            onclick={handleSaveToPlan}
            class="w-full bg-surface-elevated/50 hover:bg-surface-elevated text-content-muted hover:text-content text-sm font-bold py-3.5 rounded-control border border-border-strong/50 transition-all"
          >
            Update Plan
          </button>
        {/if}
      </div>
    </div>

    <TimerWidget currentSlot={editingSlot} />
  {/if}
</div>

{#if isImportingAILog}
  <AIImportModal
    mode="workoutLog"
    bucket={exerciseFormMode}
    onImportWorkoutLog={handleImportAILog}
    onClose={() => isImportingAILog = false}
  />
{/if}
