<script lang="ts">
  /**
   * Notifications (UI_PLAN.md §4.7/§5.6, Stage 8) - the fatigue reminder
   * (Phase 7, moved out of `PreferencesSettings.svelte`'s old "next to the
   * theme picker" spot per §4.7's own complaint that it "will not scale")
   * plus the new daily-metrics reminder, each with its own time where
   * applicable. Both ultimately depend on `notificationsEnabled` (native
   * permission) - the section title itself explains this rather than
   * nesting a second conditional gate in the markup.
   */
  import { Capacitor } from '@capacitor/core';
  import { trainingState } from '../../lib/state.svelte';
  import { showAlert } from '../../lib/utils';
  import Icon from "@iconify/svelte";

  const isNative = Capacitor.isNativePlatform();

  async function toggleNotifications() {
    const enabling = !trainingState.notificationsEnabled;
    const result = await trainingState.setNotificationsEnabled(enabling);
    if (enabling && !result) {
      await showAlert(
        'Permission Needed',
        'Notifications were not granted. Enable them for this app in your device Settings, then try again here.'
      );
    }
  }
</script>

{#if isNative}
  <div class="bg-surface border border-border rounded-card p-5 space-y-4 backdrop-blur-sm shadow-card animate-in fade-in">
    <div class="space-y-2">
      <h3 class="text-section uppercase text-content-muted px-1">Notifications</h3>
      <p class="text-caption text-content-subtle px-1 leading-relaxed">Local reminders only - nothing leaves this device. Both reminder types below need this master switch on first.</p>
    </div>

    <button
      onclick={toggleNotifications}
      class="w-full flex items-center justify-between p-4 rounded-card border transition-all {trainingState.notificationsEnabled ? 'bg-primary/10 border-primary text-primary' : 'bg-surface-elevated/30 border-border-strong/50 text-content'}"
    >
      <div class="flex items-center gap-3">
        <Icon icon="ic:baseline-notifications-active" class="text-xl" />
        <div class="text-left">
          <p class="text-body font-bold">Allow Notifications</p>
          <p class="text-caption opacity-80 mt-1">{trainingState.notificationsEnabled ? 'Enabled' : 'Disabled'}</p>
        </div>
      </div>
      {#if trainingState.notificationsEnabled}
        <Icon icon="ic:baseline-check-circle" class="text-xl" />
      {/if}
    </button>

    {#if trainingState.notificationsEnabled}
      <div class="space-y-3 pt-2 border-t border-border/50 animate-in fade-in">
        <div class="flex items-center justify-between p-3.5 rounded-control border border-border-strong/50 bg-surface-elevated/30">
          <div class="min-w-0">
            <p class="text-body text-content">Fatigue Log Reminders</p>
            <p class="text-caption text-content-subtle mt-0.5">After a planned session's scheduled time has passed.</p>
          </div>
          <span class="text-label text-success shrink-0 ml-3">On</span>
        </div>

        <div class="p-3.5 rounded-control border border-border-strong/50 bg-surface-elevated/30 space-y-3">
          <label class="flex items-center justify-between cursor-pointer">
            <div class="min-w-0">
              <p class="text-body text-content">Daily Metrics Reminder</p>
              <p class="text-caption text-content-subtle mt-0.5">When sleep, HRV, or resting HR is still missing for today.</p>
            </div>
            <input
              type="checkbox"
              checked={trainingState.dailyMetricsReminderEnabled}
              onchange={(e) => trainingState.setDailyMetricsReminderEnabled(e.currentTarget.checked)}
              class="w-5 h-5 rounded accent-primary shrink-0 ml-3"
            />
          </label>
          {#if trainingState.dailyMetricsReminderEnabled}
            <div class="flex items-center justify-between gap-3 animate-in fade-in">
              <label for="daily-metrics-time" class="text-label text-content-subtle">Reminder time</label>
              <input
                id="daily-metrics-time"
                type="time"
                value={trainingState.dailyMetricsReminderTime}
                onchange={(e) => trainingState.setDailyMetricsReminderTime(e.currentTarget.value)}
                class="bg-surface-elevated text-content px-3 py-1.5 rounded-control border border-border-strong text-sm outline-none"
              />
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
{/if}
