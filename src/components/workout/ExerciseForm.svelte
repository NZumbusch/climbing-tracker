<script lang="ts">
  import { onMount } from 'svelte';
  import { storage } from '../../lib/storage';
  import type { Exercise, ExerciseTypeDef } from '../../lib/types';

  // --- Props ---
  let { 
    initialData = null,
    onSave
  } = $props<{ 
    initialData?: Partial<Exercise> | null,
    onSave: (data: Omit<Exercise, 'id'>) => void
  }>();

  // --- State ---
  let exerciseTypes = $state<ExerciseTypeDef[]>([]);
  let selectedTypeId = $state<string>('');
  
  // Local form state - Initialized with defaults, updated via $effect
  let typeName = $state('');
  let duration = $state(60);
  let minGrade = $state('6A');
  let maxGrade = $state('6B');
  let cadence = $state(5);
  let boulderingType = $state<Exercise['boulderingType']>('Kilterboard');
  let variant = $state('4x4');
  let sets = $state<number | undefined>(4);
  let holdType = $state<Exercise['holdType']>('Half Crimp');
  let timeOn = $state(7);
  let timeOff = $state(3);
  let timeBetweenSets = $state(180);
  let addedWeight = $state(0);
  let rungSize = $state(20);
  let campusType = $state<Exercise['campusType']>('Jumps');
  let difficulty = $state(5);

  // --- Lifecycle ---
  onMount(async () => {
    exerciseTypes = await storage.getExerciseTypes();
    syncInitialSelection();
  });

  function syncInitialSelection() {
    const currentName = initialData?.type || typeName;
    const activeType = exerciseTypes.find(t => t.name === currentName);
    
    if (activeType) {
      selectedTypeId = activeType.id;
    } else if (currentName) {
      // Legacy fallback
      const legacyType: ExerciseTypeDef = {
        id: 'legacy',
        name: currentName,
        category: 'Other',
        parameters: ['duration', 'grades', 'cadence', 'boulderingStyle', 'variant', 'sets', 'holdType', 'hangboardTimes', 'restTime', 'holdSize', 'weight', 'campusStyle', 'difficulty']
      };
      exerciseTypes = [legacyType, ...exerciseTypes];
      selectedTypeId = 'legacy';
    } else if (exerciseTypes.length > 0) {
      selectedTypeId = exerciseTypes[0].id;
    }
  }

  // --- Derived State ---
  const activeTypeDef = $derived(exerciseTypes.find(t => t.id === selectedTypeId));

  // Sync internal state with incoming props
  $effect(() => {
    if (initialData) {
      typeName = initialData.type || '';
      duration = initialData.duration || 60;
      minGrade = initialData.minGrade || '6A';
      maxGrade = initialData.maxGrade || '6B';
      cadence = initialData.cadence || 5;
      boulderingType = initialData.boulderingType || 'Kilterboard';
      variant = initialData.variant || '4x4';
      sets = initialData.sets ?? 4;
      holdType = initialData.holdType || 'Half Crimp';
      timeOn = initialData.timeOn || 7;
      timeOff = initialData.timeOff || 3;
      timeBetweenSets = initialData.timeBetweenSets || 180;
      addedWeight = initialData.addedWeight || 0;
      rungSize = initialData.rungSize || 20;
      campusType = initialData.campusType || 'Jumps';
      difficulty = initialData.difficulty || 5;
      
      const activeType = exerciseTypes.find(t => t.name === typeName);
      if (activeType) selectedTypeId = activeType.id;
    }
  });

  // --- Handlers ---
  function handleSubmit() {
    if (!activeTypeDef) return;

    // Basic validation
    const cleanDuration = Math.max(0, duration);
    const cleanWeight = Math.max(0, addedWeight);
    const cleanSize = Math.max(0, rungSize);

    const data: any = { type: activeTypeDef.name };
    const params = activeTypeDef.parameters;

    if (params.includes('duration')) data.duration = cleanDuration;
    if (params.includes('grades')) {
      data.minGrade = minGrade;
      data.maxGrade = maxGrade;
    }
    if (params.includes('cadence')) data.cadence = cadence;
    if (params.includes('boulderingStyle')) data.boulderingType = boulderingType;
    if (params.includes('variant')) data.variant = variant;
    if (params.includes('sets')) data.sets = sets;
    
    if (params.includes('holdType')) data.holdType = holdType;
    if (params.includes('hangboardTimes')) {
      data.timeOn = timeOn;
      data.timeOff = timeOff;
    }
    if (params.includes('restTime')) data.timeBetweenSets = timeBetweenSets;
    if (params.includes('holdSize')) data.rungSize = cleanSize;
    if (params.includes('weight')) data.addedWeight = cleanWeight;
    if (params.includes('campusStyle')) data.campusType = campusType;
    if (params.includes('difficulty')) data.difficulty = difficulty;

    onSave(data);
  }

  // Constants
  const grades = ['5A', '5B', '5C', '6A', '6A+', '6B', '6B+', '6C', '6C+', '7A', '7A+', '7B', '7B+', '7C', '7C+', '8A', '8A+', '8B', '8B+', '8C'];
  const boulderingStyles: Exercise['boulderingType'][] = ['Kilterboard', 'Moonboard', 'Slab', 'Overhang', 'Dyno'];
  const variants = [{ id: '4x4', label: '4x4' }, { id: 'emom', label: 'One every 60s (EMOM)' }, { id: 'pyramid', label: 'Pyramid' }, { id: 'intervals', label: 'Intervals' }];
  const holdTypes: Exercise['holdType'][] = ['Crimp', 'Half Crimp', 'Full Crimp', 'Open Hand', 'Sloper', 'Pocket'];
  const campusStyles: Exercise['campusType'][] = ['Jumps', 'One Arm Ladders'];
</script>

<div class="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 space-y-5 backdrop-blur-sm animate-in zoom-in-95 duration-300">
  <div class="space-y-1.5">
    <label for="modality-select" class="text-[9px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Modality</label>
    <div class="relative">
      <select id="modality-select" bind:value={selectedTypeId} class="w-full bg-zinc-800 text-white p-3.5 rounded-xl border border-zinc-700 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none appearance-none transition-all cursor-pointer text-sm font-medium">
        {#each exerciseTypes as t} <option value={t.id}>{t.name}</option> {/each}
      </select>
    </div>
  </div>

  {#if activeTypeDef?.parameters.includes('duration')}
    <div class="space-y-1.5">
      <label for="ex-duration" class="text-[9px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Duration (min)</label>
      <input id="ex-duration" type="number" bind:value={duration} class="w-full bg-zinc-800 text-white p-3.5 rounded-xl border border-zinc-700 outline-none transition-all text-sm" />
    </div>
  {/if}

  <div class="grid grid-cols-1 gap-5 pt-1">
    {#if activeTypeDef?.parameters.includes('grades')}
      <div class="grid grid-cols-2 gap-3">
        <div class="space-y-1.5"><label for="ex-min-grade" class="text-[9px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Min Grade</label><select id="ex-min-grade" bind:value={minGrade} class="w-full bg-zinc-800 text-white p-2.5 rounded-xl border border-zinc-700 outline-none text-xs">{#each grades as g} <option value={g}>{g}</option> {/each}</select></div>
        <div class="space-y-1.5"><label for="ex-max-grade" class="text-[9px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Max Grade</label><select id="ex-max-grade" bind:value={maxGrade} class="w-full bg-zinc-800 text-white p-2.5 rounded-xl border border-zinc-700 outline-none text-xs">{#each grades as g} <option value={g}>{g}</option> {/each}</select></div>
      </div>
    {/if}

    {#if activeTypeDef?.parameters.includes('cadence')}<div class="space-y-1.5"><label for="ex-cadence" class="text-[9px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Cadence (min/boulder)</label><input id="ex-cadence" type="number" bind:value={cadence} class="w-full bg-zinc-800 text-white p-3.5 rounded-xl border border-zinc-700 outline-none text-sm" /></div>{/if}
    {#if activeTypeDef?.parameters.includes('boulderingStyle')}<div class="space-y-1.5"><label for="ex-style" class="text-[9px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Style</label><select id="ex-style" bind:value={boulderingType} class="w-full bg-zinc-800 text-white p-3.5 rounded-xl border border-zinc-700 outline-none text-sm">{#each boulderingStyles as style} <option value={style}>{style}</option> {/each}</select></div>{/if}
    {#if activeTypeDef?.parameters.includes('variant')}<div class="space-y-1.5"><label for="ex-variant" class="text-[9px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Variant</label><select id="ex-variant" bind:value={variant} class="w-full bg-zinc-800 text-white p-3.5 rounded-xl border border-zinc-700 outline-none text-sm">{#each variants as v} <option value={v.id}>{v.label}</option> {/each}</select></div>{/if}
    {#if activeTypeDef?.parameters.includes('sets')}<div class="space-y-1.5"><label for="ex-sets" class="text-[9px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Sets (Optional)</label><input id="ex-sets" type="number" bind:value={sets} class="w-full bg-zinc-800 text-white p-3.5 rounded-xl border border-zinc-700 outline-none text-sm" /></div>{/if}
    {#if activeTypeDef?.parameters.includes('holdType')}<div class="space-y-1.5"><label for="ex-hold" class="text-[9px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Hold Type</label><select id="ex-hold" bind:value={holdType} class="w-full bg-zinc-800 text-white p-3.5 rounded-xl border border-zinc-700 outline-none text-sm">{#each holdTypes as h} <option value={h}>{h}</option> {/each}</select></div>{/if}
    {#if activeTypeDef?.parameters.includes('hangboardTimes')}<div class="grid grid-cols-2 gap-3"><div class="space-y-1.5"><label for="ex-on" class="text-[9px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Time On (s)</label><input id="ex-on" type="number" bind:value={timeOn} class="w-full bg-zinc-800 text-white p-3.5 rounded-xl border border-zinc-700 outline-none text-xs" /></div><div class="space-y-1.5"><label for="ex-off" class="text-[9px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Time Off (s)</label><input id="ex-off" type="number" bind:value={timeOff} class="w-full bg-zinc-800 text-white p-3.5 rounded-xl border border-zinc-700 outline-none text-xs" /></div></div>{/if}
    {#if activeTypeDef?.parameters.includes('restTime')}<div class="space-y-1.5"><label for="ex-rest" class="text-[9px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Between Sets (s)</label><input id="ex-rest" type="number" bind:value={timeBetweenSets} class="w-full bg-zinc-800 text-white p-3.5 rounded-xl border border-zinc-700 outline-none text-sm" /></div>{/if}
    {#if activeTypeDef?.parameters.includes('holdSize')}<div class="space-y-1.5"><label for="ex-size" class="text-[9px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Hold Size (mm)</label><input id="ex-size" type="number" bind:value={rungSize} class="w-full bg-zinc-800 text-white p-3.5 rounded-xl border border-zinc-700 outline-none text-sm" /></div>{/if}
    {#if activeTypeDef?.parameters.includes('weight')}<div class="space-y-1.5"><label for="ex-weight" class="text-[9px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Weight (kg)</label><input id="ex-weight" type="number" bind:value={addedWeight} class="w-full bg-zinc-800 text-white p-3.5 rounded-xl border border-zinc-700 outline-none text-sm" /></div>{/if}
    {#if activeTypeDef?.parameters.includes('campusStyle')}<div class="space-y-1.5"><label for="ex-campus" class="text-[9px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Campus Style</label><select id="ex-campus" bind:value={campusType} class="w-full bg-zinc-800 text-white p-3.5 rounded-xl border border-zinc-700 outline-none text-sm">{#each campusStyles as c} <option value={c}>{c}</option> {/each}</select></div>{/if}
    {#if activeTypeDef?.parameters.includes('difficulty')}<div class="space-y-4 pt-1"><label for="ex-diff" class="flex justify-between text-[9px] font-bold text-zinc-500 uppercase tracking-widest ml-1"><span>Difficulty</span><span class="text-blue-500 font-mono text-[10px]">{difficulty}/10</span></label><input id="ex-diff" type="range" min="1" max="10" bind:value={difficulty} class="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500" /></div>{/if}
  </div>

  <button onclick={handleSubmit} class="w-full mt-4 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-bold py-4 rounded-2xl transition-all active:scale-[0.98]">{initialData ? 'Update Exercise' : 'Add to Session'}</button>
</div>
