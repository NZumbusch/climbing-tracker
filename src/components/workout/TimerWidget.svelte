<script lang="ts">
  /**
   * Floating stopwatch/rest-timer pill (stash port, UI_PLAN.md §1/§5.7).
   * Zero schema contact - `$state`, Iconify and theme tokens only, same as
   * the stash's original. Two changes beyond a straight port:
   * - `bottom-[91px]` instead of the stash's `bottom-24`, recomputed
   *   against this app's actual nav bar height (`h-[75px]`, App.svelte) +
   *   16px clearance, rather than an inherited guess (UI_PLAN.md §1 flagged
   *   `bottom-24` as the one stale detail in an otherwise clean port).
   * - `currentSlot`: when set (WorkoutForm passes its `editingSlot`), shows
   *   preset chips for whichever of that exercise's timeOn/timeOff/
   *   timeBetweenSets are actually defined, so switching to timer mode
   *   starts from the exercise's own rest/hang timing instead of always a
   *   fixed 60s (§5.7 - "context-aware").
   */
  import Icon from "@iconify/svelte";
  import { slotValues } from "../../lib/exerciseSlot";
  import type { ExerciseSlot } from "../../lib/types";

  let { currentSlot = null }: { currentSlot?: ExerciseSlot | null } = $props();

  let mode = $state<'stopwatch' | 'timer'>('stopwatch');
  let time = $state(0);
  let isRunning = $state(false);
  let interval: ReturnType<typeof setInterval> | null = null;

  let targetTime = $state(60); // for countdown

  const presets = $derived.by(() => {
    if (!currentSlot) return [];
    const v = slotValues(currentSlot);
    const list: { label: string; seconds: number }[] = [];
    if (v.timeOn) list.push({ label: 'On', seconds: v.timeOn });
    if (v.timeOff) list.push({ label: 'Off', seconds: v.timeOff });
    if (v.timeBetweenSets) list.push({ label: 'Sets', seconds: v.timeBetweenSets });
    return list;
  });

  function applyPreset(seconds: number) {
    mode = 'timer';
    targetTime = seconds;
    if (!isRunning) time = seconds;
  }

  function toggle() {
    if (isRunning) {
      if (interval) clearInterval(interval);
      isRunning = false;
    } else {
      isRunning = true;
      interval = setInterval(() => {
        if (mode === 'stopwatch') {
          time++;
        } else {
          if (time > 0) {
            time--;
          } else {
            // Timer finished!
            if (interval) clearInterval(interval);
            isRunning = false;
            // Play a sound or vibrate (using browser API if available)
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
              navigator.vibrate([200, 100, 200]);
            }
          }
        }
      }, 1000);
    }
  }

  function reset() {
    if (interval) clearInterval(interval);
    isRunning = false;
    time = mode === 'timer' ? targetTime : 0;
  }

  function setMode(newMode: 'stopwatch' | 'timer') {
    mode = newMode;
    reset();
  }

  function formatTime(s: number) {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function addTime(seconds: number) {
    if (mode === 'timer') {
      targetTime += seconds;
      if (targetTime < 0) targetTime = 0;
      if (!isRunning) time = targetTime;
    }
  }
</script>

<div class="fixed bottom-[91px] left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2">
  {#if presets.length > 0}
    <div class="flex items-center gap-1.5 bg-surface/90 backdrop-blur-md border border-border rounded-control px-2 py-1 shadow-card animate-in fade-in">
      {#each presets as preset}
        <button
          onclick={() => applyPreset(preset.seconds)}
          class="text-label text-content-subtle hover:text-primary transition-colors px-1"
        >
          {preset.label} {formatTime(preset.seconds)}
        </button>
      {/each}
    </div>
  {/if}

  <div class="bg-surface/90 backdrop-blur-md border border-border shadow-2xl rounded-full p-2 flex items-center gap-4 animate-in slide-in-from-bottom-10">
    <div class="flex items-center gap-1 bg-surface-elevated rounded-full p-1 border border-border-strong">
      <button
        onclick={() => setMode('stopwatch')}
        class="w-8 h-8 rounded-full flex items-center justify-center transition-colors {mode === 'stopwatch' ? 'bg-primary text-white' : 'text-content-subtle hover:text-content'}"
      >
        <Icon icon="ic:baseline-timer" class="text-lg" />
      </button>
      <button
        onclick={() => setMode('timer')}
        class="w-8 h-8 rounded-full flex items-center justify-center transition-colors {mode === 'timer' ? 'bg-warning text-white' : 'text-content-subtle hover:text-content'}"
      >
        <Icon icon="ic:baseline-hourglass-empty" class="text-lg" />
      </button>
    </div>

    <div class="w-16 text-center text-metric text-content tabular-nums">
      {formatTime(time)}
    </div>

    <div class="flex items-center gap-2 pr-2">
      {#if mode === 'timer'}
        <div class="flex flex-col gap-1 mr-2">
          <button onclick={() => addTime(30)} class="text-label text-content-muted hover:text-content bg-surface-elevated px-1 rounded-control transition-colors">+30s</button>
          <button onclick={() => addTime(-30)} class="text-label text-content-muted hover:text-content bg-surface-elevated px-1 rounded-control transition-colors">-30s</button>
        </div>
      {/if}

      <button
        onclick={toggle}
        class="w-10 h-10 rounded-full flex items-center justify-center {isRunning ? 'bg-danger text-white' : 'bg-success text-app-bg'} hover:opacity-90 transition-all shadow-lg active:scale-90"
      >
        <Icon icon={isRunning ? "ic:baseline-pause" : "ic:baseline-play-arrow"} class="text-2xl" />
      </button>

      <button
        onclick={reset}
        class="w-8 h-8 rounded-full flex items-center justify-center bg-surface-elevated text-content-subtle hover:text-content border border-border-strong transition-colors active:scale-90"
      >
        <Icon icon="ic:baseline-refresh" class="text-lg" />
      </button>
    </div>
  </div>
</div>
