<script lang="ts">
  import type { Workout } from '../../lib/types';
  import { formatDate } from '../../lib/dateUtils';
  import { showAlert } from '../../lib/utils';
  import html2canvas from 'html2canvas';

  let { workout, onClose } = $props<{ workout: Workout, onClose: () => void }>();

  let containerNode: HTMLElement | null = $state(null);
  let styleIndex = $state(0);
  let isCopying = $state(false);
  
  const styles = ['overview', 'detailed', 'stats'];
  const activeStyle = $derived(styles[styleIndex]);

  // Derived stats for templates
  const totalSets = $derived(workout.exercises.reduce((acc: number, e: any) => acc + (e.sets || 0), 0));
  const topExercise = $derived(workout.exercises.length > 0 
    ? [...workout.exercises].sort((a, b) => (b.plannedLoad || 0) - (a.plannedLoad || 0))[0] 
    : null);

  async function shareImage() {
    if (!containerNode) return;
    
    try {
      isCopying = true;
      
      const makeBlob = async (): Promise<Blob> => {
        const canvas = await html2canvas(containerNode!, {
          scale: 3,
          useCORS: true,
          backgroundColor: null
        });
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('Failed to create image blob');
        return blob;
      };

      let clipboardSuccess = false;

      if (navigator.clipboard && window.ClipboardItem) {
        try {
          // 1. Try Safari-style synchronous ClipboardItem creation (with Promise)
          const item = new ClipboardItem({
            'image/png': makeBlob()
          });
          await navigator.clipboard.write([item]);
          clipboardSuccess = true;
        } catch (e) {
          console.warn('Clipboard write with promise failed, trying resolved blob fallback...', e);
        }
      }

      if (clipboardSuccess) {
        showAlert('Success', 'Image copied to clipboard!');
        return;
      }

      // Generate the blob once for the fallbacks
      const blob = await makeBlob();

      if (navigator.clipboard && window.ClipboardItem) {
        try {
          // 2. Try Firefox/Chrome-style ClipboardItem creation (with resolved Blob)
          const item = new ClipboardItem({ 'image/png': blob });
          await navigator.clipboard.write([item]);
          showAlert('Success', 'Image copied to clipboard!');
          return;
        } catch (e) {
          console.warn('Clipboard write with resolved blob failed, trying share/download...', e);
        }
      }

      // 3. Fallback to Web Share API or Download
      const file = new File([blob], `workout-${workout.date}.png`, { type: 'image/png' });

      if (navigator.share) {
        try {
          await navigator.share({
            title: 'My Boulder Workout',
            files: [file]
          });
        } catch (shareErr) {
          downloadImage(URL.createObjectURL(blob));
        }
      } else {
        downloadImage(URL.createObjectURL(blob));
      }
    } catch (e) {
      console.error('Failed to generate image', e);
    } finally {
      isCopying = false;
    }
  }

  function downloadImage(dataUrl: string) {
    const link = document.createElement('a');
    link.download = `boulder-workout-${workout.date}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in">
  <div class="flex flex-col items-center gap-6 w-full max-w-sm">
    
    <!-- Style Selector Gallery -->
    <div class="flex items-center gap-2 w-full overflow-x-auto no-scrollbar pb-2 snap-x">
      {#each styles as style, i}
        <button 
          onclick={() => styleIndex = i}
          class="shrink-0 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all snap-center {styleIndex === i ? 'bg-primary text-white shadow-lg scale-105' : 'bg-surface-elevated text-content-subtle hover:text-content'}"
        >
          {style}
        </button>
      {/each}
    </div>

    <!-- The actual card to be exported -->
    <div 
      bind:this={containerNode}
      class="w-full aspect-square rounded-[32px] p-8 flex flex-col justify-between relative overflow-hidden shadow-2xl border border-[rgba(255,255,255,0.1)]"
      style="background: linear-gradient(to bottom right, #18181b, #000000);"
    >
      <!-- Background decoration -->
      <div class="absolute -top-24 -right-24 w-64 h-64 bg-[rgba(37,99,235,0.2)] rounded-full blur-[60px] pointer-events-none"></div>
      
      <!-- Shared Header -->
      <div class="relative z-10">
        <div class="flex items-center gap-2 mb-2">
          <div class="w-2 h-2 bg-primary rounded-full"></div>
          <span class="text-[10px] font-black text-primary uppercase tracking-[0.2em]">{formatDate(workout.date)}</span>
        </div>
        <h2 class="text-3xl font-black text-white tracking-tighter leading-tight">{workout.notes || 'Training Session'}</h2>
        
        <!-- Dynamic Body based on Active Style -->
        {#if activeStyle === 'overview'}
          <div class="mt-6 flex flex-wrap gap-2 overflow-hidden max-h-[140px]">
            {#each (workout.exercises || []).slice(0, 15) as exercise}
              <div class="text-[10px] px-3 py-1.5 bg-[rgba(255,255,255,0.1)] border border-[rgba(255,255,255,0.1)] rounded-xl text-white font-bold shrink-0 inline-block">
                {exercise.type}
              </div>
            {/each}
            {#if workout.exercises.length > 15}
              <div class="text-[10px] px-3 py-1.5 bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.05)] rounded-xl text-[rgba(255,255,255,0.5)] font-bold shrink-0 inline-block">
                +{workout.exercises.length - 15} more
              </div>
            {/if}
          </div>

        {:else if activeStyle === 'detailed'}
          <div class="mt-6 space-y-2.5 overflow-hidden max-h-[150px]">
            {#each (workout.exercises || []).slice(0, 4) as exercise}
              <div class="flex justify-between items-center border-b border-[rgba(255,255,255,0.1)] pb-2.5 last:border-0 last:pb-0">
                <div class="text-xs font-bold text-[rgba(255,255,255,0.9)] truncate mr-2 inline-block">{exercise.type}</div>
                <div class="text-[10px] font-mono font-bold text-[rgba(255,255,255,0.7)] bg-[rgba(255,255,255,0.05)] px-2 py-1 rounded-md shrink-0 inline-block">
                  {#if exercise.sets && exercise.reps}
                    {exercise.sets}x{exercise.reps}
                  {:else if exercise.duration}
                    {exercise.duration}m
                  {:else if exercise.distance}
                    {exercise.distance}km
                  {:else}
                    Done
                  {/if}
                  {#if exercise.weight || exercise.maxWeightPercent}
                    @ {exercise.weight ? `${exercise.weight}kg` : `${exercise.maxWeightPercent}%`}
                  {/if}
                </div>
              </div>
            {/each}
            {#if workout.exercises.length > 4}
              <p class="text-[9px] text-[rgba(255,255,255,0.4)] font-bold tracking-widest uppercase text-center mt-2 pt-1 border-t border-[rgba(255,255,255,0.05)]">+{workout.exercises.length - 4} more exercises</p>
            {/if}
          </div>

        {:else if activeStyle === 'stats'}
          <div class="mt-8 flex gap-3">
            <div class="flex-1 bg-[rgba(255,255,255,0.05)] p-4 rounded-2xl border border-[rgba(255,255,255,0.1)] flex flex-col justify-center">
              <p class="text-[8px] font-black uppercase tracking-widest text-primary mb-1">Top Focus</p>
              <p class="text-sm font-bold text-white tracking-tight leading-tight">{topExercise?.type || 'Resting'}</p>
            </div>
            <div class="flex-1 bg-[rgba(255,255,255,0.05)] p-4 rounded-2xl border border-[rgba(255,255,255,0.1)] flex flex-col justify-center">
              <p class="text-[8px] font-black uppercase tracking-widest text-primary mb-1">Volume</p>
              <p class="text-2xl font-black text-white tracking-tighter">{totalSets} <span class="text-[10px] tracking-normal font-bold uppercase tracking-widest text-[rgba(255,255,255,0.5)]">Sets</span></p>
            </div>
          </div>
        {/if}
      </div>
      
      <!-- Shared Footer -->
      <div class="relative z-10 flex justify-between items-end border-t border-[rgba(255,255,255,0.1)] pt-6">
        <div>
          <p class="text-4xl font-black text-white tracking-tighter">{Math.round(workout.loadFactor || 0)}</p>
          <p class="text-[8px] font-black uppercase text-[#71717a] tracking-[0.2em] mt-1">Total Load</p>
        </div>
        
        <div class="text-right">
          <p class="text-[10px] font-black text-[rgba(255,255,255,0.3)] tracking-widest uppercase">Boulder Tracker</p>
        </div>
      </div>
    </div>

    <!-- Controls -->
    <div class="flex gap-4 w-full">
      <button 
        onclick={onClose}
        disabled={isCopying}
        class="flex-1 py-4 bg-surface hover:bg-surface-elevated disabled:opacity-50 text-content rounded-2xl font-black uppercase text-[10px] tracking-widest transition-colors border border-border"
      >
        Cancel
      </button>
      <button 
        onclick={shareImage}
        disabled={isCopying}
        class="flex-[2] py-4 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20 transition-all active:scale-95 flex items-center justify-center gap-2"
      >
        {isCopying ? 'Copying...' : 'Copy to Clipboard'}
      </button>
    </div>
  </div>
</div>
