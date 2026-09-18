<script lang="ts">
  import { trainingState } from '../../lib/state.svelte';
  import { showAlert } from '../../lib/utils';
  import type { ExerciseSlot } from '../../lib/types';
  import {
    parseAIPlanOutput,
    parseAIWorkoutLogOutput,
    AI_WORKOUT_LOG_OUTPUT_INSTRUCTIONS,
  } from '../../lib/ai/schema';
  import {
    buildPlanPreview,
    buildPlanCommit,
    normalizeName,
    type NameMapping,
  } from '../../lib/ai/planImport';
  import { buildWorkoutLogPreview, buildWorkoutLogCommit } from '../../lib/ai/workoutLogImport';
  import Icon from '@iconify/svelte';

  // --- Props ---
  // "plan" commits directly (new TrainingBlocks + Workouts, via the normal
  // planningStore/workoutStore services) - the whole-calendar import.
  // "workoutLog" hands resolved ExerciseSlot[] back to the caller instead of
  // writing anything itself, since it targets one already-open workout in
  // WorkoutForm.svelte, which isn't saved to storage until the user finishes
  // that form - see PLAN.md's "reuse the pipeline...targeting a single
  // workout's exercises instead of a whole plan."
  let {
    onClose,
    mode = 'plan',
    bucket = 'prescribed',
    onImportWorkoutLog,
  } = $props<{
    onClose: () => void;
    mode?: 'plan' | 'workoutLog';
    bucket?: 'prescribed' | 'logged';
    onImportWorkoutLog?: (slots: ExerciseSlot[]) => void;
  }>();

  // --- State ---
  let pasteText = $state('');
  let exerciseTypeMapping = $state<Record<string, NameMapping>>({});
  let phaseMapping = $state<Record<string, NameMapping>>({});
  let committing = $state(false);
  let showInstructions = $state(false);

  // --- Parsing (validate on every keystroke - cheap, and lets the preview/
  // error list update live rather than only on an explicit "Parse" click) ---
  const planResult = $derived(mode === 'plan' && pasteText.trim() ? parseAIPlanOutput(pasteText) : null);
  const logResult = $derived(mode === 'workoutLog' && pasteText.trim() ? parseAIWorkoutLogOutput(pasteText) : null);

  const planPreview = $derived(
    planResult?.valid && planResult.data
      ? buildPlanPreview(planResult.data, { exerciseTypes: trainingState.exerciseTypes, phaseDefs: trainingState.phaseDefs })
      : null,
  );
  const logPreview = $derived(
    logResult?.valid && logResult.data ? buildWorkoutLogPreview(logResult.data, trainingState.exerciseTypes) : null,
  );

  // Default every newly-seen unresolved name to "create" so the preview
  // always has a well-defined mapping to show/commit - the user can still
  // change any of them to "map to existing" before confirming. Never
  // resets a choice the user already made for a name still present.
  $effect(() => {
    const unresolvedExerciseNames = planPreview?.unresolvedExerciseTypeNames ?? logPreview?.unresolvedExerciseTypeNames ?? [];
    for (const name of unresolvedExerciseNames) {
      const key = normalizeName(name);
      if (!(key in exerciseTypeMapping)) exerciseTypeMapping[key] = { action: 'create' };
    }
  });
  $effect(() => {
    for (const name of planPreview?.unresolvedPhaseNames ?? []) {
      const key = normalizeName(name);
      if (!(key in phaseMapping)) phaseMapping[key] = { action: 'create' };
    }
  });

  const canConfirm = $derived.by(() => {
    if (mode === 'plan') return !!planResult?.valid && !!planPreview && planPreview.totalWorkouts > 0;
    return !!logResult?.valid && !!logPreview && logPreview.totalExercises > 0;
  });

  function mappingSelectValue(mapping: NameMapping | undefined): string {
    return mapping?.action === 'map' ? mapping.id : 'create';
  }

  function setExerciseMapping(name: string, value: NameMapping) {
    exerciseTypeMapping[normalizeName(name)] = value;
  }
  function setPhaseMapping(name: string, value: NameMapping) {
    phaseMapping[normalizeName(name)] = value;
  }

  async function handleCopyInstructions() {
    await navigator.clipboard.writeText(AI_WORKOUT_LOG_OUTPUT_INSTRUCTIONS);
    await showAlert('Copied!', 'Paste this into your preferred AI, then paste your own training notes after it. Paste the JSON it replies with back here.');
  }

  async function handleConfirm() {
    committing = true;
    try {
      if (mode === 'plan') {
        if (!planResult?.data) return;
        const commit = buildPlanCommit(
          planResult.data,
          { exerciseTypes: exerciseTypeMapping, phases: phaseMapping },
          { exerciseTypes: trainingState.exerciseTypes, phaseDefs: trainingState.phaseDefs, analyticsCategories: trainingState.analyticsCategories },
        );
        if (commit.newExerciseTypes.length) {
          await trainingState.updateExerciseTypes([...trainingState.exerciseTypes, ...commit.newExerciseTypes]);
        }
        if (commit.newPhaseDefs.length) {
          await trainingState.updatePhaseDefs([...trainingState.phaseDefs, ...commit.newPhaseDefs]);
        }
        for (const block of commit.trainingBlocks) {
          await trainingState.saveTrainingBlock(block);
        }
        for (const workout of commit.workouts) {
          await trainingState.saveWorkout(workout);
        }
        await showAlert(
          'Import Complete',
          `Added ${commit.workouts.length} workout(s) across ${commit.trainingBlocks.length} training block(s)${commit.newExerciseTypes.length ? `, created ${commit.newExerciseTypes.length} new exercise type(s)` : ''}.`,
        );
      } else {
        if (!logResult?.data) return;
        const commit = buildWorkoutLogCommit(
          logResult.data,
          { exerciseTypes: exerciseTypeMapping },
          { exerciseTypes: trainingState.exerciseTypes, analyticsCategories: trainingState.analyticsCategories },
          bucket,
        );
        if (commit.newExerciseTypes.length) {
          await trainingState.updateExerciseTypes([...trainingState.exerciseTypes, ...commit.newExerciseTypes]);
        }
        onImportWorkoutLog?.(commit.slots);
      }
      onClose();
    } catch (err: any) {
      await showAlert('Import Failed', err?.message || 'Something went wrong committing the import.');
    } finally {
      committing = false;
    }
  }

  const issues = $derived(planResult?.issues ?? logResult?.issues ?? []);
</script>

<div class="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center bg-background/80 backdrop-blur-md animate-in fade-in duration-300 p-0 sm:p-4 pb-[80px]">
  <div class="absolute inset-0" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()} role="button" tabindex="0" aria-label="Close AI Import"></div>

  <div class="relative w-full sm:max-w-lg bg-surface border-t sm:border border-border-strong rounded-t-2xl sm:rounded-card shadow-2xl flex flex-col max-h-[85vh]">
    <div class="p-5 border-b border-border-strong flex items-center justify-between shrink-0">
      <div>
        <h2 class="text-title text-content flex items-center gap-2">
          <Icon icon="ic:baseline-auto-awesome" class="text-primary text-xl" />
          {mode === 'plan' ? 'Import AI Plan' : 'Import AI Workout Log'}
        </h2>
        <p class="text-caption text-content-subtle mt-1">Paste JSON - nothing is saved until you confirm</p>
      </div>
      <button onclick={onClose} class="p-2 text-content-muted hover:text-content bg-surface-elevated/50 hover:bg-surface-elevated rounded-control transition-all"><Icon icon="ic:baseline-close" class="text-lg" /></button>
    </div>

    <div class="p-5 overflow-y-auto custom-scrollbar flex-1 space-y-4">
      {#if mode === 'workoutLog'}
        <div class="space-y-2">
          <button onclick={() => showInstructions = !showInstructions} class="text-label text-primary flex items-center gap-1">
            <Icon icon="ic:baseline-info" class="text-sm" /> How does this work?
          </button>
          {#if showInstructions}
            <div class="p-3.5 bg-surface-elevated/50 border border-border-strong rounded-control text-body text-content-muted space-y-2">
              <p>Copy the instructions below, paste them into any AI chat followed by your own free-text training notes ("did 5x hangboard sets, 30 min bouldering..."), then paste the AI's JSON reply into the box below.</p>
              <button onclick={handleCopyInstructions} class="text-label text-primary flex items-center gap-1">
                <Icon icon="ic:baseline-content-copy" class="text-sm" /> Copy Instructions
              </button>
            </div>
          {/if}
        </div>
      {/if}

      <div class="space-y-1.5">
        <label for="ai-import-paste" class="text-label text-content-subtle ml-1">Paste JSON Here</label>
        <textarea
          id="ai-import-paste"
          bind:value={pasteText}
          rows="6"
          placeholder={mode === 'plan' ? 'Paste the JSON your AI generated...' : 'Paste the structured workout JSON your AI generated...'}
          class="w-full bg-surface-elevated text-content p-3.5 rounded-control border border-border-strong outline-none text-xs font-mono resize-none"
        ></textarea>
      </div>

      {#if pasteText.trim() && issues.length > 0}
        <div class="p-3.5 bg-danger/10 border border-danger/30 rounded-control space-y-1.5">
          <p class="text-label text-danger flex items-center gap-1.5">
            <Icon icon="ic:baseline-error-outline" class="text-sm" /> Couldn't validate this JSON
          </p>
          <ul class="text-body text-content-muted space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
            {#each issues as issue}
              <li>{issue.path ? `${issue.path}: ` : ''}{issue.message}</li>
            {/each}
          </ul>
        </div>
      {/if}

      {#if mode === 'plan' && planPreview}
        <div class="space-y-3">
          <p class="text-label text-content-subtle">
            Preview - {planPreview.weeks.length} week(s), {planPreview.totalWorkouts} workout(s), {planPreview.totalExercises} exercise(s)
          </p>
          <div class="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar">
            {#each planPreview.weeks as week}
              <div class="flex items-center justify-between px-3 py-2 bg-surface-elevated/50 rounded-control text-body">
                <span class="font-bold text-content">{week.weekId}</span>
                <span class="flex items-center gap-1.5 {week.phaseResolved ? 'text-content-muted' : 'text-warning'}">
                  {#if !week.phaseResolved}<Icon icon="ic:baseline-warning" class="text-sm" />{/if}
                  {week.phaseName}
                </span>
                <span class="text-content-subtle">{week.workoutCount} workout(s)</span>
              </div>
            {/each}
          </div>

          {#if planPreview.unresolvedPhaseNames.length > 0}
            <div class="space-y-2">
              <p class="text-label text-warning">Unresolved Phases</p>
              {#each planPreview.unresolvedPhaseNames as name}
                <div class="flex items-center justify-between gap-2 px-1">
                  <span class="text-body text-content truncate">{name}</span>
                  <select
                    value={mappingSelectValue(phaseMapping[normalizeName(name)])}
                    onchange={(e) => {
                      const v = e.currentTarget.value;
                      setPhaseMapping(name, v === 'create' ? { action: 'create' } : { action: 'map', id: v });
                    }}
                    class="bg-surface-elevated text-content text-xs p-2 rounded-control border border-border-strong outline-none"
                  >
                    <option value="create">+ Create new phase "{name}"</option>
                    {#each trainingState.phaseDefs.filter(p => !p.archived) as phase}
                      <option value={phase.id}>Use "{phase.name}"</option>
                    {/each}
                  </select>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      {#if mode === 'workoutLog' && logPreview}
        <div class="space-y-3">
          <p class="text-label text-content-subtle">
            Preview - {logPreview.workouts.length} workout(s), {logPreview.totalExercises} exercise(s) will be added to this session
          </p>
        </div>
      {/if}

      {#if (planPreview?.unresolvedExerciseTypeNames.length ?? logPreview?.unresolvedExerciseTypeNames.length ?? 0) > 0}
        <div class="space-y-2">
          <p class="text-label text-warning">Unresolved Exercise Types</p>
          {#each (planPreview?.unresolvedExerciseTypeNames ?? logPreview?.unresolvedExerciseTypeNames ?? []) as name}
            <div class="flex items-center justify-between gap-2 px-1">
              <span class="text-body text-content truncate">{name}</span>
              <select
                value={mappingSelectValue(exerciseTypeMapping[normalizeName(name)])}
                onchange={(e) => {
                  const v = e.currentTarget.value;
                  setExerciseMapping(name, v === 'create' ? { action: 'create' } : { action: 'map', id: v });
                }}
                class="bg-surface-elevated text-content text-xs p-2 rounded-control border border-border-strong outline-none"
              >
                <option value="create">+ Create new type "{name}"</option>
                {#each trainingState.exerciseTypes.filter(t => !t.archived) as type}
                  <option value={type.id}>Use "{type.name}"</option>
                {/each}
              </select>
            </div>
          {/each}
        </div>
      {/if}

      <button
        onclick={handleConfirm}
        disabled={!canConfirm || committing}
        class="w-full py-4 bg-primary hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-control shadow-lg transition-transform active:scale-[0.98] flex items-center justify-center gap-2"
      >
        <Icon icon={committing ? 'ic:baseline-hourglass-empty' : 'ic:baseline-check'} />
        {committing ? 'Importing...' : 'Confirm Import'}
      </button>
    </div>
  </div>
</div>
