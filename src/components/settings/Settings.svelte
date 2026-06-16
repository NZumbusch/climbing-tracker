<script lang="ts">
  import { trainingState } from '../../lib/state.svelte';
  import { onMount } from 'svelte';
  import { storage } from '../../lib/storage';
  import { generateId, showAlert, showConfirm } from '../../lib/utils';
  import type { Exercise, ExerciseTypeDef, ExerciseCategory, ParameterBlock, PhaseType, Workout, BenchmarkTypeDef } from '../../lib/types';
  import ExerciseForm from '../workout/ExerciseForm.svelte';
  import Icon from "@iconify/svelte";

  // --- Props ---
  let {
    onExport,
    onImport
  } = $props<{
    onExport: () => void,
    onImport: (e: Event) => void
  }>();

  // --- State: Templates ---
  let templates = $state<Record<PhaseType, Partial<Workout>[]> | null>(null);
  let selectedPhase = $state<PhaseType | null>(null);
  let editingWorkoutIndex = $state<number | null>(null);
  let isAddingExercise = $state(false);

  // --- State: Modalities ---
  let exerciseTypes = $state<ExerciseTypeDef[]>([]);
  let editingType = $state<ExerciseTypeDef | null>(null);
  let isAddingType = $state(false);

  // --- State: Benchmarks ---
  let benchmarkTypes = $state<BenchmarkTypeDef[]>([]);
  let editingBenchmarkType = $state<BenchmarkTypeDef | null>(null);
  let isAddingBenchmark = $state(false);

  // --- Constants ---
  const categories: ExerciseCategory[] = ['Technique Bouldering', 'Power Bouldering', 'Fingers', 'Arms', 'Legs', 'Core', 'Other'];
  const parameterBlocks: { id: ParameterBlock, label: string }[] = [
    { id: 'duration', label: 'Duration' },
    { id: 'grades', label: 'Grades' },
    { id: 'cadence', label: 'Cadence' },
    { id: 'climbingStyle', label: 'Climbing Style' },
    { id: 'boardType', label: 'Board Type' },
    { id: 'boardAngle', label: 'Board Angle' },
    { id: 'variant', label: 'Variant' },
    { id: 'sets', label: 'Sets' },
    { id: 'reps', label: 'Reps' },
    { id: 'holdType', label: 'Hold Type' },
    { id: 'timeOn', label: 'Time On' },
    { id: 'timeOff', label: 'Time Off' },
    { id: 'restTime', label: 'Rest Time' },
    { id: 'holdSize', label: 'Hold Size' },
    { id: 'weight', label: 'Weight' },
    { id: 'distance', label: 'Distance' },
    { id: 'campusStyle', label: 'Campus Style' },
    { id: 'difficulty', label: 'Difficulty/RPE' }
  ];

  const phases: PhaseType[] = ['Work Capacity', 'Max Strength', 'Power', 'Power Endurance', 'Performance / Taper', 'Deload'];



  // --- Lifecycle ---
  onMount(async () => {
    templates = await storage.getTemplates();
    exerciseTypes = await storage.getExerciseTypes();
    benchmarkTypes = await storage.getBenchmarkTypes();
  });

  // --- Global Actions ---
  async function saveAll() {
    try {
      if (templates) await storage.saveTemplates($state.snapshot(templates));
      await storage.saveExerciseTypes($state.snapshot(exerciseTypes));
      await storage.saveBenchmarkTypes($state.snapshot(benchmarkTypes));
      await trainingState.refresh();
      await showAlert('Settings', 'Settings saved successfully!');
    } catch (err) {
      await showAlert('Settings Error', err instanceof Error ? err.message : 'Failed to save settings.');
    }
  }

  async function resetTemplates() {
    const confirmed = await showConfirm('Reset Templates', 'Reset all templates to default? This will overwrite your customizations.');
    if (!confirmed) return;
    await trainingState.resetTemplates();
    templates = await storage.getTemplates();
  }

  // --- Template Management ---
  function addWorkoutToPhase() {
    if (!selectedPhase || !templates) return;
    const newWorkout: Partial<Workout> = { notes: 'New Default Workout', exercises: [] };
    templates[selectedPhase] = [...templates[selectedPhase], newWorkout];
  }

  function removeWorkoutFromPhase(index: number) {
    if (!selectedPhase || !templates) return;
    templates[selectedPhase] = templates[selectedPhase].filter((_, i: number) => i !== index);
  }

  function addExerciseToTemplate(data: Omit<Exercise, 'id'>) {
    if (!selectedPhase || !templates || editingWorkoutIndex === null) return;
    const newExercise = { ...data, id: generateId() };
    const workout = templates[selectedPhase][editingWorkoutIndex];
    workout.exercises = [...(workout.exercises || []), newExercise];
    isAddingExercise = false;
    editingWorkoutIndex = null;
  }

  function removeExerciseFromTemplate(workoutIndex: number, exerciseId: string) {
    if (!selectedPhase || !templates) return;
    const workout = templates[selectedPhase][workoutIndex];
    if (workout.exercises) {
      workout.exercises = workout.exercises.filter((e: any) => e.id !== exerciseId);
    }
  }

  // --- Modality Management ---
  function startAddType() {
    editingType = {
      id: generateId(),
      name: 'New Modality',
      category: 'Other',
      parameters: ['duration']
    };
    isAddingType = true;
  }

  function saveType() {
    if (!editingType) return;
    
    const name = editingType.name.trim();
    if (!name) {
      showAlert('Input Error', 'Modality name cannot be empty.');
      return;
    }

    const isDuplicate = exerciseTypes.some(t => 
      t.id !== editingType?.id && 
      t.name.toLowerCase() === name.toLowerCase()
    );

    if (isDuplicate) {
      showAlert('Input Error', 'A modality with this name already exists.');
      return;
    }

    const index = exerciseTypes.findIndex(t => t.id === editingType?.id);
    if (index !== -1) {
      exerciseTypes[index] = { ...editingType, name };
    } else {
      exerciseTypes.push({ ...editingType, name });
    }
    isAddingType = false;
    editingType = null;
  }

  async function deleteType(id: string) {
    const confirmed = await showConfirm('Delete Modality', 'Delete this modality? Historical analytics may be affected.');
    if (!confirmed) return;
    exerciseTypes = exerciseTypes.filter(t => t.id !== id);
  }

  function toggleParam(param: ParameterBlock) {
    if (!editingType) return;
    if (editingType.parameters.includes(param)) {
      editingType.parameters = editingType.parameters.filter(p => p !== param);
    } else {
      editingType.parameters = [...editingType.parameters, param];
    }
  }

  // --- Benchmark Management ---
  function startAddBenchmark() {
    editingBenchmarkType = {
      id: generateId(),
      name: 'New Benchmark',
      unit: 'kg'
    };
    isAddingBenchmark = true;
  }

  function saveBenchmarkType() {
    if (!editingBenchmarkType) return;
    
    const name = editingBenchmarkType.name.trim();
    if (!name) {
      showAlert('Input Error', 'Benchmark name cannot be empty.');
      return;
    }

    const isDuplicate = benchmarkTypes.some(t => 
      t.id !== editingBenchmarkType?.id && 
      t.name.toLowerCase() === name.toLowerCase()
    );

    if (isDuplicate) {
      showAlert('Input Error', 'A benchmark with this name already exists.');
      return;
    }

    const index = benchmarkTypes.findIndex(t => t.id === editingBenchmarkType?.id);
    if (index !== -1) {
      benchmarkTypes[index] = { ...editingBenchmarkType, name };
    } else {
      benchmarkTypes.push({ ...editingBenchmarkType, name });
    }
    isAddingBenchmark = false;
    editingBenchmarkType = null;
  }

  async function deleteBenchmarkType(id: string) {
    const confirmed = await showConfirm('Delete Benchmark Type', 'Delete this benchmark type? Historical progress data will remain but the type will be unlinked.');
    if (!confirmed) return;
    benchmarkTypes = benchmarkTypes.filter(t => t.id !== id);
  }
</script>

<div class="w-full max-w-lg space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-24">
  <div class="flex items-center justify-between px-1">
    <div class="flex items-center gap-4">
      <button onclick={() => trainingState.navigate('history')} class="p-2 bg-zinc-800/50 rounded-xl border border-zinc-700/50 text-zinc-400 hover:text-white transition-colors"><Icon icon="ic:baseline-arrow-back" class="text-xl" /></button>
      <h2 class="text-xl font-bold text-white tracking-tight">Settings</h2>
    </div>
    <button onclick={saveAll} class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg active:scale-95">Save All</button>
  </div>

  <div class="space-y-6">
    <div class="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 space-y-6 backdrop-blur-sm shadow-xl">
      <div class="space-y-2">
        <h3 class="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">Exercise Modalities</h3>
        <p class="text-[10px] text-zinc-500 px-1 leading-relaxed">Define custom exercise types and their tracking parameters.</p>
      </div>

      {#if isAddingType && editingType}
        <div class="p-5 bg-zinc-800/50 border border-blue-500/30 rounded-2xl space-y-4 animate-in zoom-in-95 shadow-inner">
          <div class="space-y-3">
            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-1"><label for="edit-name" class="text-[8px] font-black text-zinc-500 uppercase tracking-widest ml-1">Modality Name</label><input id="edit-name" bind:value={editingType.name} class="w-full bg-zinc-900 text-white p-3 rounded-xl border border-zinc-700 focus:ring-1 focus:ring-blue-500 outline-none text-sm" placeholder="e.g., Hangboard" /></div>
              <div class="space-y-1"><label for="edit-load" class="text-[8px] font-black text-zinc-500 uppercase tracking-widest ml-1">Default Load (1-10)</label><input id="edit-load" type="number" min="1" max="10" bind:value={editingType.defaultPlannedLoad} class="w-full bg-zinc-900 text-white p-3 rounded-xl border border-zinc-700 focus:ring-1 focus:ring-blue-500 outline-none text-sm" /></div>
            </div>

            <div class="space-y-1"><label for="edit-cat" class="text-[8px] font-black text-zinc-500 uppercase tracking-widest ml-1">Analytics Category</label><select id="edit-cat" bind:value={editingType.category} class="w-full bg-zinc-900 text-white p-3 rounded-xl border border-zinc-700 outline-none text-sm appearance-none">{#each categories as cat} <option value={cat}>{cat}</option> {/each}</select></div>
            <div class="space-y-2"><span class="text-[8px] font-black text-zinc-500 uppercase tracking-widest ml-1 block">Active Parameters</span><div class="grid grid-cols-2 gap-2">{#each parameterBlocks as block}<button onclick={() => toggleParam(block.id)} class="px-3 py-2 rounded-lg text-[9px] font-bold border transition-all flex items-center gap-2 {editingType.parameters.includes(block.id) ? 'bg-blue-500/10 border-blue-500/50 text-blue-400' : 'bg-zinc-900 border-zinc-800 text-zinc-500'}"><Icon icon={editingType.parameters.includes(block.id) ? 'ic:baseline-check-box' : 'ic:baseline-check-box-outline-blank'} class="text-sm" />{block.label}</button>{/each}</div></div>
          </div>
          <div class="flex gap-2 pt-2"><button onclick={saveType} class="flex-1 py-3 bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl">Save</button><button onclick={() => { isAddingType = false; editingType = null; }} class="px-5 py-3 bg-zinc-800 text-zinc-400 text-[10px] font-black uppercase tracking-widest rounded-xl">Cancel</button></div>
        </div>
      {:else}
        <div class="space-y-2">
          {#each exerciseTypes as type}
            <div class="flex items-center justify-between p-3.5 bg-zinc-800/30 border border-zinc-700/50 rounded-2xl group transition-all hover:bg-zinc-800/50">
              <div><p class="text-sm font-bold text-white">{type.name}</p><p class="text-[9px] text-zinc-500 uppercase tracking-tighter">{type.category}</p></div>
              <div class="flex items-center gap-1">
                <button onclick={() => { editingType = { ...type }; isAddingType = true; }} class="p-2 text-zinc-500 hover:text-white transition-colors" aria-label="Edit Modality"><Icon icon="ic:baseline-edit" /></button>
                <button onclick={() => deleteType(type.id)} class="p-2 text-zinc-500 hover:text-red-500 transition-colors" aria-label="Delete Modality"><Icon icon="ic:baseline-delete" /></button>
              </div>
            </div>
          {/each}
          <button onclick={startAddType} class="w-full py-3.5 border-2 border-dashed border-zinc-800 hover:border-zinc-700 rounded-2xl flex items-center justify-center gap-2 text-zinc-500 hover:text-zinc-400 transition-all"><Icon icon="ic:baseline-plus" /><span class="text-[10px] font-black uppercase tracking-widest">Add New Modality</span></button>
        </div>
      {/if}
    </div>

    <div class="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 space-y-6 backdrop-blur-sm shadow-xl">
      <div class="space-y-2">
        <h3 class="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">Benchmark Types</h3>
        <p class="text-[10px] text-zinc-500 px-1 leading-relaxed">Customize performance tests and their units.</p>
      </div>

      {#if isAddingBenchmark && editingBenchmarkType}
        <div class="p-5 bg-zinc-800/50 border border-emerald-500/30 rounded-2xl space-y-4 animate-in zoom-in-95 shadow-inner">
          <div class="space-y-3">
            <div class="space-y-1"><label for="bench-name" class="text-[8px] font-black text-zinc-500 uppercase tracking-widest ml-1">Test Name</label><input id="bench-name" bind:value={editingBenchmarkType.name} class="w-full bg-zinc-900 text-white p-3 rounded-xl border border-zinc-700 focus:ring-1 focus:ring-emerald-500 outline-none text-sm" placeholder="e.g., 20mm Max Hang" /></div>
            <div class="space-y-1"><label for="bench-unit" class="text-[8px] font-black text-zinc-500 uppercase tracking-widest ml-1">Result Unit</label><input id="bench-unit" bind:value={editingBenchmarkType.unit} class="w-full bg-zinc-900 text-white p-3 rounded-xl border border-zinc-700 focus:ring-1 focus:ring-emerald-500 outline-none text-sm" placeholder="e.g., kg, reps, s" /></div>
          </div>
          <div class="flex gap-2 pt-2"><button onclick={saveBenchmarkType} class="flex-1 py-3 bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl">Save</button><button onclick={() => { isAddingBenchmark = false; editingBenchmarkType = null; }} class="px-5 py-3 bg-zinc-800 text-zinc-400 text-[10px] font-black uppercase tracking-widest rounded-xl">Cancel</button></div>
        </div>
      {:else}
        <div class="space-y-2">
          {#each benchmarkTypes as type}
            <div class="flex items-center justify-between p-3.5 bg-zinc-800/30 border border-zinc-700/50 rounded-2xl group transition-all hover:bg-zinc-800/50">
              <div><p class="text-sm font-bold text-white">{type.name}</p><p class="text-[9px] text-zinc-500 uppercase tracking-tighter">Unit: {type.unit}</p></div>
              <div class="flex items-center gap-1">
                <button onclick={() => { editingBenchmarkType = { ...type }; isAddingBenchmark = true; }} class="p-2 text-zinc-500 hover:text-white transition-colors" aria-label="Edit Benchmark"><Icon icon="ic:baseline-edit" /></button>
                <button onclick={() => deleteBenchmarkType(type.id)} class="p-2 text-zinc-500 hover:text-red-500 transition-colors" aria-label="Delete Benchmark"><Icon icon="ic:baseline-delete" /></button>
              </div>
            </div>
          {/each}
          <button onclick={startAddBenchmark} class="w-full py-3.5 border-2 border-dashed border-zinc-800 hover:border-zinc-700 rounded-2xl flex items-center justify-center gap-2 text-zinc-500 hover:text-zinc-400 transition-all"><Icon icon="ic:baseline-plus" /><span class="text-[10px] font-black uppercase tracking-widest">Add Benchmark Type</span></button>
        </div>
      {/if}
    </div>

    <div class="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 space-y-6 backdrop-blur-sm shadow-xl">
      <div class="space-y-2"><h3 class="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">Training Templates</h3><p class="text-[10px] text-zinc-500 px-1 leading-relaxed">Customize default sessions for each periodization phase.</p></div>
      <div class="space-y-4">
        <div class="flex flex-wrap gap-2">{#each phases as phase}<button onclick={() => { selectedPhase = phase; editingWorkoutIndex = null; isAddingExercise = false; }} class="px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border {selectedPhase === phase ? 'bg-blue-600 border-blue-500 text-white shadow-lg' : 'bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:text-zinc-200'}">{phase}</button>{/each}</div>
        {#if selectedPhase && templates}
          <div class="space-y-4 pt-2 animate-in fade-in">
            <div class="flex items-center justify-between px-1"><h4 class="text-[11px] font-black text-blue-500 uppercase tracking-[0.2em]">{selectedPhase} Plan</h4><button onclick={addWorkoutToPhase} class="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"><Icon icon="ic:baseline-plus" class="text-sm" /></button></div>
            <div class="space-y-3">
              {#each templates[selectedPhase] as workout, wIndex}
                <div class="p-5 bg-zinc-800/30 border border-zinc-700/50 rounded-2xl space-y-4 shadow-inner">
                  <div class="flex items-center justify-between gap-4"><input bind:value={workout.notes} class="flex-1 bg-transparent text-sm font-bold text-white border-b border-transparent focus:border-blue-500/30 outline-none pb-1" placeholder="Session Name" /><button onclick={() => removeWorkoutFromPhase(wIndex)} class="text-zinc-600 hover:text-red-500 transition-colors"><Icon icon="ic:baseline-delete" class="text-sm" /></button></div>
                  <div class="space-y-2">
                    {#each workout.exercises || [] as exercise}
                      <div class="flex items-center justify-between p-2.5 bg-zinc-900/50 rounded-xl border border-zinc-800 transition-all hover:border-zinc-700"><span class="text-[10px] font-medium text-zinc-300">{exercise.type}</span><button onclick={() => removeExerciseFromTemplate(wIndex, exercise.id)} class="text-zinc-600 hover:text-red-500"><Icon icon="ic:baseline-close" class="text-xs" /></button></div>
                    {/each}
                    {#if editingWorkoutIndex === wIndex && isAddingExercise}
                      <div class="mt-4 p-4 bg-zinc-900/80 rounded-2xl border border-zinc-700 animate-in zoom-in-95"><ExerciseForm onSave={addExerciseToTemplate} /><button onclick={() => { isAddingExercise = false; editingWorkoutIndex = null; }} class="w-full mt-3 py-2 text-[9px] font-black text-zinc-500 uppercase tracking-widest hover:text-white">Cancel</button></div>
                    {:else}
                      <button onclick={() => { editingWorkoutIndex = wIndex; isAddingExercise = true; }} class="w-full py-2.5 border border-dashed border-zinc-700 rounded-xl text-[9px] font-black text-zinc-500 uppercase tracking-widest hover:border-zinc-500 hover:text-zinc-300 transition-all">Add Component</button>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
        <button onclick={resetTemplates} class="w-full py-3 text-[9px] font-black text-zinc-600 hover:text-red-400 uppercase tracking-widest transition-colors">Reset to Default Library</button>
      </div>
    </div>

    <div class="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 space-y-6 backdrop-blur-sm shadow-xl">
      <div class="space-y-2"><h3 class="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">Backups</h3><p class="text-[10px] text-zinc-500 px-1">Ensure your data is safe by exporting a local backup.</p></div>
      <div class="grid grid-cols-1 gap-3">
        <button onclick={onExport} class="flex items-center justify-between p-4 bg-zinc-800/50 hover:bg-zinc-800 rounded-2xl border border-zinc-700/50 transition-all group"><div class="flex items-center gap-3"><div class="p-2.5 bg-blue-500/10 rounded-xl text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-colors"><Icon icon="ic:baseline-download" class="text-xl" /></div><div class="text-left"><p class="text-sm font-bold text-white">Export</p><p class="text-[9px] text-zinc-500 uppercase">Save to local JSON</p></div></div><Icon icon="ic:baseline-chevron-right" class="text-zinc-600 text-xl" /></button>
        <label class="flex items-center justify-between p-4 bg-zinc-800/50 hover:bg-zinc-800 rounded-2xl border border-zinc-700/50 transition-all group cursor-pointer"><input type="file" accept=".json" class="hidden" onchange={onImport} /><div class="flex items-center gap-3"><div class="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-500 group-hover:bg-emerald-500 group-hover:text-white transition-colors"><Icon icon="ic:baseline-upload" class="text-xl" /></div><div class="text-left"><p class="text-sm font-bold text-white">Import</p><p class="text-[9px] text-zinc-500 uppercase">Restore from backup</p></div></div><Icon icon="ic:baseline-chevron-right" class="text-zinc-600 text-xl" /></label>
      </div>
    </div>
  </div>
</div>
