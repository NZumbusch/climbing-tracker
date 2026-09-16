<script lang="ts">
  import { trainingState } from '../../lib/state.svelte';
  import { storage } from '../../lib/storage';
  import { getWeekId } from '../../lib/dateUtils';
  import { showAlert } from '../../lib/utils';
  import { slotValues, slotTypeName } from '../../lib/exerciseSlot';
  import Icon from '@iconify/svelte';

  let { onClose } = $props<{ onClose: () => void }>();

  let startWeek = $state(trainingState.currentWeekId);
  let endWeek = $state(trainingState.currentWeekId);
  let goal = $state('');
  let mode = $state<'generate' | 'analyze'>('generate');

  const weekOptions = $derived.by(() => {
    const opts = [];
    for (let i = -5; i <= 24; i++) {
      const d = new Date();
      d.setDate(d.getDate() + (i * 7));
      const id = getWeekId(d);
      opts.push({ id, label: `Week ${id.split('-W')[1]} (${d.getUTCFullYear()})` + (i === 0 ? ' - Current' : '') });
    }
    return opts;
  });

  async function handleCopyPrompt() {
    try {
      const data = await storage.exportData();
      
      const targetWeekIds: string[] = [];
      const [startYearStr, startWeekStr] = startWeek.split('-W');
      let currentYear = parseInt(startYearStr);
      let currentWeek = parseInt(startWeekStr);

      const [endYearStr, endWeekStr] = endWeek.split('-W');
      const targetEndYear = parseInt(endYearStr);
      const targetEndWeek = parseInt(endWeekStr);

      if (currentYear > targetEndYear || (currentYear === targetEndYear && currentWeek > targetEndWeek)) {
        await showAlert('Input Error', 'Start week must be before or equal to end week.');
        return;
      }

      while (currentYear < targetEndYear || (currentYear === targetEndYear && currentWeek <= targetEndWeek)) {
        targetWeekIds.push(`${currentYear}-W${currentWeek.toString().padStart(2, '0')}`);
        currentWeek++;
        if (currentWeek > 52) {
          currentWeek = 1;
          currentYear++;
        }
      }

      let prompt = '';

      if (mode === 'generate') {
        prompt = `You are an elite climbing coach. Design a highly detailed training plan based on my historical data.
I want an optimal week-by-week plan mapping phases to weeks, and giving detailed workouts with specific exercises from my exercise dictionary.

Target Timeframe:
Generate a plan spanning the following weeks: ${targetWeekIds.join(', ')}

My Goal & Notes for this cycle:
${goal || 'No specific goals provided. Optimize for general climbing performance.'}

Here is my condensed training profile:
- Custom Exercise Modalities:
${JSON.stringify(trainingState.exerciseTypes.map(e => ({ name: e.name, params: e.parameters })), null, 2)}

- Recent Workouts (Last 20):
${JSON.stringify((trainingState.workouts || []).slice(-20).map(w => ({ date: w.date, status: w.status, exercises: w.exercises.map(e => slotTypeName(e, trainingState.exerciseTypes)) })), null, 2)}

- Available Phases: ${trainingState.phaseDefs.filter(p => !p.archived).map(p => p.name).join(', ')}.

- My Benchmarks:
${JSON.stringify(trainingState.benchmarks || [], null, 2)}

Please provide a JSON or clear text format showing the phase for each week and the recommended default workouts (with exercises, sets, reps) for each day of those weeks.`;
      } else {
        const targetWorkouts = trainingState.workouts.filter(w => w.weekId && targetWeekIds.includes(w.weekId) && w.status === 'completed');
        const targetBenchmarks = trainingState.benchmarks.filter(b => b.weekId && targetWeekIds.includes(b.weekId));

        prompt = `You are an elite climbing coach. Please analyze my training data and performance from the specified timeframe and give me detailed feedback.

Target Timeframe Analysed:
${targetWeekIds.join(', ')}

My Goal & Notes for this cycle:
${goal || 'No specific goals provided. Just tell me what I did well and what I should change.'}

Here is the data for the weeks in question:
- Completed Workouts:
${JSON.stringify(targetWorkouts.map(w => ({ date: w.date, type: w.notes, load: w.plannedLoad, exercises: w.exercises.map(e => ({ type: slotTypeName(e, trainingState.exerciseTypes), duration: slotValues(e).duration, sets: slotValues(e).sets, reps: slotValues(e).reps })) })), null, 2)}

- Benchmarks Recorded:
${JSON.stringify(targetBenchmarks, null, 2)}

Based on this data, please evaluate:
1. Did I train the right things for my goals?
2. Was my training load and frequency appropriate?
3. What are my apparent strengths and weaknesses?
4. What actionable changes should I make for my next training cycle?`;
      }

      await navigator.clipboard.writeText(prompt);
      await showAlert('Copied!', 'Your detailed prompt and condensed context have been copied to the clipboard. Paste it into your preferred AI to generate a plan!');
      onClose();
    } catch (err: any) {
      await showAlert('Error', 'Failed to copy to clipboard: ' + err.message);
    }
  }
</script>

<div class="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center bg-background/80 backdrop-blur-md animate-in fade-in duration-300 p-0 sm:p-4 pb-[80px]">
  <!-- Clickable backdrop to close -->
  <div class="absolute inset-0" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()} role="button" tabindex="0" aria-label="Close AI Generator"></div>
  
  <div class="relative w-full sm:max-w-md bg-surface border-t sm:border border-border-strong rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[85vh]">
    <div class="p-6 border-b border-border-strong flex items-center justify-between shrink-0">
      <div>
        <h2 class="text-lg font-black text-content flex items-center gap-2">
          <Icon icon="ic:baseline-auto-awesome" class="text-primary text-xl" />
          AI Coach Prompt
        </h2>
        <p class="text-[10px] text-content-subtle mt-1 uppercase tracking-widest">Generate a prompt to copy/paste</p>
      </div>
      <button onclick={onClose} class="p-2 text-content-muted hover:text-content bg-surface-elevated/50 hover:bg-surface-elevated rounded-xl transition-all"><Icon icon="ic:baseline-close" class="text-lg" /></button>
    </div>

    <div class="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
      <div class="space-y-4">
        <div class="flex bg-surface-elevated/50 p-1 rounded-xl">
          <button onclick={() => mode = 'generate'} class="flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all {mode === 'generate' ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}">Generate Plan</button>
          <button onclick={() => mode = 'analyze'} class="flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all {mode === 'analyze' ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}">Analyze Past</button>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <label for="ai-start-week" class="text-[9px] font-bold text-content-subtle uppercase tracking-widest ml-1">Start Week</label>
            <select id="ai-start-week" bind:value={startWeek} class="w-full bg-surface-elevated text-content p-3.5 rounded-xl border border-border-strong outline-none text-sm appearance-none">
              {#each weekOptions as opt}
                <option value={opt.id}>{opt.label}</option>
              {/each}
            </select>
          </div>
          <div class="space-y-1.5">
            <label for="ai-end-week" class="text-[9px] font-bold text-content-subtle uppercase tracking-widest ml-1">End Week</label>
            <select id="ai-end-week" bind:value={endWeek} class="w-full bg-surface-elevated text-content p-3.5 rounded-xl border border-border-strong outline-none text-sm appearance-none">
              {#each weekOptions as opt}
                <option value={opt.id}>{opt.label}</option>
              {/each}
            </select>
          </div>
        </div>
        
        <div class="space-y-1.5">
          <label for="ai-goal" class="text-[9px] font-bold text-content-subtle uppercase tracking-widest ml-1">Your Goal / Notes</label>
          <textarea id="ai-goal" bind:value={goal} rows="4" placeholder="e.g. I want to prepare for a trip to Font in 4 weeks. Focus on Power Endurance and slopers." class="w-full bg-surface-elevated text-content p-3.5 rounded-xl border border-border-strong outline-none text-sm resize-none"></textarea>
        </div>
      </div>

      <button onclick={handleCopyPrompt} class="w-full py-4 bg-primary hover:bg-primary-hover text-white text-sm font-black tracking-widest uppercase rounded-2xl shadow-lg transition-transform active:scale-[0.98] flex items-center justify-center gap-2">
        <Icon icon="ic:baseline-content-copy" /> Copy Prompt
      </button>
    </div>
  </div>
</div>
