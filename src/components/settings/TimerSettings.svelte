<script lang="ts">
  /**
   * Timer behaviour toggles (UI_PLAN.md §4.7/§5.7, Stage 8). Vibrate/beep
   * always offered; keep-awake only when `navigator.wakeLock` actually
   * exists - "degrade silently... rather than showing a dead toggle"
   * (§5.7), matching how the Notifications section below already hides
   * itself entirely on non-native platforms.
   */
  import { trainingState } from '../../lib/state.svelte';
  import Icon from "@iconify/svelte";

  const wakeLockSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
</script>

<div class="bg-surface border border-border rounded-card p-5 space-y-4 backdrop-blur-sm shadow-card animate-in fade-in">
  <div class="space-y-2">
    <h3 class="text-section uppercase text-content-muted px-1">Timer</h3>
    <p class="text-caption text-content-subtle px-1 leading-relaxed">Behaviour of the floating rest/stopwatch timer during a workout.</p>
  </div>

  <div class="space-y-2.5">
    <label class="w-full flex items-center justify-between p-3.5 rounded-control border border-border-strong/50 bg-surface-elevated/30 cursor-pointer">
      <div class="flex items-center gap-3">
        <Icon icon="ic:baseline-vibration" class="text-lg text-content-muted" />
        <span class="text-body text-content">Vibrate on finish</span>
      </div>
      <input
        type="checkbox"
        checked={trainingState.timerVibrateEnabled}
        onchange={(e) => trainingState.setTimerVibrateEnabled(e.currentTarget.checked)}
        class="w-5 h-5 rounded accent-primary"
      />
    </label>

    <label class="w-full flex items-center justify-between p-3.5 rounded-control border border-border-strong/50 bg-surface-elevated/30 cursor-pointer">
      <div class="flex items-center gap-3">
        <Icon icon="ic:baseline-volume-up" class="text-lg text-content-muted" />
        <span class="text-body text-content">Audible beep</span>
      </div>
      <input
        type="checkbox"
        checked={trainingState.timerBeepEnabled}
        onchange={(e) => trainingState.setTimerBeepEnabled(e.currentTarget.checked)}
        class="w-5 h-5 rounded accent-primary"
      />
    </label>

    {#if wakeLockSupported}
      <label class="w-full flex items-center justify-between p-3.5 rounded-control border border-border-strong/50 bg-surface-elevated/30 cursor-pointer">
        <div class="flex items-center gap-3">
          <Icon icon="ic:baseline-lightbulb" class="text-lg text-content-muted" />
          <span class="text-body text-content">Keep screen awake</span>
        </div>
        <input
          type="checkbox"
          checked={trainingState.timerKeepAwakeEnabled}
          onchange={(e) => trainingState.setTimerKeepAwakeEnabled(e.currentTarget.checked)}
          class="w-5 h-5 rounded accent-primary"
        />
      </label>
    {/if}
  </div>
</div>
