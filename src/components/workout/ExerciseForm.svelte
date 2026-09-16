<script lang="ts">
  import { onMount } from 'svelte';
  import { storage } from '../../lib/storage';
  import { trainingState } from '../../lib/state.svelte';
  import type { ExerciseSlot, ExerciseTypeDef, ExerciseValues, ParameterBlock } from '../../lib/types';
  import { PARAMETER_LABELS } from '../../lib/constants';
  import Icon from '@iconify/svelte';

  // --- Props ---
  let {
    initialSlot = null,
    mode = 'prescribed',
    onSave
  } = $props<{
    initialSlot?: ExerciseSlot | null,
    /** Which ExerciseValues bucket on the slot this form edits - "prescribed" (the plan) or "logged" (what happened). */
    mode?: 'prescribed' | 'logged',
    onSave: (data: { typeId: string; categoryId?: string; activeParameters: ParameterBlock[]; values: ExerciseValues }) => void
  }>();

  // --- State ---
  let exerciseTypes = $state<ExerciseTypeDef[]>([]);
  let selectedTypeId = $state<string>('');
  let activeLoadTab = $state<'weight' | 'bodyweightPercent' | 'maxWeightPercent'>('weight');

  // Local form state - Initialized with defaults, updated via $effect
  let duration = $state(60);
  let minGrade = $state('6A');
  let maxGrade = $state('6B');
  let cadence = $state(5);
  let climbingStyle = $state<NonNullable<ExerciseValues['climbingStyle']>>(['Power']);
  let boardType = $state<ExerciseValues['boardType']>('Kilterboard');
  let boardAngle = $state(40);
  let sets = $state<number | undefined>(4);
  let reps = $state<number | undefined>(1);
  let movesPerRoute = $state<number | undefined>();
  let holdType = $state<ExerciseValues['holdType']>('Half Crimp');
  let timeOn = $state(7);
  let timeOff = $state(3);
  let timeBetweenSets = $state(180);
  let weight = $state(0);
  let holdSize = $state(20);
  let distance = $state(0);
  let campusType = $state<ExerciseValues['campusType']>('Jumps');
  let mobilityType = $state<NonNullable<ExerciseValues['mobilityType']>>(['Hamstrings']);
  let leadStyle = $state<NonNullable<ExerciseValues['leadStyle']>>(['Redpoint']);
  let difficulty = $state(5);
  let routeDifficulty = $state<"Easy" | "Moderate" | "Hard">("Moderate");
  let bodyweightPercent = $state(100);
  let maxWeightPercent = $state(80);
  let plannedLoad = $state(5);
  let notes = $state('');
  let categoryOverride = $state<string>('');

  // --- Lifecycle ---
  onMount(async () => {
    exerciseTypes = await storage.getExerciseTypes();
    if (initialSlot) {
      selectedTypeId = initialSlot.typeId;
    } else if (exerciseTypes.length > 0) {
      selectedTypeId = exerciseTypes[0].id;
    }
  });

  let activeParams = $state<ParameterBlock[]>([]);

  // --- Derived State ---
  const activeTypeDef = $derived(exerciseTypes.find(t => t.id === selectedTypeId));

  // The values bucket being edited - the current mode's bucket if it has
  // data, else fall back to prescribed as a sensible starting point (e.g.
  // adding a brand-new exercise directly onto an already-active session).
  const editingValues = $derived<ExerciseValues>(
    (initialSlot?.[mode as 'prescribed' | 'logged']) ?? initialSlot?.prescribed ?? {},
  );

  $effect(() => {
    if (initialSlot?.activeParameters) {
      activeParams = initialSlot.activeParameters;
    } else if (activeTypeDef) {
      activeParams = [...activeTypeDef.parameters];
    }
  });

  // Sync internal state with incoming props
  $effect(() => {
    const v = editingValues;
    duration = v.duration ?? 60;
    minGrade = v.minGrade || '6A';
    maxGrade = v.maxGrade || '6B';
    cadence = v.cadence ?? 5;
    climbingStyle = Array.isArray(v.climbingStyle) ? v.climbingStyle : ['Power'];
    boardType = v.boardType || 'Kilterboard';
    boardAngle = v.boardAngle ?? 40;
    sets = v.sets ?? 4;
    reps = v.reps ?? 1;
    movesPerRoute = v.movesPerRoute;
    holdType = v.holdType || 'Half Crimp';
    timeOn = v.timeOn ?? 7;
    timeOff = v.timeOff ?? 3;
    timeBetweenSets = v.timeBetweenSets ?? 180;
    weight = v.weight ?? 0;
    holdSize = v.holdSize ?? 20;
    distance = v.distance ?? 0;
    campusType = v.campusType || 'Jumps';
    mobilityType = Array.isArray(v.mobilityType) ? v.mobilityType : ['Hamstrings'];
    leadStyle = Array.isArray(v.leadStyle) ? v.leadStyle : ['Redpoint'];
    difficulty = v.difficulty ?? 5;
    routeDifficulty = v.routeDifficulty || 'Moderate';
    bodyweightPercent = v.bodyweightPercent ?? 100;
    maxWeightPercent = v.maxWeightPercent ?? 80;
    plannedLoad = v.plannedLoad ?? (activeTypeDef?.defaultPlannedLoad ?? 5);
    notes = v.notes || '';
    categoryOverride = initialSlot?.categoryId || '';
  });

  // Watch for modality changes to set default planned load
  $effect(() => {
    if (!initialSlot && activeTypeDef) {
      plannedLoad = activeTypeDef.defaultPlannedLoad ?? 5;
    }
  });

  const validationErrors = $derived.by(() => {
    const errors: Record<string, string> = {};
    if (activeParams.includes('duration') && duration <= 0) {
      errors.duration = 'Duration must be greater than 0.';
    }
    if (activeParams.includes('holdSize') && holdSize <= 0) {
      errors.holdSize = 'Hold size must be greater than 0.';
    }
    if (activeParams.includes('sets') && (sets || 0) < 0) {
      errors.sets = 'Sets cannot be negative.';
    }
    return errors;
  });

  const isValid = $derived(Object.keys(validationErrors).length === 0);

  // --- Handlers ---
  async function handleSubmit() {
    if (!activeTypeDef) return;

    if (!isValid) return;

    const cleanDuration = Math.max(0, duration);
    const cleanWeight = weight; // Weight can be negative (assisted)
    const cleanSize = Math.max(0, holdSize);

    const values: ExerciseValues = {
      plannedLoad: Number(plannedLoad),
      notes: notes
    };

    const params = activeParams;

    if (params.includes('duration')) values.duration = cleanDuration;
    if (params.includes('boulderingGrades') || params.includes('grades')) {
      values.minGrade = minGrade;
      values.maxGrade = maxGrade;
    }
    if (params.includes('routeGrades')) {
      values.minGrade = minGrade;
      values.maxGrade = maxGrade;
    }
    if (params.includes('cadence')) values.cadence = cadence;
    if (params.includes('climbingStyle')) values.climbingStyle = climbingStyle;
    if (params.includes('boardType')) values.boardType = boardType;
    if (params.includes('boardAngle')) values.boardAngle = boardAngle;
    if (params.includes('sets')) values.sets = sets;
    if (params.includes('reps')) values.reps = reps;
    if (params.includes('movesPerRoute')) values.movesPerRoute = movesPerRoute;

    if (params.includes('holdType')) values.holdType = holdType;
    if (params.includes('timeOn')) values.timeOn = timeOn;
    if (params.includes('timeOff')) values.timeOff = timeOff;
    if (params.includes('restTime')) values.timeBetweenSets = timeBetweenSets;
    if (params.includes('holdSize')) values.holdSize = cleanSize;
    if (params.includes('weight')) values.weight = cleanWeight;
    if (params.includes('distance')) values.distance = distance;
    if (params.includes('campusStyle')) values.campusType = campusType;
    if (params.includes('mobilityType')) values.mobilityType = mobilityType;
    if (params.includes('leadStyle')) values.leadStyle = leadStyle;
    if (params.includes('difficulty')) values.difficulty = difficulty;
    if (params.includes('routeDifficulty')) values.routeDifficulty = routeDifficulty;
    if (params.includes('bodyweightPercent')) values.bodyweightPercent = bodyweightPercent;
    if (params.includes('maxWeightPercent')) values.maxWeightPercent = maxWeightPercent;

    onSave({
      typeId: activeTypeDef.id,
      categoryId: categoryOverride || undefined,
      activeParameters: activeParams,
      values
    });
  }

  // Constants
  const bGrades = ['5A', '5B', '5C', '6A', '6A+', '6B', '6B+', '6C', '6C+', '7A', '7A+', '7B', '7B+', '7C', '7C+', '8A', '8A+', '8B', '8B+', '8C'];
  const rGrades = ['5a', '5b', '5c', '6a', '6a+', '6b', '6b+', '6c', '6c+', '7a', '7a+', '7b', '7b+', '7c', '7c+', '8a', '8a+', '8b', '8b+', '8c', '8c+', '9a', '9a+', '9b', '9b+', '9c'];
  const climbingStyles: NonNullable<ExerciseValues['climbingStyle']>[number][] = ['Slab', 'Coordination', 'Power', 'Board'];
  const boardTypes: ExerciseValues['boardType'][] = ['Kilterboard', 'Moonboard', 'Tension Board', 'Spraywall'];
  const boardAngles = [20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70];
  const holdTypes: ExerciseValues['holdType'][] = ['Crimp', 'Half Crimp', 'Full Crimp', 'Open Hand', 'Sloper', 'Pocket'];
  const campusStyles: ExerciseValues['campusType'][] = ['Jumps', 'One Arm Ladders'];
  const mobilityTypes: NonNullable<ExerciseValues['mobilityType']>[number][] = ['Hamstrings', 'Shoulders', 'Hips', 'Spine', 'Ankles', 'Wrists'];
  const leadStyles: NonNullable<ExerciseValues['leadStyle']>[number][] = ['Onsight', 'Flash', 'Redpoint', 'Projecting'];
</script>

<div class="bg-surface/50 border border-border rounded-3xl p-6 space-y-5 backdrop-blur-sm animate-in zoom-in-95 duration-300">
  <div class="space-y-1.5">
    <label for="modality-select" class="text-[9px] font-bold text-content-subtle uppercase tracking-widest ml-1">Modality</label>
    <div class="relative">
      <select id="modality-select" bind:value={selectedTypeId} class="w-full bg-surface-elevated text-content p-3.5 rounded-xl border border-border-strong focus:ring-2 focus:ring-blue-500/50 focus:border-primary outline-none appearance-none transition-all cursor-pointer text-sm font-medium">
        {#each exerciseTypes as t} <option value={t.id}>{t.name}</option> {/each}
      </select>
    </div>
  </div>

  {#if activeParams.includes('duration')}
    <div class="space-y-1.5">
      <label for="ex-duration" class="text-[9px] font-bold text-content-subtle uppercase tracking-widest ml-1">Duration (min)</label>
      <input id="ex-duration" type="number" bind:value={duration} class="w-full bg-surface-elevated text-content p-3.5 rounded-xl border border-border-strong outline-none transition-all text-sm {validationErrors.duration ? 'border-danger/50 focus:border-danger' : ''}" />
      {#if validationErrors.duration}<p class="text-[9px] font-bold text-danger uppercase tracking-widest ml-1">{validationErrors.duration}</p>{/if}
    </div>
  {/if}

  <div class="grid grid-cols-1 gap-5 pt-1">
    {#if activeParams.includes('boulderingGrades') || activeParams.includes('grades')}
      <div class="grid grid-cols-2 gap-3">
        <div class="space-y-1.5"><label for="ex-min-grade" class="text-[9px] font-bold text-content-subtle uppercase tracking-widest ml-1">Min Grade</label><select id="ex-min-grade" bind:value={minGrade} class="w-full bg-surface-elevated text-content p-2.5 rounded-xl border border-border-strong outline-none text-xs">{#each bGrades as g} <option value={g}>{g}</option> {/each}</select></div>
        <div class="space-y-1.5"><label for="ex-max-grade" class="text-[9px] font-bold text-content-subtle uppercase tracking-widest ml-1">Max Grade</label><select id="ex-max-grade" bind:value={maxGrade} class="w-full bg-surface-elevated text-content p-2.5 rounded-xl border border-border-strong outline-none text-xs">{#each bGrades as g} <option value={g}>{g}</option> {/each}</select></div>
      </div>
    {/if}

    {#if activeParams.includes('routeGrades')}
      <div class="grid grid-cols-2 gap-3">
        <div class="space-y-1.5"><label for="ex-min-rgrade" class="text-[9px] font-bold text-content-subtle uppercase tracking-widest ml-1">Min Grade</label><select id="ex-min-rgrade" bind:value={minGrade} class="w-full bg-surface-elevated text-content p-2.5 rounded-xl border border-border-strong outline-none text-xs">{#each rGrades as g} <option value={g}>{g}</option> {/each}</select></div>
        <div class="space-y-1.5"><label for="ex-max-rgrade" class="text-[9px] font-bold text-content-subtle uppercase tracking-widest ml-1">Max Grade</label><select id="ex-max-rgrade" bind:value={maxGrade} class="w-full bg-surface-elevated text-content p-2.5 rounded-xl border border-border-strong outline-none text-xs">{#each rGrades as g} <option value={g}>{g}</option> {/each}</select></div>
      </div>
    {/if}

    {#if activeParams.includes('cadence')}<div class="space-y-1.5"><label for="ex-cadence" class="text-[9px] font-bold text-content-subtle uppercase tracking-widest ml-1">Cadence (boulders or routes / min)</label><input id="ex-cadence" type="number" bind:value={cadence} class="w-full bg-surface-elevated text-content p-3.5 rounded-xl border border-border-strong outline-none text-sm" /></div>{/if}
    {#if activeParams.includes('climbingStyle')}
      <div class="space-y-1.5">
        <p class="text-[9px] font-bold text-content-subtle uppercase tracking-widest ml-1">Climbing Style</p>
        <div class="flex flex-wrap gap-2">
          {#each climbingStyles as style}
            <button
              type="button"
              onclick={() => {
                if (climbingStyle.includes(style)) {
                  climbingStyle = climbingStyle.filter(s => s !== style);
                } else {
                  climbingStyle = [...climbingStyle, style];
                }
              }}
              class="px-3 py-1.5 rounded-xl border text-xs font-bold tracking-widest transition-all {climbingStyle.includes(style) ? 'bg-primary-hover border-primary text-white' : 'bg-surface-elevated border-border-strong text-content-muted hover:text-content'}"
            >
              {style}
            </button>
          {/each}
        </div>
      </div>
    {/if}
    {#if activeParams.includes('boardType')}<div class="space-y-1.5"><label for="ex-board-type" class="text-[9px] font-bold text-content-subtle uppercase tracking-widest ml-1">Board Type</label><select id="ex-board-type" bind:value={boardType} class="w-full bg-surface-elevated text-content p-3.5 rounded-xl border border-border-strong outline-none text-sm">{#each boardTypes as type} <option value={type}>{type}</option> {/each}</select></div>{/if}
    {#if activeParams.includes('boardAngle')}<div class="space-y-1.5"><label for="ex-board-angle" class="text-[9px] font-bold text-content-subtle uppercase tracking-widest ml-1">Board Angle (°)</label><select id="ex-board-angle" bind:value={boardAngle} class="w-full bg-surface-elevated text-content p-3.5 rounded-xl border border-border-strong outline-none text-sm">{#each boardAngles as angle} <option value={angle}>{angle}°</option> {/each}</select></div>{/if}

    <div class="grid grid-cols-2 gap-3">
      {#if activeParams.includes('sets')}<div class="space-y-1.5"><label for="ex-sets" class="text-[9px] font-bold text-content-subtle uppercase tracking-widest ml-1">Sets</label><input id="ex-sets" type="number" bind:value={sets} class="w-full bg-surface-elevated text-content p-3.5 rounded-xl border border-border-strong outline-none text-sm {validationErrors.sets ? 'border-danger/50' : ''}" />{#if validationErrors.sets}<p class="text-[9px] font-bold text-danger uppercase tracking-widest ml-1">{validationErrors.sets}</p>{/if}</div>{/if}
      {#if activeParams.includes('reps')}<div class="space-y-1.5"><label for="ex-reps" class="text-[9px] font-bold text-content-subtle uppercase tracking-widest ml-1">Reps</label><input id="ex-reps" type="number" bind:value={reps} class="w-full bg-surface-elevated text-content p-3.5 rounded-xl border border-border-strong outline-none text-sm" /></div>{/if}
      {#if activeParams.includes('movesPerRoute')}<div class="space-y-1.5"><label for="ex-moves" class="text-[9px] font-bold text-content-subtle uppercase tracking-widest ml-1">Moves per route</label><input id="ex-moves" type="number" bind:value={movesPerRoute} class="w-full bg-surface-elevated text-content p-3.5 rounded-xl border border-border-strong outline-none text-sm" /></div>{/if}
    </div>
    {#if activeParams.includes('holdType')}<div class="space-y-1.5"><label for="ex-hold" class="text-[9px] font-bold text-content-subtle uppercase tracking-widest ml-1">Hold Type</label><select id="ex-hold" bind:value={holdType} class="w-full bg-surface-elevated text-content p-3.5 rounded-xl border border-border-strong outline-none text-sm">{#each holdTypes as h} <option value={h}>{h}</option> {/each}</select></div>{/if}
    {#if activeParams.includes('timeOn')}<div class="space-y-1.5"><label for="ex-on" class="text-[9px] font-bold text-content-subtle uppercase tracking-widest ml-1">Time On (s)</label><input id="ex-on" type="number" bind:value={timeOn} class="w-full bg-surface-elevated text-content p-3.5 rounded-xl border border-border-strong outline-none text-sm" /></div>{/if}
    {#if activeParams.includes('timeOff')}<div class="space-y-1.5"><label for="ex-off" class="text-[9px] font-bold text-content-subtle uppercase tracking-widest ml-1">Time Off (s)</label><input id="ex-off" type="number" bind:value={timeOff} class="w-full bg-surface-elevated text-content p-3.5 rounded-xl border border-border-strong outline-none text-sm" /></div>{/if}
    {#if activeParams.includes('restTime')}<div class="space-y-1.5"><label for="ex-rest" class="text-[9px] font-bold text-content-subtle uppercase tracking-widest ml-1">Between Sets (s)</label><input id="ex-rest" type="number" bind:value={timeBetweenSets} class="w-full bg-surface-elevated text-content p-3.5 rounded-xl border border-border-strong outline-none text-sm" /></div>{/if}
    {#if activeParams.includes('holdSize')}<div class="space-y-1.5"><label for="ex-size" class="text-[9px] font-bold text-content-subtle uppercase tracking-widest ml-1">Hold Size (mm)</label><input id="ex-size" type="number" bind:value={holdSize} class="w-full bg-surface-elevated text-content p-3.5 rounded-xl border border-border-strong outline-none text-sm {validationErrors.holdSize ? 'border-danger/50' : ''}" />{#if validationErrors.holdSize}<p class="text-[9px] font-bold text-danger uppercase tracking-widest ml-1">{validationErrors.holdSize}</p>{/if}</div>{/if}
    {#if activeParams.includes('weight')}<div class="space-y-1.5"><label for="ex-weight" class="text-[9px] font-bold text-content-subtle uppercase tracking-widest ml-1">Weight (kg)</label><input id="ex-weight" type="number" bind:value={weight} class="w-full bg-surface-elevated text-content p-3.5 rounded-xl border border-border-strong outline-none text-sm" placeholder="e.g. 10" /></div>{/if}
    {#if activeParams.includes('bodyweightPercent')}<div class="space-y-4 pt-1"><label for="ex-bw" class="flex justify-between text-[9px] font-bold text-content-subtle uppercase tracking-widest ml-1"><span>Added Weight (% of BW)</span><span class="text-blue-500 font-mono text-[10px]">{bodyweightPercent}%</span></label><input id="ex-bw" type="range" min="50" max="220" bind:value={bodyweightPercent} class="w-full h-1.5 bg-surface-elevated rounded-lg appearance-none cursor-pointer accent-blue-500" /><div class="flex justify-between text-[8px] text-content-muted px-1 mt-1"><span>50%</span><span>100% (BW)</span><span>220%</span></div></div>{/if}
    {#if activeParams.includes('maxWeightPercent')}<div class="space-y-4 pt-1"><label for="ex-mw" class="flex justify-between text-[9px] font-bold text-content-subtle uppercase tracking-widest ml-1"><span>Load (% of Max)</span><span class="text-emerald-500 font-mono text-[10px]">{maxWeightPercent}%</span></label><input id="ex-mw" type="range" min="10" max="150" bind:value={maxWeightPercent} class="w-full h-1.5 bg-surface-elevated rounded-lg appearance-none cursor-pointer accent-emerald-500" /><div class="flex justify-between text-[8px] text-content-muted px-1 mt-1"><span>10%</span><span>100% (Max)</span><span>150%</span></div></div>{/if}
    {#if activeParams.includes('distance')}<div class="space-y-1.5"><label for="ex-distance" class="text-[9px] font-bold text-content-subtle uppercase tracking-widest ml-1">Distance (km)</label><input id="ex-distance" type="number" step="0.1" bind:value={distance} class="w-full bg-surface-elevated text-content p-3.5 rounded-xl border border-border-strong outline-none text-sm" /></div>{/if}
    {#if activeParams.includes('campusStyle')}<div class="space-y-1.5"><label for="ex-campus" class="text-[9px] font-bold text-content-subtle uppercase tracking-widest ml-1">Campus Style</label><select id="ex-campus" bind:value={campusType} class="w-full bg-surface-elevated text-content p-3.5 rounded-xl border border-border-strong outline-none text-sm">{#each campusStyles as c} <option value={c}>{c}</option> {/each}</select></div>{/if}
    {#if activeParams.includes('mobilityType')}
      <div class="space-y-1.5">
        <p class="text-[9px] font-bold text-content-subtle uppercase tracking-widest ml-1">Mobility Focus</p>
        <div class="flex flex-wrap gap-2">
          {#each mobilityTypes as type}
            <button
              type="button"
              onclick={() => {
                if (mobilityType.includes(type)) {
                  mobilityType = mobilityType.filter(t => t !== type);
                } else {
                  mobilityType = [...mobilityType, type];
                }
              }}
              class="px-3 py-1.5 rounded-xl border text-xs font-bold tracking-widest transition-all {mobilityType.includes(type) ? 'bg-primary-hover border-primary text-white' : 'bg-surface-elevated border-border-strong text-content-muted hover:text-content'}"
            >
              {type}
            </button>
          {/each}
        </div>
      </div>
    {/if}
    {#if activeParams.includes('leadStyle')}
      <div class="space-y-1.5">
        <p class="text-[9px] font-bold text-content-subtle uppercase tracking-widest ml-1">Style</p>
        <div class="flex flex-wrap gap-2">
          {#each leadStyles as style}
            <button
              type="button"
              onclick={() => {
                if (leadStyle.includes(style)) {
                  leadStyle = leadStyle.filter(s => s !== style);
                } else {
                  leadStyle = [...leadStyle, style];
                }
              }}
              class="px-3 py-1.5 rounded-xl border text-xs font-bold tracking-widest transition-all {leadStyle.includes(style) ? 'bg-primary-hover border-primary text-white' : 'bg-surface-elevated border-border-strong text-content-muted hover:text-content'}"
            >
              {style}
            </button>
          {/each}
        </div>
      </div>
    {/if}
    {#if activeParams.includes('difficulty')}<div class="space-y-4 pt-1"><label for="ex-diff" class="flex justify-between text-[9px] font-bold text-content-subtle uppercase tracking-widest ml-1"><span>Difficulty</span><span class="text-primary font-mono text-[10px]">{difficulty}/10</span></label><input id="ex-diff" type="range" min="1" max="10" bind:value={difficulty} class="w-full h-1.5 bg-surface-elevated rounded-lg appearance-none cursor-pointer accent-blue-500" /></div>{/if}
    {#if activeParams.includes('routeDifficulty')}<div class="space-y-1.5"><label for="ex-route-diff" class="text-[9px] font-bold text-content-subtle uppercase tracking-widest ml-1">Route Difficulty</label><select id="ex-route-diff" bind:value={routeDifficulty} class="w-full bg-surface-elevated text-content p-3.5 rounded-xl border border-border-strong outline-none text-sm appearance-none cursor-pointer"><option value="Easy">Easy</option><option value="Moderate">Moderate</option><option value="Hard">Hard</option></select></div>{/if}

    <details class="group border-t border-border/50 pt-4">
      <summary class="flex justify-between items-center cursor-pointer list-none text-[10px] font-black text-content-subtle hover:text-content uppercase tracking-widest outline-none transition-colors">
        <span>Customize Tracked Fields</span>
        <Icon icon="ic:baseline-keyboard-arrow-down" class="text-lg group-open:rotate-180 transition-transform" />
      </summary>
      <div class="grid grid-cols-2 gap-2 mt-4 animate-in fade-in slide-in-from-top-2 duration-300">
        {#each activeTypeDef?.possibleParameters || activeTypeDef?.parameters || [] as id}
          <button
            type="button"
            onclick={() => {
              if (activeParams.includes(id)) {
                activeParams = activeParams.filter(p => p !== id);
              } else {
                activeParams = [...activeParams, id];
              }
            }}
            class="px-3 py-2 rounded-lg text-[9px] font-bold border transition-all flex items-center gap-2 {activeParams.includes(id) ? 'bg-primary-hover/10 border-primary/50 text-primary-hover' : 'bg-surface border-border text-content-subtle'}"
          >
            <Icon icon={activeParams.includes(id) ? 'ic:baseline-check-box' : 'ic:baseline-check-box-outline-blank'} class="text-sm" />
            <span class="text-left flex-1">{PARAMETER_LABELS[id] || id}</span>
          </button>
        {/each}
      </div>
    </details>

    <div class="space-y-1.5 pt-4 border-t border-border/50">
      <label for="ex-category" class="text-[9px] font-bold text-content-subtle uppercase tracking-widest ml-1">Analytics Type</label>
      <select id="ex-category" bind:value={categoryOverride} class="w-full bg-surface-elevated/50 text-content p-3.5 rounded-xl border border-border-strong outline-none text-sm appearance-none cursor-pointer">
        <option value="">Default ({activeTypeDef?.category || 'Other'})</option>
        {#each trainingState.analyticsCategories as cat}
          <option value={cat.id}>{cat.name}</option>
        {/each}
      </select>
    </div>

    <div class="space-y-1.5 pt-4 border-t border-border/50">
      <label for="ex-notes" class="text-[9px] font-bold text-content-subtle uppercase tracking-widest ml-1">Exercise Notes</label>
      <textarea id="ex-notes" bind:value={notes} placeholder="Focus on footwork..." class="w-full bg-surface-elevated/50 text-content p-3.5 rounded-xl border border-border-strong outline-none transition-all placeholder:text-content-subtle text-sm" rows="2"></textarea>
    </div>

    <div class="space-y-4 pt-4 border-t border-border/50">
      <label for="ex-planned-load" class="flex justify-between text-[9px] font-bold text-success uppercase tracking-widest ml-1">
        <span>Target Intensity / Load</span>
        <span class="text-success font-mono text-[10px]">{plannedLoad}/10</span>
      </label>
      <input id="ex-planned-load" type="range" min="1" max="10" bind:value={plannedLoad} class="w-full h-1.5 bg-surface-elevated rounded-lg appearance-none cursor-pointer accent-emerald-500" />
      <p class="text-[8px] text-content-subtle italic ml-1 leading-relaxed">Estimated stress for this specific exercise.</p>
    </div>
  </div>

  <button
    onclick={handleSubmit}
    disabled={!isValid}
    class="w-full bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold py-4 rounded-2xl shadow-xl shadow-blue-900/20 transition-all active:scale-[0.98]"
  >
    {initialSlot ? 'Update Exercise' : 'Add Exercise'}
  </button>
</div>
