<script lang="ts">
  import { PARAMETER_LABELS } from '../../lib/constants';
  import { trainingState } from '../../lib/state.svelte';
  import { onMount } from 'svelte';
  import { storage } from '../../lib/storage';
  import { generateId, showAlert, showConfirm } from '../../lib/utils';
  import type { Exercise, ExerciseTypeDef, ExerciseCategory, ParameterBlock, PhaseType, Workout, BenchmarkTypeDef } from '../../lib/types';
  import ExerciseForm from '../workout/ExerciseForm.svelte';
  import PDFExportModal from './PDFExportModal.svelte';
  import Icon from "@iconify/svelte";
  import { dndzone, type DndEvent } from 'svelte-dnd-action';
  import { flip } from 'svelte/animate';

  // --- Props ---
  let {
    onExport,
    onImport
  } = $props<{
    onExport: () => void,
    onImport: (e: Event) => void
  }>();

  import { exportWorkoutsToICS } from '../../lib/ics';

  // --- State: Tabs ---
  type SettingsTab = 'overview' | 'customization' | 'design' | 'integration' | 'about';
  let currentTab = $state<SettingsTab>('overview');
  let showPDFExport = $state(false);

  let fileInput = $state<HTMLInputElement>();
  
  async function handleImportClick() {
    const confirmed = await showConfirm(
      'Import Data',
      'Are you sure you want to import this data? This will overwrite your existing data and cannot be undone.'
    );
    if (confirmed) {
      fileInput?.click();
    }
  }

  // --- State: Templates ---
  let templates = $state<Record<PhaseType, Partial<Workout>[]> | null>(null);
  let selectedPhase = $state<PhaseType | null>(null);
  let editingWorkoutIndex = $state<number | null>(null);
  let isAddingExercise = $state(false);
  let editingExerciseId = $state<string | null>(null);

  // --- State: Modalities ---
  let exerciseTypes = $state<ExerciseTypeDef[]>([]);
  let editingType = $state<ExerciseTypeDef | null>(null);
  let isAddingType = $state(false);

  // --- State: Benchmarks ---
  let benchmarkTypes = $state<BenchmarkTypeDef[]>([]);
  let editingBenchmarkType = $state<BenchmarkTypeDef | null>(null);
  let isAddingBenchmark = $state(false);

  // --- Constants ---
  const predefinedColors = ['bg-success-hover', 'bg-tertiary-hover', 'bg-indigo-500', 'bg-rose-500', 'bg-amber-500', 'bg-sky-500', 'bg-zinc-500', 'bg-warning', 'bg-cyan-500', 'bg-fuchsia-500', 'bg-lime-500', 'bg-teal-500', 'bg-pink-500'];
  let analyticsCategories = $state<import('../../lib/types').AnalyticsCategory[]>([]);
  let editingAnalyticsCategory = $state<import('../../lib/types').AnalyticsCategory | null>(null);
  let isAddingAnalyticsCategory = $state(false);

  const parameterBlocks = Object.entries(PARAMETER_LABELS).map(([id, label]) => ({ id: id as ParameterBlock, label }));

  const phases: PhaseType[] = ['Work Capacity', 'Max Strength', 'Power', 'Power Endurance', 'Performance / Taper', 'Deload'];
  const days: import('../../lib/types').DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  // --- Computed Missing Categories ---
  let missingCategories = $derived.by(() => {
    const existingCats = new Set(analyticsCategories.map((c) => c.name));
    const missing = new Set<string>();
    
    trainingState.exerciseTypes.forEach(t => {
      if (t.category && !existingCats.has(t.category)) missing.add(t.category);
    });

    trainingState.workouts.forEach(w => {
      w.exercises?.forEach(e => {
        const cat = e.category || trainingState.exerciseTypes.find(t => t.name === e.type)?.category;
        if (cat && !existingCats.has(cat)) missing.add(cat);
      });
    });

    if (templates) {
      Object.values(templates).forEach(phase => {
        phase?.forEach(t => {
          t.exercises?.forEach(e => {
            const cat = e.category || trainingState.exerciseTypes.find(type => type.name === e.type)?.category;
            if (cat && !existingCats.has(cat)) missing.add(cat);
          });
        });
      });
    }

    return Array.from(missing);
  });

  // --- Lifecycle ---
  onMount(async () => {
    templates = await storage.getTemplates();
    exerciseTypes = await storage.getExerciseTypes();
    benchmarkTypes = await storage.getBenchmarkTypes();
    analyticsCategories = await storage.getAnalyticsCategories();
  });

  // --- Global Actions ---
  async function saveAll() {
    try {
      if (templates) await storage.saveTemplates($state.snapshot(templates));
      await storage.saveExerciseTypes($state.snapshot(exerciseTypes));
      await storage.saveBenchmarkTypes($state.snapshot(benchmarkTypes));
      await storage.saveAnalyticsCategories($state.snapshot(analyticsCategories));
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

  function saveExerciseToTemplate(data: Omit<Exercise, 'id'>) {
    if (!selectedPhase || !templates || editingWorkoutIndex === null) return;
    const workout = templates[selectedPhase][editingWorkoutIndex];
    if (editingExerciseId) {
      const index = workout.exercises!.findIndex((e: any) => e.id === editingExerciseId);
      if (index !== -1) {
        workout.exercises![index] = { ...data, id: editingExerciseId };
      }
    } else {
      const newExercise = { ...data, id: generateId() };
      workout.exercises = [...(workout.exercises || []), newExercise];
    }
    isAddingExercise = false;
    editingExerciseId = null;
  }



  function duplicateWorkoutInPhase(index: number) {
    if (!selectedPhase || !templates) return;
    const original = templates[selectedPhase][index];
    const duplicated: Partial<Workout> = {
      ...$state.snapshot(original),
      exercises: original.exercises?.map(e => ({ ...e, id: generateId() })) || []
    };
    templates[selectedPhase] = [...templates[selectedPhase], duplicated];
  }

  function duplicateExerciseInTemplate(workoutIndex: number, exercise: Exercise) {
    if (!selectedPhase || !templates) return;
    const workout = templates[selectedPhase][workoutIndex];
    const duplicated = { ...$state.snapshot(exercise), id: generateId() };
    workout.exercises = [...(workout.exercises || []), duplicated];
  }

  function handleTemplateDndConsider(workoutIndex: number, e: CustomEvent<DndEvent<Exercise>>) {
    if (!selectedPhase || !templates) return;
    templates[selectedPhase][workoutIndex].exercises = e.detail.items;
  }

  function handleTemplateDndFinalize(workoutIndex: number, e: CustomEvent<DndEvent<Exercise>>) {
    if (!selectedPhase || !templates) return;
    templates[selectedPhase][workoutIndex].exercises = e.detail.items;
  }

  function editExerciseInTemplate(workoutIndex: number, exercise: Exercise) {
    editingWorkoutIndex = workoutIndex;
    editingExerciseId = exercise.id;
    isAddingExercise = true;
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

  function cycleParam(param: ParameterBlock) {
    if (!editingType) return;
    
    if (!editingType.possibleParameters) {
      editingType.possibleParameters = [...editingType.parameters];
    }
    
    const isDefault = editingType.parameters.includes(param);
    const isPossible = editingType.possibleParameters.includes(param);

    if (isDefault) {
      // State 2 (Default) -> State 0 (Unselected)
      editingType.parameters = editingType.parameters.filter(p => p !== param);
      editingType.possibleParameters = editingType.possibleParameters.filter(p => p !== param);
    } else if (isPossible) {
      // State 1 (Possible) -> State 2 (Default)
      editingType.parameters = [...editingType.parameters, param];
    } else {
      // State 0 (Unselected) -> State 1 (Possible)
      editingType.possibleParameters = [...editingType.possibleParameters, param];
    }
  }

  // --- Analytics Category Management ---
  function startAddAnalyticsCategory() {
    editingAnalyticsCategory = {
      id: generateId(),
      name: 'New Category',
      color: predefinedColors[0]
    };
    isAddingAnalyticsCategory = true;
  }

  function saveAnalyticsCategory() {
    if (!editingAnalyticsCategory) return;
    
    const name = editingAnalyticsCategory.name.trim();
    if (!name) {
      showAlert('Input Error', 'Category name cannot be empty.');
      return;
    }

    const isDuplicate = analyticsCategories.some(c => 
      c.id !== editingAnalyticsCategory?.id && 
      c.name.toLowerCase() === name.toLowerCase()
    );

    if (isDuplicate) {
      showAlert('Input Error', 'A category with this name already exists.');
      return;
    }

    const index = analyticsCategories.findIndex(c => c.id === editingAnalyticsCategory?.id);
    if (index !== -1) {
      analyticsCategories[index] = { ...editingAnalyticsCategory, name };
    } else {
      analyticsCategories.push({ ...editingAnalyticsCategory, name });
    }
    isAddingAnalyticsCategory = false;
    editingAnalyticsCategory = null;
  }

  async function deleteAnalyticsCategory(id: string) {
    const catToDelete = analyticsCategories.find(c => c.id === id);
    if (!catToDelete) return;

    let inUseCount = 0;
    let inUseModalities = 0;

    trainingState.workouts.forEach(w => {
      w.exercises?.forEach(e => {
        const cat = e.category || trainingState.exerciseTypes.find(t => t.name === e.type)?.category;
        if (cat === catToDelete.name) inUseCount++;
      });
    });
    
    if (templates) {
      Object.values(templates).forEach(phase => {
        phase?.forEach(t => {
          t.exercises?.forEach(e => {
            const cat = e.category || trainingState.exerciseTypes.find(type => type.name === e.type)?.category;
            if (cat === catToDelete.name) inUseCount++;
          });
        });
      });
    }

    trainingState.exerciseTypes.forEach(t => {
      if (t.category === catToDelete.name) inUseModalities++;
    });

    const msg = inUseCount > 0 || inUseModalities > 0
      ? `Delete "${catToDelete.name}"? This will leave ${inUseCount} exercises and ${inUseModalities} modalities using a missing category (you can restore it later).`
      : 'Delete this category?';

    const confirmed = await showConfirm('Delete Category', msg);
    if (!confirmed) return;
    analyticsCategories = analyticsCategories.filter(c => c.id !== id);
  }

  function moveAnalyticsCategoryUp(index: number) {
    if (index === 0) return;
    const temp = analyticsCategories[index - 1];
    analyticsCategories[index - 1] = analyticsCategories[index];
    analyticsCategories[index] = temp;
  }

  function moveAnalyticsCategoryDown(index: number) {
    if (index === analyticsCategories.length - 1) return;
    const temp = analyticsCategories[index + 1];
    analyticsCategories[index + 1] = analyticsCategories[index];
    analyticsCategories[index] = temp;
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
      {#if currentTab === 'overview'}
        <button onclick={() => trainingState.navigate('history')} class="p-2 bg-surface-elevated/50 rounded-xl border border-border-strong/50 text-content-muted hover:text-content transition-colors"><Icon icon="ic:baseline-arrow-back" class="text-xl" /></button>
        <h2 class="text-xl font-bold text-content tracking-tight">Settings</h2>
      {:else}
        <button onclick={() => currentTab = 'overview'} class="p-2 bg-surface-elevated/50 rounded-xl border border-border-strong/50 text-content-muted hover:text-content transition-colors"><Icon icon="ic:baseline-arrow-back" class="text-xl" /></button>
        <h2 class="text-xl font-bold text-content tracking-tight">
          {#if currentTab === 'customization'}Customization
          {:else if currentTab === 'design'}Appearance & Design
          {:else if currentTab === 'integration'}Data & Exports
          {:else if currentTab === 'about'}About & Impressum{/if}
        </h2>
      {/if}
    </div>
    {#if currentTab === 'customization'}
      <button onclick={saveAll} class="px-4 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-bold rounded-xl transition-all shadow-lg active:scale-95">Save All</button>
    {/if}
  </div>

  {#if currentTab === 'overview'}
    <div class="space-y-4">
      <button onclick={() => currentTab = 'customization'} class="w-full flex items-center justify-between p-5 bg-surface/50 hover:bg-surface-elevated border border-border rounded-3xl transition-all group backdrop-blur-sm shadow-xl">
        <div class="flex items-center gap-4">
          <div class="p-3 bg-primary-hover/10 rounded-2xl text-primary group-hover:bg-primary-hover group-hover:text-white transition-colors"><Icon icon="ic:baseline-tune" class="text-2xl" /></div>
          <div class="text-left"><p class="text-base font-bold text-content">Customization</p><p class="text-[11px] text-content-subtle mt-1">Modalities, Analytics, Benchmarks</p></div>
        </div>
        <Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-2xl" />
      </button>
      <button onclick={() => currentTab = 'design'} class="w-full flex items-center justify-between p-5 bg-surface/50 hover:bg-surface-elevated border border-border rounded-3xl transition-all group backdrop-blur-sm shadow-xl">
        <div class="flex items-center gap-4">
          <div class="p-3 bg-tertiary-hover/10 rounded-2xl text-tertiary group-hover:bg-tertiary-hover group-hover:text-white transition-colors"><Icon icon="ic:baseline-color-lens" class="text-2xl" /></div>
          <div class="text-left"><p class="text-base font-bold text-content">Appearance & Design</p><p class="text-[11px] text-content-subtle mt-1">Contrast, Visuals & Themes</p></div>
        </div>
        <Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-2xl" />
      </button>
      <button onclick={() => currentTab = 'integration'} class="w-full flex items-center justify-between p-5 bg-surface/50 hover:bg-surface-elevated border border-border rounded-3xl transition-all group backdrop-blur-sm shadow-xl">
        <div class="flex items-center gap-4">
          <div class="p-3 bg-emerald-500/10 rounded-2xl text-emerald-500 group-hover:bg-emerald-500 group-hover:text-white transition-colors"><Icon icon="ic:baseline-sync" class="text-2xl" /></div>
          <div class="text-left"><p class="text-base font-bold text-content">Data & Exports</p><p class="text-[11px] text-content-subtle mt-1">Calendar, JSON Backups, Apps</p></div>
        </div>
        <Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-2xl" />
      </button>
      <button onclick={() => currentTab = 'about'} class="w-full flex items-center justify-between p-5 bg-surface/50 hover:bg-surface-elevated border border-border rounded-3xl transition-all group backdrop-blur-sm shadow-xl">
        <div class="flex items-center gap-4">
          <div class="p-3 bg-zinc-500/10 rounded-2xl text-content-subtle group-hover:bg-zinc-500 group-hover:text-content transition-colors"><Icon icon="ic:baseline-info" class="text-2xl" /></div>
          <div class="text-left"><p class="text-base font-bold text-content">About & Impressum</p><p class="text-[11px] text-content-subtle mt-1">Impressum, Credits & License</p></div>
        </div>
        <Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-2xl" />
      </button>
    </div>
  {:else if currentTab === 'customization'}
    <div class="space-y-6">
      <div class="bg-surface/50 border border-border rounded-3xl p-6 space-y-6 backdrop-blur-sm shadow-xl">
      <div class="space-y-2">
        <h3 class="text-xs font-bold text-content-muted uppercase tracking-widest px-1">Exercise Modalities</h3>
        <p class="text-[10px] text-content-subtle px-1 leading-relaxed">Define custom exercise types and their tracking parameters.</p>
      </div>

      {#if isAddingType && editingType}
        <div class="p-5 bg-surface-elevated/50 border border-primary/30 rounded-2xl space-y-4 animate-in zoom-in-95 shadow-inner">
          <div class="space-y-3">
            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-1"><label for="edit-name" class="text-[8px] font-black text-content-subtle uppercase tracking-widest ml-1">Modality Name</label><input id="edit-name" bind:value={editingType.name} class="w-full bg-surface text-content p-3 rounded-xl border border-border-strong focus:ring-1 focus:ring-blue-500 outline-none text-sm" placeholder="e.g., Hangboard" /></div>
              <div class="space-y-1"><label for="edit-load" class="text-[8px] font-black text-content-subtle uppercase tracking-widest ml-1">Default Load (1-10)</label><input id="edit-load" type="number" min="1" max="10" bind:value={editingType.defaultPlannedLoad} class="w-full bg-surface text-content p-3 rounded-xl border border-border-strong focus:ring-1 focus:ring-blue-500 outline-none text-sm" /></div>
            </div>

            <div class="space-y-1"><label for="edit-cat" class="text-[8px] font-black text-content-subtle uppercase tracking-widest ml-1">Analytics Category</label><select id="edit-cat" bind:value={editingType.category} class="w-full bg-surface text-content p-3 rounded-xl border border-border-strong outline-none text-sm appearance-none">{#each analyticsCategories as cat} <option value={cat.name}>{cat.name}</option> {/each}</select></div>
            <div class="space-y-2"><span class="text-[8px] font-black text-content-subtle uppercase tracking-widest ml-1 block">Active Parameters</span><div class="grid grid-cols-2 gap-2">{#each parameterBlocks as block}<button onclick={() => cycleParam(block.id)} class="px-3 py-2 rounded-lg text-[9px] font-bold border transition-all flex items-center justify-between gap-2 {editingType.parameters.includes(block.id) ? 'bg-primary-hover/10 border-primary/50 text-primary-hover' : (editingType.possibleParameters?.includes(block.id) ? 'bg-surface-elevated border-border-strong text-content' : 'bg-surface border-border/50 text-content-subtle opacity-50')}"><div class="flex items-center gap-2"><Icon icon={editingType.parameters.includes(block.id) ? 'ic:baseline-check-box' : (editingType.possibleParameters?.includes(block.id) ? 'ic:baseline-indeterminate-check-box' : 'ic:baseline-check-box-outline-blank')} class="text-sm" /><span>{block.label}</span></div><span class="text-[7px] font-black uppercase opacity-60 tracking-wider">{editingType.parameters.includes(block.id) ? 'Default' : (editingType.possibleParameters?.includes(block.id) ? 'Possible' : '')}</span></button>{/each}</div></div>
          </div>
          <div class="flex gap-2 pt-2"><button onclick={saveType} class="flex-1 py-3 bg-primary text-white text-[10px] font-black uppercase tracking-widest rounded-xl">Save</button><button onclick={() => { isAddingType = false; editingType = null; }} class="px-5 py-3 bg-surface-elevated text-content-muted text-[10px] font-black uppercase tracking-widest rounded-xl">Cancel</button></div>
        </div>
      {:else}
        <div class="space-y-2">
          {#each exerciseTypes as type}
            <div class="flex items-center justify-between p-3.5 bg-surface-elevated/30 border border-border-strong/50 rounded-2xl group transition-all hover:bg-surface-elevated/50">
              <div><p class="text-sm font-bold text-content">{type.name}</p><p class="text-[9px] text-content-subtle uppercase tracking-tighter">{type.category}</p></div>
              <div class="flex items-center gap-1">
                <button onclick={() => { editingType = { ...type }; isAddingType = true; }} class="p-2 text-content-subtle hover:text-content transition-colors" aria-label="Edit Modality"><Icon icon="ic:baseline-edit" /></button>
                <button onclick={() => deleteType(type.id)} class="p-2 text-content-subtle hover:text-danger transition-colors" aria-label="Delete Modality"><Icon icon="ic:baseline-delete" /></button>
              </div>
            </div>
          {/each}
          <button onclick={startAddType} class="w-full py-3.5 border-2 border-dashed border-border hover:border-border-strong rounded-2xl flex items-center justify-center gap-2 text-content-subtle hover:text-content-muted transition-all"><Icon icon="ic:baseline-plus" /><span class="text-[10px] font-black uppercase tracking-widest">Add New Modality</span></button>
        </div>
      {/if}
    </div>

    <div class="bg-surface/50 border border-border rounded-3xl p-6 space-y-6 backdrop-blur-sm shadow-xl">
      <div class="space-y-2">
        <h3 class="text-xs font-bold text-content-muted uppercase tracking-widest px-1">Analytics Categories</h3>
        <p class="text-[10px] text-content-subtle px-1 leading-relaxed">Manage categories for the Training Mix graph.</p>
      </div>

      {#if isAddingAnalyticsCategory && editingAnalyticsCategory}
        <div class="p-5 bg-surface-elevated/50 border border-tertiary/30 rounded-2xl space-y-4 animate-in zoom-in-95 shadow-inner">
          <div class="space-y-3">
            <div class="space-y-1"><label for="ac-name" class="text-[8px] font-black text-content-subtle uppercase tracking-widest ml-1">Category Name</label><input id="ac-name" bind:value={editingAnalyticsCategory.name} class="w-full bg-surface text-content p-3 rounded-xl border border-border-strong focus:ring-1 focus:ring-purple-500 outline-none text-sm" placeholder="e.g., Flexibility" /></div>
            <div class="space-y-1"><p class="text-[8px] font-black text-content-subtle uppercase tracking-widest ml-1">Color</p>
              <div class="flex flex-wrap gap-2">
                {#each predefinedColors as color}
                  <button type="button" aria-label="Select color {color}" onclick={() => editingAnalyticsCategory!.color = color} class="w-6 h-6 rounded-full {color} {editingAnalyticsCategory!.color === color ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-900' : 'opacity-70 hover:opacity-100'} transition-all"></button>
                {/each}
              </div>
            </div>
          </div>
          <div class="flex gap-2 pt-2"><button onclick={saveAnalyticsCategory} class="flex-1 py-3 bg-tertiary text-white text-[10px] font-black uppercase tracking-widest rounded-xl">Save</button><button onclick={() => { isAddingAnalyticsCategory = false; editingAnalyticsCategory = null; }} class="px-5 py-3 bg-surface-elevated text-content-muted text-[10px] font-black uppercase tracking-widest rounded-xl">Cancel</button></div>
        </div>
      {:else}
        <div class="space-y-2">
          {#each analyticsCategories as cat, index}
            <div class="flex items-center justify-between p-3.5 bg-surface-elevated/30 border border-border-strong/50 rounded-2xl group transition-all hover:bg-surface-elevated/50">
              <div class="flex items-center gap-3"><div class="w-3 h-3 rounded-full {cat.color}"></div><div><p class="text-sm font-bold text-content">{cat.name}</p></div></div>
              <div class="flex items-center gap-0.5">
                <button onclick={() => moveAnalyticsCategoryUp(index)} disabled={index === 0} class="p-1.5 text-content-subtle hover:text-content disabled:opacity-30 disabled:hover:text-content-subtle transition-colors" aria-label="Move Up"><Icon icon="ic:baseline-keyboard-arrow-up" class="text-lg" /></button>
                <button onclick={() => moveAnalyticsCategoryDown(index)} disabled={index === analyticsCategories.length - 1} class="p-1.5 text-content-subtle hover:text-content disabled:opacity-30 disabled:hover:text-content-subtle transition-colors" aria-label="Move Down"><Icon icon="ic:baseline-keyboard-arrow-down" class="text-lg" /></button>
                <button onclick={() => { editingAnalyticsCategory = { ...cat }; isAddingAnalyticsCategory = true; }} class="p-1.5 text-content-subtle hover:text-content transition-colors" aria-label="Edit Category"><Icon icon="ic:baseline-edit" class="text-sm" /></button>
                <button onclick={() => deleteAnalyticsCategory(cat.id)} class="p-1.5 text-content-subtle hover:text-danger transition-colors" aria-label="Delete Category"><Icon icon="ic:baseline-delete" class="text-sm" /></button>
              </div>
            </div>
          {/each}
          <button onclick={startAddAnalyticsCategory} class="w-full py-3.5 border-2 border-dashed border-border hover:border-border-strong rounded-2xl flex items-center justify-center gap-2 text-content-subtle hover:text-content-muted transition-all"><Icon icon="ic:baseline-plus" /><span class="text-[10px] font-black uppercase tracking-widest">Add Category</span></button>
        </div>
      {/if}

      {#if missingCategories.length > 0}
        <div class="mt-6 p-4 bg-warning/10 border border-warning/30 rounded-2xl space-y-3 animate-in fade-in">
          <div class="flex items-center gap-2 text-warning">
            <Icon icon="ic:baseline-warning" class="text-lg" />
            <span class="text-[10px] font-bold uppercase tracking-widest">Missing Categories Found</span>
          </div>
          <p class="text-[9px] text-content-muted leading-relaxed">The following categories are referenced by existing exercises or modalities but don't exist. Add them back to track them in Analytics.</p>
          <div class="space-y-2">
            {#each missingCategories as mCat}
              <div class="flex items-center justify-between p-2.5 bg-surface/50 rounded-xl border border-warning/20">
                <span class="text-[10px] font-bold text-content">{mCat}</span>
                <button 
                  onclick={() => {
                    analyticsCategories = [...analyticsCategories, {
                      id: generateId(),
                      name: mCat,
                      color: 'bg-zinc-500'
                    }];
                  }}
                  class="px-3 py-1.5 bg-warning hover:bg-warning-hover text-white text-[9px] font-black uppercase tracking-widest rounded-lg transition-colors"
                >
                  Restore
                </button>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>

    <div class="bg-surface/50 border border-border rounded-3xl p-6 space-y-6 backdrop-blur-sm shadow-xl">
      <div class="space-y-2">
        <h3 class="text-xs font-bold text-content-muted uppercase tracking-widest px-1">Benchmark Types</h3>
        <p class="text-[10px] text-content-subtle px-1 leading-relaxed">Customize performance tests and their units.</p>
      </div>

      {#if isAddingBenchmark && editingBenchmarkType}
        <div class="p-5 bg-surface-elevated/50 border border-emerald-500/30 rounded-2xl space-y-4 animate-in zoom-in-95 shadow-inner">
          <div class="space-y-3">
            <div class="space-y-1"><label for="bench-name" class="text-[8px] font-black text-content-subtle uppercase tracking-widest ml-1">Test Name</label><input id="bench-name" bind:value={editingBenchmarkType.name} class="w-full bg-surface text-content p-3 rounded-xl border border-border-strong focus:ring-1 focus:ring-emerald-500 outline-none text-sm" placeholder="e.g., 20mm Max Hang" /></div>
            <div class="space-y-1"><label for="bench-unit" class="text-[8px] font-black text-content-subtle uppercase tracking-widest ml-1">Result Unit</label><input id="bench-unit" bind:value={editingBenchmarkType.unit} class="w-full bg-surface text-content p-3 rounded-xl border border-border-strong focus:ring-1 focus:ring-emerald-500 outline-none text-sm" placeholder="e.g., kg, reps, s" /></div>
          </div>
          <div class="flex gap-2 pt-2"><button onclick={saveBenchmarkType} class="flex-1 py-3 bg-success text-white text-[10px] font-black uppercase tracking-widest rounded-xl">Save</button><button onclick={() => { isAddingBenchmark = false; editingBenchmarkType = null; }} class="px-5 py-3 bg-surface-elevated text-content-muted text-[10px] font-black uppercase tracking-widest rounded-xl">Cancel</button></div>
        </div>
      {:else}
        <div class="space-y-2">
          {#each benchmarkTypes as type}
            <div class="flex items-center justify-between p-3.5 bg-surface-elevated/30 border border-border-strong/50 rounded-2xl group transition-all hover:bg-surface-elevated/50">
              <div><p class="text-sm font-bold text-content">{type.name}</p><p class="text-[9px] text-content-subtle uppercase tracking-tighter">Unit: {type.unit}</p></div>
              <div class="flex items-center gap-1">
                <button onclick={() => { editingBenchmarkType = { ...type }; isAddingBenchmark = true; }} class="p-2 text-content-subtle hover:text-content transition-colors" aria-label="Edit Benchmark"><Icon icon="ic:baseline-edit" /></button>
                <button onclick={() => deleteBenchmarkType(type.id)} class="p-2 text-content-subtle hover:text-danger transition-colors" aria-label="Delete Benchmark"><Icon icon="ic:baseline-delete" /></button>
              </div>
            </div>
          {/each}
          <button onclick={startAddBenchmark} class="w-full py-3.5 border-2 border-dashed border-border hover:border-border-strong rounded-2xl flex items-center justify-center gap-2 text-content-subtle hover:text-content-muted transition-all"><Icon icon="ic:baseline-plus" /><span class="text-[10px] font-black uppercase tracking-widest">Add Benchmark Type</span></button>
        </div>
      {/if}
    </div>

    <div class="bg-surface/50 border border-border rounded-3xl p-6 space-y-6 backdrop-blur-sm shadow-xl">
      <div class="space-y-2"><h3 class="text-xs font-bold text-content-muted uppercase tracking-widest px-1">Training Templates</h3><p class="text-[10px] text-content-subtle px-1 leading-relaxed">Customize default sessions for each periodization phase.</p></div>
      <div class="space-y-4">
        <div class="flex flex-wrap gap-2">{#each phases as phase}<button onclick={() => { selectedPhase = phase; editingWorkoutIndex = null; isAddingExercise = false; }} class="px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border {selectedPhase === phase ? 'bg-primary border-primary text-white shadow-lg' : 'bg-surface-elevated/50 border-border-strong text-content-muted hover:text-content'}">{phase}</button>{/each}</div>
        {#if selectedPhase && templates}
          <div class="space-y-4 pt-2 animate-in fade-in">
            <div class="flex items-center justify-between px-1"><h4 class="text-[11px] font-black text-primary uppercase tracking-[0.2em]">{selectedPhase} Plan</h4><button onclick={addWorkoutToPhase} class="p-1.5 bg-surface-elevated hover:bg-surface-elevated-hover text-content rounded-lg transition-colors"><Icon icon="ic:baseline-plus" class="text-sm" /></button></div>
            <div class="space-y-3">
              {#each templates[selectedPhase] as workout, wIndex}
                <div class="p-5 bg-surface-elevated/30 border border-border-strong/50 rounded-2xl space-y-4 shadow-inner relative">
                  <div class="flex items-center justify-between gap-4">
                    <div class="min-w-0 flex-1">
                      <input bind:value={workout.notes} class="w-full bg-transparent text-sm font-bold text-content border-b border-transparent focus:border-primary/30 outline-none pb-1 truncate" placeholder="Session Name" />
                    </div>
                    <div class="flex items-center gap-0.5 flex-shrink-0">
                      <button onclick={() => {
                        if (templates && selectedPhase && wIndex > 0) {
                          const temp = templates[selectedPhase][wIndex - 1];
                          templates[selectedPhase][wIndex - 1] = workout;
                          templates[selectedPhase][wIndex] = temp;
                        }
                      }} disabled={wIndex === 0} class="p-1 text-content-subtle hover:text-content disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="Move Up"><Icon icon="ic:baseline-keyboard-arrow-up" class="text-lg" /></button>
                      <button onclick={() => {
                        if (templates && selectedPhase && wIndex < templates[selectedPhase].length - 1) {
                          const temp = templates[selectedPhase][wIndex + 1];
                          templates[selectedPhase][wIndex + 1] = workout;
                          templates[selectedPhase][wIndex] = temp;
                        }
                      }} disabled={!templates || !selectedPhase || wIndex === templates[selectedPhase].length - 1} class="p-1 text-content-subtle hover:text-content disabled:opacity-30 disabled:cursor-not-allowed transition-colors mr-1" title="Move Down"><Icon icon="ic:baseline-keyboard-arrow-down" class="text-lg" /></button>

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
                            <span class="text-[10px] font-medium text-content-muted truncate">{exercise.type}</span>
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
                          initialData={editingExerciseId ? workout.exercises?.find((e: any) => e.id === editingExerciseId) : null} 
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
        <button onclick={resetTemplates} class="w-full py-3 text-[9px] font-black text-content-subtle hover:text-danger uppercase tracking-widest transition-colors">Reset to Default Library</button>
      </div>
    </div>


  </div>
  {:else if currentTab === 'design'}
    <div class="space-y-6">
      <div class="bg-surface border border-border rounded-3xl p-6 space-y-6 backdrop-blur-sm shadow-xl animate-in fade-in">
        <div class="space-y-2">
          <h3 class="text-xs font-bold text-content-muted uppercase tracking-widest px-1">Visual Settings</h3>
          <p class="text-[10px] text-content-subtle px-1 leading-relaxed">Adjust the app's appearance to suit your needs, especially helpful for outdoor use.</p>
        </div>
        <div class="space-y-3">
          <button 
            onclick={() => trainingState.setTheme('dark')}
            class="w-full flex items-center justify-between p-4 rounded-2xl border transition-all {trainingState.theme === 'dark' ? 'bg-primary/10 border-primary text-primary' : 'bg-surface-elevated/30 border-border-strong/50 text-content'}"
          >
            <div class="flex items-center gap-3">
              <Icon icon="ic:baseline-dark-mode" class="text-xl" />
              <div class="text-left">
                <p class="text-sm font-bold">Dark Theme (Default)</p>
              </div>
            </div>
            {#if trainingState.theme === 'dark'}
              <Icon icon="ic:baseline-check-circle" class="text-xl" />
            {/if}
          </button>

          <button 
            onclick={() => trainingState.setTheme('light')}
            class="w-full flex items-center justify-between p-4 rounded-2xl border transition-all {trainingState.theme === 'light' ? 'bg-primary/10 border-primary text-primary' : 'bg-surface-elevated/30 border-border-strong/50 text-content'}"
          >
            <div class="flex items-center gap-3">
              <Icon icon="ic:baseline-light-mode" class="text-xl" />
              <div class="text-left">
                <p class="text-sm font-bold">Light Theme</p>
              </div>
            </div>
            {#if trainingState.theme === 'light'}
              <Icon icon="ic:baseline-check-circle" class="text-xl" />
            {/if}
          </button>

          <button 
            onclick={() => trainingState.setTheme('contrast')}
            class="w-full flex items-center justify-between p-4 rounded-2xl border transition-all {trainingState.theme === 'contrast' ? 'bg-primary/10 border-primary text-primary' : 'bg-surface-elevated/30 border-border-strong/50 text-content'}"
          >
            <div class="flex items-center gap-3">
              <Icon icon="ic:baseline-contrast" class="text-xl" />
              <div class="text-left">
                <p class="text-sm font-bold">High Contrast</p>
                <p class="text-[9px] opacity-80 mt-1">Maximum readability for direct sunlight.</p>
              </div>
            </div>
            {#if trainingState.theme === 'contrast'}
              <Icon icon="ic:baseline-check-circle" class="text-xl" />
            {/if}
          </button>
        </div>
      </div>
    </div>
  {:else if currentTab === 'integration'}
    <div class="space-y-6">
      <div class="bg-surface/50 border border-border rounded-3xl p-6 space-y-6 backdrop-blur-sm shadow-xl animate-in fade-in">
        <div class="space-y-2">
          <h3 class="text-xs font-bold text-content-muted uppercase tracking-widest px-1">Calendar Integration</h3>
          <p class="text-[10px] text-content-subtle px-1 leading-relaxed">Export your workouts to an ICS file to import into Samsung Calendar, Google Calendar, or Apple Calendar.</p>
        </div>
        <button 
          onclick={() => exportWorkoutsToICS(trainingState.workouts)} 
          class="w-full flex items-center justify-between p-4 bg-surface-elevated/50 hover:bg-surface-elevated rounded-2xl border border-border-strong/50 transition-all group"
        >
          <div class="flex items-center gap-3">
            <div class="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-500 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
              <Icon icon="ic:baseline-calendar-today" class="text-xl" />
            </div>
            <div class="text-left">
              <p class="text-sm font-bold text-content">Export Calendar (.ics)</p>
              <p class="text-[9px] text-content-subtle uppercase">Download all sessions</p>
            </div>
          </div>
          <Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-xl" />
        </button>
      </div>
      
      <div class="bg-surface/50 border border-border rounded-3xl p-6 space-y-6 backdrop-blur-sm shadow-xl animate-in fade-in">
        <div class="space-y-2"><h3 class="text-xs font-bold text-content-muted uppercase tracking-widest px-1">Printable Training Plan</h3><p class="text-[10px] text-content-subtle px-1 leading-relaxed">Generate a beautifully formatted PDF of your workouts for any week range.</p></div>
        <button 
          onclick={() => showPDFExport = true} 
          class="w-full flex items-center justify-between p-4 bg-surface-elevated/50 hover:bg-surface-elevated rounded-2xl border border-border-strong/50 transition-all group"
        >
          <div class="flex items-center gap-3">
            <div class="p-2.5 bg-rose-500/10 rounded-xl text-rose-500 group-hover:bg-rose-500 group-hover:text-white transition-colors">
              <Icon icon="ic:baseline-picture-as-pdf" class="text-xl" />
            </div>
            <div class="text-left">
              <p class="text-sm font-bold text-content">Export PDF</p>
              <p class="text-[9px] text-content-subtle uppercase">Select week range</p>
            </div>
          </div>
          <Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-xl" />
        </button>
      </div>
      
      <div class="bg-surface/50 border border-border rounded-3xl p-6 space-y-6 backdrop-blur-sm shadow-xl animate-in fade-in">
        <div class="space-y-2"><h3 class="text-xs font-bold text-content-muted uppercase tracking-widest px-1">JSON Backups</h3><p class="text-[10px] text-content-subtle px-1">Ensure your data is safe by exporting a local JSON backup.</p></div>
        <div class="grid grid-cols-1 gap-3">
          <button onclick={onExport} class="flex items-center justify-between p-4 bg-surface-elevated/50 hover:bg-surface-elevated rounded-2xl border border-border-strong/50 transition-all group"><div class="flex items-center gap-3"><div class="p-2.5 bg-primary-hover/10 rounded-xl text-primary group-hover:bg-primary-hover group-hover:text-white transition-colors"><Icon icon="ic:baseline-download" class="text-xl" /></div><div class="text-left"><p class="text-sm font-bold text-content">Export</p><p class="text-[9px] text-content-subtle uppercase">Save to local JSON</p></div></div><Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-xl" /></button>
          <div class="relative">
            <button onclick={handleImportClick} class="w-full flex items-center justify-between p-4 bg-surface-elevated/50 hover:bg-surface-elevated rounded-2xl border border-border-strong/50 transition-all group cursor-pointer"><div class="flex items-center gap-3"><div class="p-2.5 bg-success-hover/10 rounded-xl text-success group-hover:bg-success-hover group-hover:text-white transition-colors"><Icon icon="ic:baseline-upload" class="text-xl" /></div><div class="text-left"><p class="text-sm font-bold text-content">Import</p><p class="text-[9px] text-content-subtle uppercase">Restore from backup</p></div></div><Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-xl" /></button>
            <input bind:this={fileInput} type="file" accept=".json" class="hidden" onchange={onImport} />
          </div>
        </div>
      </div>
    </div>
  {:else if currentTab === 'about'}
    <div class="space-y-6">
      <div class="bg-surface/50 border border-border rounded-3xl p-6 space-y-6 backdrop-blur-sm shadow-xl animate-in fade-in">
        <div class="space-y-4">
          <div class="text-center py-4">
            <Icon icon="ic:baseline-terrain" class="text-6xl text-primary mx-auto mb-2" />
            <h3 class="text-xl font-black text-content">Boulder Tracker</h3>
            <p class="text-xs text-content-subtle mt-1">Version 1.0.0</p>
          </div>
          
          <div class="space-y-2 pt-4 border-t border-border">
            <h4 class="text-xs font-bold text-content-muted uppercase tracking-widest">Impressum</h4>
            <p class="text-[11px] text-content-muted leading-relaxed">
              Developer: Boulder Tracker Team<br/>
              Contact: support@bouldertracker.app<br/>
              <br/>
              Created with passion for the climbing community.
            </p>
          </div>

          <div class="space-y-2 pt-4 border-t border-border">
            <h4 class="text-xs font-bold text-content-muted uppercase tracking-widest">Credits & Dependencies</h4>
            <ul class="text-[11px] text-content-muted space-y-1 list-disc list-inside">
              <li>Built with Svelte & Capacitor</li>
              <li>Icons by Iconify (Material Icons)</li>
              <li>Charts powered by Chart.js</li>
            </ul>
          </div>

          <div class="space-y-2 pt-4 border-t border-border">
            <h4 class="text-xs font-bold text-content-muted uppercase tracking-widest">License</h4>
            <p class="text-[11px] text-content-muted leading-relaxed">
              MIT License. See full terms online.
            </p>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

{#if showPDFExport}
  <PDFExportModal onClose={() => showPDFExport = false} />
{/if}
