<script lang="ts">
  import { trainingState } from '../../lib/state.svelte';
  import { getWeekId, getWeekDateRange } from '../../lib/dateUtils';
  import { showAlert } from '../../lib/utils';
  import Icon from '@iconify/svelte';
  import html2pdf from 'html2pdf.js';

  let { onClose } = $props<{ onClose: () => void }>();

  let startWeek = $state(trainingState.currentWeekId);
  let endWeek = $state(trainingState.currentWeekId);
  let isGenerating = $state(false);
  let printContainer: HTMLDivElement | null = null;

  const weekOptions = $derived.by(() => {
    const opts = [];
    for (let i = -24; i <= 24; i++) {
      const d = new Date();
      d.setDate(d.getDate() + (i * 7));
      const id = getWeekId(d);
      opts.push({ id, label: `Week ${id.split('-W')[1]} (${d.getUTCFullYear()})` + (i === 0 ? ' - Current' : '') });
    }
    return opts;
  });

  const selectedWorkouts = $derived.by(() => {
    const targetWeekIds: string[] = [];
    const [startYearStr, startWeekStr] = startWeek.split('-W');
    let currentYear = parseInt(startYearStr);
    let currentWeek = parseInt(startWeekStr);

    const [endYearStr, endWeekStr] = endWeek.split('-W');
    const targetEndYear = parseInt(endYearStr);
    const targetEndWeek = parseInt(endWeekStr);

    if (currentYear > targetEndYear || (currentYear === targetEndYear && currentWeek > targetEndWeek)) {
      return []; // Invalid range
    }

    while (currentYear < targetEndYear || (currentYear === targetEndYear && currentWeek <= targetEndWeek)) {
      targetWeekIds.push(`${currentYear}-W${currentWeek.toString().padStart(2, '0')}`);
      currentWeek++;
      if (currentWeek > 52) {
        currentWeek = 1;
        currentYear++;
      }
    }

    // Group workouts by week
    const grouped: Record<string, any> = {};
    for (const w of targetWeekIds) {
      grouped[w] = trainingState.workouts.filter(wo => wo.weekId === w).sort((a, b) => {
        const orderA = a.dayOfWeek ? { 'Monday':0, 'Tuesday':1, 'Wednesday':2, 'Thursday':3, 'Friday':4, 'Saturday':5, 'Sunday':6 }[a.dayOfWeek] ?? 99 : 99;
        const orderB = b.dayOfWeek ? { 'Monday':0, 'Tuesday':1, 'Wednesday':2, 'Thursday':3, 'Friday':4, 'Saturday':5, 'Sunday':6 }[b.dayOfWeek] ?? 99 : 99;
        return orderA - orderB;
      });
    }

    return Object.entries(grouped).map(([weekId, workouts]) => {
      const phase = trainingState.periodization.find(p => p.weekId === weekId)?.phase || 'No Phase';
      return { weekId, phase, workouts };
    });
  });

  async function handleExport() {
    if (!printContainer) return;
    
    // Check range validity
    if (selectedWorkouts.length === 0) {
      await showAlert('Input Error', 'Start week must be before or equal to end week.');
      return;
    }

    isGenerating = true;

    try {
      const opt: any = {
        margin:       10,
        filename:     `training-plan-${startWeek}-to-${endWeek}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      // Ensure the container is temporarily visible to html2canvas, but hidden from viewport
      printContainer.style.display = 'block';
      await html2pdf().set(opt).from(printContainer).save();
    } catch (err: any) {
      console.error(err);
      await showAlert('Export Failed', 'An error occurred while generating the PDF: ' + err.message);
    } finally {
      if (printContainer) printContainer.style.display = 'none';
      isGenerating = false;
      onClose();
    }
  }
</script>

<div class="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center bg-background/80 backdrop-blur-md animate-in fade-in duration-300 p-0 sm:p-4 pb-[80px]">
  <div class="absolute inset-0" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()} role="button" tabindex="0" aria-label="Close PDF Export"></div>
  
  <div class="relative w-full sm:max-w-md bg-surface border-t sm:border border-border-strong rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[85vh]">
    <div class="p-6 border-b border-border-strong flex items-center justify-between shrink-0">
      <div>
        <h2 class="text-lg font-black text-content flex items-center gap-2">
          <Icon icon="ic:baseline-picture-as-pdf" class="text-primary text-xl" />
          Export to PDF
        </h2>
        <p class="text-[10px] text-content-subtle mt-1 uppercase tracking-widest">Printable training plan</p>
      </div>
      <button onclick={onClose} class="p-2 text-content-muted hover:text-content bg-surface-elevated/50 hover:bg-surface-elevated rounded-xl transition-all"><Icon icon="ic:baseline-close" class="text-lg" /></button>
    </div>

    <div class="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <label for="pdf-start-week" class="text-[9px] font-bold text-content-subtle uppercase tracking-widest ml-1">Start Week</label>
            <select id="pdf-start-week" bind:value={startWeek} class="w-full bg-surface-elevated text-content p-3.5 rounded-xl border border-border-strong outline-none text-sm appearance-none">
              {#each weekOptions as opt}
                <option value={opt.id}>{opt.label}</option>
              {/each}
            </select>
          </div>
          <div class="space-y-1.5">
            <label for="pdf-end-week" class="text-[9px] font-bold text-content-subtle uppercase tracking-widest ml-1">End Week</label>
            <select id="pdf-end-week" bind:value={endWeek} class="w-full bg-surface-elevated text-content p-3.5 rounded-xl border border-border-strong outline-none text-sm appearance-none">
              {#each weekOptions as opt}
                <option value={opt.id}>{opt.label}</option>
              {/each}
            </select>
          </div>
        </div>
      </div>

      <button onclick={handleExport} disabled={isGenerating} class="w-full py-4 bg-primary hover:bg-primary-hover text-white text-sm font-black tracking-widest uppercase rounded-2xl shadow-lg transition-transform active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none">
        {#if isGenerating}
          <div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Generating...
        {:else}
          <Icon icon="ic:baseline-download" class="text-lg" /> Generate PDF
        {/if}
      </button>
    </div>
  </div>
</div>

<!-- Hidden Printable Content Container -->
<div class="fixed left-[-9999px] top-[-9999px] overflow-visible w-[800px] hidden" style="background-color: #ffffff; color: #000000;" bind:this={printContainer}>
  <div class="p-10 font-sans" style="background-color: #ffffff; color: #000000;">
    <div class="mb-8 border-b-2 pb-4 text-center" style="border-color: #000000;">
      <h1 class="text-4xl font-black uppercase tracking-widest">Boulder Tracker</h1>
      <p class="text-sm mt-2 font-bold" style="color: #4b5563;">Training Plan: {startWeek} to {endWeek}</p>
    </div>

    {#each selectedWorkouts as week}
      <div class="mb-12 page-break-inside-avoid">
        <div class="p-4 border-l-4 mb-6" style="background-color: #f3f4f6; border-color: #000000;">
          <h2 class="text-2xl font-black uppercase tracking-widest">{week.weekId} <span class="text-lg font-normal ml-2" style="color: #6b7280;">({getWeekDateRange(week.weekId)})</span></h2>
          <p class="text-sm font-bold mt-1 uppercase" style="color: #4b5563;">Phase: {week.phase}</p>
        </div>

        {#if week.workouts.length === 0}
          <p class="italic px-4" style="color: #6b7280;">No scheduled sessions for this week.</p>
        {:else}
          <div class="grid grid-cols-1 gap-6 px-4">
            {#each week.workouts as workout}
              <div class="border rounded-xl p-5 break-inside-avoid" style="border-color: #d1d5db;">
                <div class="flex justify-between items-center border-b pb-3 mb-4" style="border-color: #e5e7eb;">
                  <h3 class="text-xl font-bold">{workout.notes || 'Unnamed Session'}</h3>
                  <div class="text-sm font-bold px-3 py-1 rounded-full uppercase tracking-wider" style="background-color: #000000; color: #ffffff;">
                    {workout.dayOfWeek || 'Unscheduled'}
                  </div>
                </div>

                {#if !workout.exercises || workout.exercises.length === 0}
                  <p class="text-sm" style="color: #6b7280;">No exercises added.</p>
                {:else}
                  <ul class="space-y-4">
                    {#each workout.exercises as ex, idx}
                      <li class="flex gap-4">
                        <div class="font-black mt-1" style="color: #9ca3af;">{idx + 1}.</div>
                        <div class="flex-1">
                          <p class="font-bold text-lg">{ex.type} <span class="text-sm font-normal ml-2" style="color: #6b7280;">({ex.category || 'Other'})</span></p>
                          
                          <div class="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm" style="color: #374151;">
                            {#if ex.duration}<span class="font-bold">⏱️ {ex.duration} min</span>{/if}
                            {#if ex.sets}<span class="font-bold">🔄 {ex.sets} sets</span>{/if}
                            {#if ex.reps}<span class="font-bold">x{ex.reps} reps</span>{/if}
                            {#if ex.boulderingGrades}<span>Grades: {ex.boulderingGrades.join(', ')}</span>{/if}
                            {#if ex.timeOn && ex.timeOff}<span>{ex.timeOn}s ON / {ex.timeOff}s OFF</span>{/if}
                            {#if ex.routeDifficulty}<span>Route Diff: {ex.routeDifficulty}</span>{/if}
                            {#if ex.weight}<span>Weight: +{ex.weight}kg</span>{/if}
                            {#if ex.bodyweightPercent}<span>BW %: {ex.bodyweightPercent}%</span>{/if}
                            {#if ex.maxWeightPercent}<span>Max Weight %: {ex.maxWeightPercent}%</span>{/if}
                          </div>
                          
                          {#if ex.notes}
                            <p class="text-sm mt-2 p-2 rounded border" style="color: #4b5563; background-color: #f9fafb; border-color: #f3f4f6;">📝 {ex.notes}</p>
                          {/if}
                        </div>
                      </li>
                    {/each}
                  </ul>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  @media print {
    .page-break-inside-avoid {
      page-break-inside: avoid;
    }
  }
</style>
