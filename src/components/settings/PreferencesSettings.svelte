<script lang="ts">
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

<div class="space-y-4">
  <div class="bg-surface border border-border rounded-card p-5 space-y-4 backdrop-blur-sm shadow-card animate-in fade-in">
    <div class="space-y-2">
      <h3 class="text-section uppercase text-content-muted px-1">Visual Settings</h3>
      <p class="text-caption text-content-subtle px-1 leading-relaxed">Configure interface themes and high-contrast settings to optimize visibility across diverse lighting conditions.</p>
    </div>
    <div class="space-y-3">
      <button
        onclick={() => trainingState.setTheme('dark')}
        class="w-full flex items-center justify-between p-4 rounded-card border transition-all {trainingState.theme === 'dark' ? 'bg-primary/10 border-primary text-primary' : 'bg-surface-elevated/30 border-border-strong/50 text-content'}"
      >
        <div class="flex items-center gap-3">
          <Icon icon="ic:baseline-dark-mode" class="text-xl" />
          <div class="text-left">
            <p class="text-body font-bold">Dark Theme (Default)</p>
          </div>
        </div>
        {#if trainingState.theme === 'dark'}
          <Icon icon="ic:baseline-check-circle" class="text-xl" />
        {/if}
      </button>

      <button
        onclick={() => trainingState.setTheme('light')}
        class="w-full flex items-center justify-between p-4 rounded-card border transition-all {trainingState.theme === 'light' ? 'bg-primary/10 border-primary text-primary' : 'bg-surface-elevated/30 border-border-strong/50 text-content'}"
      >
        <div class="flex items-center gap-3">
          <Icon icon="ic:baseline-light-mode" class="text-xl" />
          <div class="text-left">
            <p class="text-body font-bold">Light Theme</p>
          </div>
        </div>
        {#if trainingState.theme === 'light'}
          <Icon icon="ic:baseline-check-circle" class="text-xl" />
        {/if}
      </button>

      <button
        onclick={() => trainingState.setTheme('contrast')}
        class="w-full flex items-center justify-between p-4 rounded-card border transition-all {trainingState.theme === 'contrast' ? 'bg-primary/10 border-primary text-primary' : 'bg-surface-elevated/30 border-border-strong/50 text-content'}"
      >
        <div class="flex items-center gap-3">
          <Icon icon="ic:baseline-contrast" class="text-xl" />
          <div class="text-left">
            <p class="text-body font-bold">High Contrast</p>
            <p class="text-caption opacity-80 mt-1">Maximized contrast ratio for optimal outdoor readability.</p>
          </div>
        </div>
        {#if trainingState.theme === 'contrast'}
          <Icon icon="ic:baseline-check-circle" class="text-xl" />
        {/if}
      </button>
    </div>
  </div>

  {#if isNative}
    <div class="bg-surface border border-border rounded-card p-5 space-y-4 backdrop-blur-sm shadow-card animate-in fade-in">
      <div class="space-y-2">
        <h3 class="text-section uppercase text-content-muted px-1">Notifications</h3>
        <p class="text-caption text-content-subtle px-1 leading-relaxed">Get a reminder to log fatigue/RPE after a planned workout's scheduled time has passed, so readiness/load data stays up to date without relying on remembering to open the app.</p>
      </div>
      <button
        onclick={toggleNotifications}
        class="w-full flex items-center justify-between p-4 rounded-card border transition-all {trainingState.notificationsEnabled ? 'bg-primary/10 border-primary text-primary' : 'bg-surface-elevated/30 border-border-strong/50 text-content'}"
      >
        <div class="flex items-center gap-3">
          <Icon icon="ic:baseline-notifications-active" class="text-xl" />
          <div class="text-left">
            <p class="text-body font-bold">Fatigue Log Reminders</p>
            <p class="text-caption opacity-80 mt-1">{trainingState.notificationsEnabled ? 'Enabled' : 'Disabled'}</p>
          </div>
        </div>
        {#if trainingState.notificationsEnabled}
          <Icon icon="ic:baseline-check-circle" class="text-xl" />
        {/if}
      </button>
    </div>
  {/if}
</div>
