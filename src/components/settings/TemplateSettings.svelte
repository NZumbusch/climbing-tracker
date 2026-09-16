<script lang="ts">
  import { trainingState } from '../../lib/state.svelte';
  import { generateId, showAlert, showConfirm } from '../../lib/utils';
  import { DEFAULT_TEMPLATE_LIBRARY } from '../../lib/constants';
  import { slotTypeName } from '../../lib/exerciseSlot';
  import type { ExerciseSlot, ExerciseValues, ParameterBlock, PhaseDef, WorkoutTemplate, DayOfWeek } from '../../lib/types';
  import ExerciseForm from '../workout/ExerciseForm.svelte';
  import Icon from "@iconify/svelte";
  import { dndzone, type DndEvent } from 'svelte-dnd-action';
  import { flip } from 'svelte/animate';

  let {
    templates = $bindable(),
    phaseDefs,
    onReset,
  }: {
    templates: Record<string, WorkoutTemplate[]>;
    phaseDefs: PhaseDef[];
    onReset: () => void | Promise<void>;
  } = $props();

  const selectablePhases = $derived(
    [...phaseDefs].filter((p) => !p.archived).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
  );

  const days: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  let selectedPhaseId = $state<string | null>(null);
  let editingWorkoutIndex = $state<number | null>(null);
  let isAddingExercise = $state(false);
  let editingExerciseId = $state<string | null>(null);

  // --- Template Management ---
  function addWorkoutToPhase() {
    if (!selectedPhaseId) return;
    if (!templates[selectedPhaseId]) templates[selectedPhaseId] = [];
    const newWorkout: WorkoutTemplate = { id: generateId(), name: 'New Default Workout', exercises: [] };
    templates[selectedPhaseId] = [...templates[selectedPhaseId], newWorkout];
  }

  function removeWorkoutFromPhase(index: number) {
    if (!selectedPhaseId) return;
    templates[selectedPhaseId] = templates[selectedPhaseId].filter((_, i: number) => i !== index);
  }

  function saveExerciseToTemplate(data: { typeId: string; categoryId?: string; activeParameters: ParameterBlock[]; values: ExerciseValues }) {
    if (!selectedPhaseId || editingWorkoutIndex === null) return;
    const workout = templates[selectedPhaseId][editingWorkoutIndex];
    // Templates are pure plans - `logged` is always undefined for them.
    if (editingExerciseId) {
      const index = workout.exercises.findIndex((e) => e.id === editingExerciseId);
      if (index !== -1) {
        workout.exercises[index] = {
          id: editingExerciseId,
          typeId: data.typeId,
          categoryId: data.categoryId,
          activeParameters: data.activeParameters,
          prescribed: data.values
        };
      }
    } else {
      const newExercise: ExerciseSlot = {
        id: generateId(),
        typeId: data.typeId,
        categoryId: data.categoryId,
        activeParameters: data.activeParameters,
        prescribed: data.values
      };
      workout.exercises = [...(workout.exercises || []), newExercise];
    }
    isAddingExercise = false;
    editingExerciseId = null;
  }

  function duplicateWorkoutInPhase(index: number) {
    if (!selectedPhaseId) return;
    const original = templates[selectedPhaseId][index];
    const duplicated: WorkoutTemplate = {
      ...$state.snapshot(original),
      id: generateId(),
      exercises: original.exercises?.map(e => ({ ...e, id: generateId() })) || []
    };
    templates[selectedPhaseId] = [...templates[selectedPhaseId], duplicated];
  }

  function duplicateExerciseInTemplate(workoutIndex: number, exercise: ExerciseSlot) {
    if (!selectedPhaseId) return;
    const workout = templates[selectedPhaseId][workoutIndex];
    const duplicated = { ...$state.snapshot(exercise), id: generateId() };
    workout.exercises = [...(workout.exercises || []), duplicated];
  }

  function handleTemplateDndConsider(workoutIndex: number, e: CustomEvent<DndEvent<ExerciseSlot>>) {
    if (!selectedPhaseId) return;
    templates[selectedPhaseId][workoutIndex].exercises = e.detail.items;
  }

  function handleTemplateDndFinalize(workoutIndex: number, e: CustomEvent<DndEvent<ExerciseSlot>>) {
    if (!selectedPhaseId) return;
    templates[selectedPhaseId][workoutIndex].exercises = e.detail.items;
  }

  function editExerciseInTemplate(workoutIndex: number, exercise: ExerciseSlot) {
    editingWorkoutIndex = workoutIndex;
    editingExerciseId = exercise.id;
    isAddingExercise = true;
  }

  function removeExerciseFromTemplate(workoutIndex: number, exerciseId: string) {
    if (!selectedPhaseId) return;
    const workout = templates[selectedPhaseId][workoutIndex];
    if (workout.exercises) {
      workout.exercises = workout.exercises.filter((e) => e.id !== exerciseId);
    }
  }

  // --- Starter Library ---
  async function loadStarterSet(setId: string) {
    const set = DEFAULT_TEMPLATE_LIBRARY.find(s => s.id === setId);
    if (!set) return;
    const confirmed = await showConfirm(
      'Load Starter Set',
      `Load "${set.name}"? This will overwrite your current templates for any phase included in this set.`
    );
    if (!confirmed) return;
    templates = { ...templates, ...JSON.parse(JSON.stringify(set.templates)) };
    showAlert('Starter Set Loaded', `"${set.name}" has been loaded. Review and Save All to keep it.`);
  }
</script>

<div class="bg-surface/50 border border-border rounded-3xl p-6 space-y-6 backdrop-blur-sm shadow-xl">
  <div class="space-y-2"><h3 class="text-xs font-bold text-content-muted uppercase tracking-widest px-1">Training Templates</h3><p class="text-[10px] text-content-subtle px-1 leading-relaxed">Configure default training templates for macrocycle phases.</p></div>
  <div class="space-y-4">
    <div class="flex flex-wrap gap-2">{#each selectablePhases as phase}<button onclick={() => { selectedPhaseId = phase.id; editingWorkoutIndex = null; isAddingExercise = false; }} class="px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border {selectedPhaseId === phase.id ? 'bg-primary border-primary text-white shadow-lg' : 'bg-surface-elevated/50 border-border-strong text-content-muted hover:text-content'}">{phase.name}</button>{/each}</div>
    {#if selectedPhaseId}
      {@const phaseWorkouts = templates[selectedPhaseId] || []}
      {@const phaseName = selectablePhases.find(p => p.id === selectedPhaseId)?.name}
      <div class="space-y-4 pt-2 animate-in fade-in">
        <div class="flex items-center justify-between px-1"><h4 class="text-[11px] font-black text-primary uppercase tracking-[0.2em]">{phaseName} Plan</h4><button onclick={addWorkoutToPhase} class="p-1.5 bg-surface-elevated hover:bg-surface-elevated-hover text-content rounded-lg transition-colors"><Icon icon="ic:baseline-plus" class="text-sm" /></button></div>
        <div class="space-y-3">
          {#each phaseWorkouts as workout, wIndex}
            <div class="p-5 bg-surface-elevated/30 border border-border-strong/50 rounded-2xl space-y-4 shadow-inner relative">
              <div class="flex items-center justify-between gap-4">
                <div class="min-w-0 flex-1">
                  <input bind:value={workout.name} class="w-full bg-transparent text-sm font-bold text-content border-b border-transparent focus:border-primary/30 outline-none pb-1 truncate" placeholder="Session Name" />
                </div>
                <div class="flex items-center gap-0.5 flex-shrink-0">
                  <button onclick={() => {
                    if (selectedPhaseId && wIndex > 0) {
                      const temp = templates[selectedPhaseId][wIndex - 1];
                      templates[selectedPhaseId][wIndex - 1] = workout;
                      templates[selectedPhaseId][wIndex] = temp;
                    }
                  }} disabled={wIndex === 0} class="p-1 text-content-subtle hover:text-content disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="Move Up"><Icon icon="ic:baseline-keyboard-arrow-up" class="text-lg" /></button>
                  <button onclick={() => {
                    if (selectedPhaseId && wIndex < phaseWorkouts.length - 1) {
                      const temp = templates[selectedPhaseId][wIndex + 1];
                      templates[selectedPhaseId][wIndex + 1] = workout;
                      templates[selectedPhaseId][wIndex] = temp;
                    }
                  }} disabled={wIndex === phaseWorkouts.length - 1} class="p-1 text-content-subtle hover:text-content disabled:opacity-30 disabled:cursor-not-allowed transition-colors mr-1" title="Move Down"><Icon icon="ic:baseline-keyboard-arrow-down" class="text-lg" /></button>

                  <button onclick={() => duplicateWorkoutInPhase(wIndex)} class="p-1.5 text-content-subtle hover:text-content transition-colors" title="Duplicate Session"><Icon icon="ic:baseline-content-copy" class="text-sm" /></button>
                  <button onclick={() => removeWorkoutFromPhase(wIndex)} class="p-1.5 text-content-subtle hover:text-danger transition-colors" title="Delete Session"><Icon icon="ic:baseline-delete" class="text-sm" /></button>
                </div>
              </div>
              <div class="flex flex-wrap gap-1 mt-2">
                {#each days as day}
                  <button
                    onclick={() => workout.dayOfWeek = day}
                    class="px-2 py-1 rounded-md text-[8px] font-black uppercase transition-all border
                      {workout.dayOfWeek === day
                        ? 'bg-primary border-primary text-white shadow-lg'
                        : 'bg-surface-elevated/50 border-border-strong text-content-subtle hover:text-content-muted'}"
                  >
                    {day.slice(0, 3)}
                  </button>
                {/each}
                <button
                  onclick={() => workout.dayOfWeek = undefined}
                  class="px-2 py-1 rounded-md text-[8px] font-black uppercase transition-all border
                    {!workout.dayOfWeek
                      ? 'bg-surface-elevated-hover border-border-strong text-content shadow-lg'
                      : 'bg-surface-elevated/50 border-border-strong text-content-subtle hover:text-content-muted'}"
                >
                  None
                </button>
              </div>
              <div class="space-y-2">
                <section
                  class="space-y-2 min-h-[40px] outline-none"
                  use:dndzone={{items: workout.exercises || [], dropTargetStyle: {}}}
                  onconsider={(e) => handleTemplateDndConsider(wIndex, e)}
                  onfinalize={(e) => handleTemplateDndFinalize(wIndex, e)}
                >
                  {#each workout.exercises || [] as exercise, eIndex (exercise.id)}
                    <div animate:flip={{duration: 200}} class="flex items-center justify-between p-2 bg-surface/50 rounded-xl border border-border transition-all hover:border-border-strong group/ex">
                      <div class="flex items-center gap-2">
                        <div class="flex flex-col items-center justify-center gap-0 opacity-40 group-hover/ex:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
                          <Icon icon="ic:baseline-drag-indicator" class="text-[16px]" />
                        </div>
                        <span class="text-[10px] font-medium text-content-muted truncate">{slotTypeName(exercise, trainingState.exerciseTypes)}</span>
                      </div>
                      <div class="flex items-center gap-1 flex-shrink-0">
                        <button onclick={() => duplicateExerciseInTemplate(wIndex, exercise)} class="text-content-subtle hover:text-content transition-colors p-1" title="Duplicate Exercise"><Icon icon="ic:baseline-content-copy" class="text-xs" /></button>
                        <button onclick={() => editExerciseInTemplate(wIndex, exercise)} class="text-content-subtle hover:text-content transition-colors p-1" title="Edit Exercise"><Icon icon="ic:baseline-edit" class="text-xs" /></button>
                        <button onclick={() => removeExerciseFromTemplate(wIndex, exercise.id)} class="text-content-subtle hover:text-danger transition-colors p-1"><Icon icon="ic:baseline-close" class="text-xs" /></button>
                      </div>
                    </div>
                  {/each}
                </section>
                {#if editingWorkoutIndex === wIndex && isAddingExercise}
                  <div class="mt-4 p-4 bg-surface/80 rounded-2xl border border-border-strong animate-in zoom-in-95">
                    <ExerciseForm
                      initialSlot={editingExerciseId ? workout.exercises?.find((e) => e.id === editingExerciseId) : null}
                      mode="prescribed"
                      onSave={saveExerciseToTemplate}
                    />
                    <button onclick={() => { isAddingExercise = false; editingWorkoutIndex = null; editingExerciseId = null; }} class="w-full mt-3 py-2 text-[9px] font-black text-content-subtle uppercase tracking-widest hover:text-content">Cancel</button>
                  </div>
                {:else}
                  <button onclick={() => { editingWorkoutIndex = wIndex; isAddingExercise = true; editingExerciseId = null; }} class="w-full py-2.5 border border-dashed border-border-strong rounded-xl text-[9px] font-black text-content-subtle uppercase tracking-widest hover:border-border-strong hover:text-content-muted transition-all">Add Component</button>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
    <button onclick={onReset} class="w-full py-3 text-[9px] font-black text-content-subtle hover:text-danger uppercase tracking-widest transition-colors">Reset to Default Library</button>
  </div>
</div>

<div class="bg-surface/50 border border-border rounded-3xl p-6 space-y-6 backdrop-blur-sm shadow-xl">
  <div class="space-y-2">
    <h3 class="text-xs font-bold text-content-muted uppercase tracking-widest px-1">Starter Template Library</h3>
    <p class="text-[10px] text-content-subtle px-1 leading-relaxed">Pre-built periodization template sets you can load as a starting point, distinct from your own customized templates above.</p>
  </div>
  <div class="space-y-2">
    {#each DEFAULT_TEMPLATE_LIBRARY as set}
      <div class="flex items-center justify-between p-3.5 bg-surface-elevated/30 border border-border-strong/50 rounded-2xl group transition-all hover:bg-surface-elevated/50">
        <div class="min-w-0 flex-1 pr-3">
          <p class="text-sm font-bold text-content truncate">{set.name}</p>
          {#if set.description}<p class="text-[9px] text-content-subtle mt-0.5 leading-relaxed">{set.description}</p>{/if}
        </div>
        <button onclick={() => loadStarterSet(set.id)} class="px-3 py-1.5 bg-surface-elevated hover:bg-surface-elevated-hover text-content text-[9px] font-black uppercase tracking-widest rounded-lg transition-colors flex-shrink-0">Load</button>
      </div>
    {:else}
      <div class="p-4 bg-surface-elevated/20 rounded-xl border border-dashed border-border text-center"><p class="text-[10px] text-content-subtle italic uppercase tracking-widest">No starter sets available</p></div>
    {/each}
  </div>
</div>
