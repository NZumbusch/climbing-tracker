<script lang="ts">
  import { onMount } from 'svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { type Workout, calculateLoadFactor } from '../../lib/types';

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

  function handleSave() {
    onConfirm({ fingers, core, systemic, notes, loadFactor });
  }
</script>

{#if trainingState.showFatigue}
  <div class="fixed inset-0 bg-black/90 flex items-end sm:items-center justify-center p-0 sm:p-4 z-[100] backdrop-blur-md transition-all duration-300">
    <div class="bg-[#121214] w-full max-w-lg rounded-t-3xl sm:rounded-3xl border-t sm:border border-zinc-800 p-6 shadow-2xl animate-in slide-in-from-bottom-full duration-300">
      <div class="w-10 h-1 bg-zinc-800 rounded-full mx-auto mb-6 sm:hidden"></div>
      
      <div class="flex items-center justify-between mb-6 px-1">
        <div class="min-w-0 flex-1">
          <h3 class="text-xl font-bold text-white tracking-tight">Post-Session</h3>
          <p class="text-zinc-500 text-[10px] mt-0.5 uppercase tracking-widest">Rate Perceived Exertion</p>
        </div>
        <div class="bg-blue-500/10 p-2.5 rounded-xl flex-shrink-0 ml-4">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
      </div>
      
      <div class="space-y-6">
        <div class="space-y-3">
          <label for="fingers-range" class="flex justify-between text-[9px] font-bold text-zinc-500 uppercase tracking-widest ml-1">
            <span>Fingers/Arms</span>
            <span class="text-blue-500 font-mono text-[10px]">{fingers}/10</span>
          </label>
          <input id="fingers-range" type="range" min="1" max="10" bind:value={fingers} class="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500" />
        </div>

        <div class="space-y-3">
          <label for="core-range" class="flex justify-between text-[9px] font-bold text-zinc-500 uppercase tracking-widest ml-1">
            <span>Core</span>
            <span class="text-blue-500 font-mono text-[10px]">{core}/10</span>
          </label>
          <input id="core-range" type="range" min="1" max="10" bind:value={core} class="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500" />
        </div>

        <div class="space-y-3">
          <label for="systemic-range" class="flex justify-between text-[9px] font-bold text-zinc-500 uppercase tracking-widest ml-1">
            <span>General Systemic</span>
            <span class="text-blue-500 font-mono text-[10px]">{systemic}/10</span>
          </label>
          <input id="systemic-range" type="range" min="1" max="10" bind:value={systemic} class="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500" />
        </div>

        <div class="space-y-2">
          <label for="fatigue-notes" class="text-[9px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Notes</label>
          <textarea id="fatigue-notes" bind:value={notes} placeholder="Notes..." class="w-full bg-zinc-800/50 text-white p-3.5 rounded-xl border border-zinc-800 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all placeholder:text-zinc-600 text-sm" rows="2"></textarea>
        </div>
      </div>

      <div class="mt-6 p-5 bg-blue-500/5 rounded-2xl border border-blue-500/10 flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <div class="bg-blue-500 w-1.5 h-1.5 rounded-full animate-pulse"></div>
          <span class="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Total Load</span>
        </div>
        <span class="text-2xl font-black text-white tracking-tighter">{Math.round(loadFactor)}</span>
      </div>

      <div class="grid grid-cols-1 gap-3 mt-6">
        <button 
          onclick={handleSave}
          class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl shadow-xl shadow-blue-900/20 transition-all active:scale-[0.98] text-sm"
        >
          Complete & Save
        </button>
        <button 
          onclick={() => trainingState.closeFatigueModal()}
          class="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 font-bold py-3 rounded-xl transition-all active:scale-[0.98] text-xs"
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
    border: 4px solid #121214;
    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  }
</style>
