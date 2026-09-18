<script lang="ts">
  import { onMount } from 'svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { type Workout, calculateLoadFactor } from '../../lib/types';
  import { generateId } from '../../lib/utils';

  // --- Props ---
  let { 
    duration = 0,
    initialData = null,
    onConfirm
  } = $props<{ 
    duration: number,
    initialData?: Partial<Workout> | null,
    onConfirm: (data: Partial<Workout>) => void
  }>();

  // --- State ---
  let fingers = $state(5);
  let core = $state(5);
  let systemic = $state(5);
  let notes = $state('');

  // --- Pain/discomfort logging (PLAN.md Phase 4 - the workout-completion
  // flow is the natural entry point, since severity/weekId are already at
  // hand here). Purely optional and additive to the fatigue rating above -
  // it writes its own PainLog, it never affects loadFactor/fatigue.
  let showPainLog = $state(false);
  let painBodyPart = $state('');
  let painSeverity = $state(5);
  let painNotes = $state('');

  $effect(() => {
    if (trainingState.showFatigue && initialData) {
      fingers = initialData.fingers ?? 5;
      core = initialData.core ?? 5;
      systemic = initialData.systemic ?? 5;
      
      const genericNames = ['New Session', 'New Default Workout'];
      notes = genericNames.includes(initialData.notes || '') ? '' : (initialData.notes ?? '');
    }
  });

  const loadFactor = $derived(calculateLoadFactor(duration, fingers, core, systemic));

  async function handleSave() {
    if (showPainLog && painBodyPart.trim()) {
      await trainingState.savePainLog({
        id: generateId(),
        date: initialData?.date || new Date().toISOString(),
        weekId: initialData?.weekId || '',
        bodyPart: painBodyPart.trim(),
        severity: painSeverity,
        notes: painNotes || undefined,
      });
    }
    onConfirm({ fingers, core, systemic, notes, loadFactor });
  }
</script>

{#if trainingState.showFatigue}
  <div class="fixed inset-0 bg-app-bg/90 flex items-end sm:items-center justify-center p-0 sm:p-4 z-[100] backdrop-blur-md transition-all duration-300">
    <div class="bg-surface w-full max-w-lg rounded-t-2xl sm:rounded-card border-t sm:border border-border p-5 shadow-2xl animate-in slide-in-from-bottom-full duration-300">
      <div class="w-10 h-1 bg-surface-elevated rounded-full mx-auto mb-6 sm:hidden"></div>
      
      <div class="flex items-center justify-between mb-6 px-1">
        <div class="min-w-0 flex-1">
          <h3 class="text-title text-content">Post-Session</h3>
          <p class="text-content-subtle text-caption mt-0.5">Rate Perceived Exertion</p>
        </div>
        <div class="bg-primary-hover/10 p-2.5 rounded-control flex-shrink-0 ml-4">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
      </div>

      <div class="space-y-4">
        <div class="space-y-3">
          <label for="fingers-range" class="flex justify-between text-label text-content-subtle ml-1">
            <span>Fingers/Arms</span>
            <span class="text-primary font-mono text-caption tabular-nums">{fingers}/10</span>
          </label>
          <input id="fingers-range" type="range" min="1" max="10" bind:value={fingers} class="w-full h-1.5 bg-surface-elevated rounded-control appearance-none cursor-pointer accent-primary" />
        </div>

        <div class="space-y-3">
          <label for="core-range" class="flex justify-between text-label text-content-subtle ml-1">
            <span>Core</span>
            <span class="text-primary font-mono text-caption tabular-nums">{core}/10</span>
          </label>
          <input id="core-range" type="range" min="1" max="10" bind:value={core} class="w-full h-1.5 bg-surface-elevated rounded-control appearance-none cursor-pointer accent-primary" />
        </div>

        <div class="space-y-3">
          <label for="systemic-range" class="flex justify-between text-label text-content-subtle ml-1">
            <span>General Systemic</span>
            <span class="text-primary font-mono text-caption tabular-nums">{systemic}/10</span>
          </label>
          <input id="systemic-range" type="range" min="1" max="10" bind:value={systemic} class="w-full h-1.5 bg-surface-elevated rounded-control appearance-none cursor-pointer accent-primary" />
        </div>

        <div class="space-y-2">
          <label for="fatigue-notes" class="text-label text-content-subtle ml-1">Notes</label>
          <textarea id="fatigue-notes" bind:value={notes} placeholder="Notes..." class="w-full bg-surface-elevated/50 text-content p-3.5 rounded-control border border-border focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all placeholder:text-content-subtle text-sm" rows="2"></textarea>
        </div>

        <div class="border-t border-border pt-4">
          <button type="button" onclick={() => showPainLog = !showPainLog} class="flex items-center justify-between w-full text-left">
            <span class="text-label text-content-subtle ml-1">Log Pain / Discomfort (optional)</span>
            <span class="text-content-subtle text-lg leading-none">{showPainLog ? '−' : '+'}</span>
          </button>

          {#if showPainLog}
            <div class="mt-3 space-y-3 animate-in fade-in">
              <input bind:value={painBodyPart} placeholder="Body part (e.g. Left A2 pulley)" class="w-full bg-surface-elevated/50 text-content p-3 rounded-control border border-border outline-none text-sm placeholder:text-content-subtle" />
              <div class="space-y-1">
                <label for="pain-severity-range" class="flex justify-between text-label text-content-subtle ml-1">
                  <span>Severity</span>
                  <span class="text-primary font-mono text-caption tabular-nums">{painSeverity}/10</span>
                </label>
                <input id="pain-severity-range" type="range" min="1" max="10" bind:value={painSeverity} class="w-full h-1.5 bg-surface-elevated rounded-control appearance-none cursor-pointer accent-primary" />
              </div>
              <input bind:value={painNotes} placeholder="Notes (optional)" class="w-full bg-surface-elevated/50 text-content p-3 rounded-control border border-border outline-none text-sm placeholder:text-content-subtle" />
            </div>
          {/if}
        </div>
      </div>

      <div class="mt-6 p-5 bg-primary-hover/5 rounded-card border border-primary/10 flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <div class="bg-primary-hover w-1.5 h-1.5 rounded-full animate-pulse"></div>
          <span class="text-label text-content-muted">Total Load</span>
        </div>
        <span class="text-metric text-content tabular-nums">{Math.round(loadFactor)}</span>
      </div>

      <div class="grid grid-cols-1 gap-3 mt-6">
        <button
          onclick={handleSave}
          class="w-full bg-primary hover:bg-primary-hover text-white font-bold py-4 rounded-control shadow-xl shadow-primary/20 transition-all active:scale-[0.98] text-sm"
        >
          Complete & Save
        </button>
        <button 
          onclick={() => trainingState.closeFatigueModal()}
          class="w-full bg-surface-elevated hover:bg-surface-elevated-hover text-content-muted font-bold py-3 rounded-control transition-all active:scale-[0.98] text-xs"
        >
          Back to Session
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  input[type='range']::-webkit-slider-thumb {
    width: 24px;
    height: 24px;
    border: 4px solid var(--theme-surface);
    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  }
</style>
