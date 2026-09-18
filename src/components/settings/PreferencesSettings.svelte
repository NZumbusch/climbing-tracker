<script lang="ts">
  /**
   * "Appearance & Behaviour" tab (UI_PLAN.md §4.7, renamed from "Appearance
   * & Design" - Stage 8's last part). Theme/Text size/Motion stay inline
   * here (small, and Theme was already here); everything else added this
   * stage is its own focused sub-component, same composition pattern
   * `Settings.svelte` itself already uses for its other tabs.
   */
  import { trainingState } from '../../lib/state.svelte';
  import LayoutSettings from './LayoutSettings.svelte';
  import TimerSettings from './TimerSettings.svelte';
  import WeatherSettings from './WeatherSettings.svelte';
  import NotificationSettings from './NotificationSettings.svelte';
  import Icon from "@iconify/svelte";
</script>

<div class="space-y-4">
  <div class="bg-surface border border-border rounded-card p-5 space-y-4 backdrop-blur-sm shadow-card animate-in fade-in">
    <div class="space-y-2">
      <h3 class="text-section uppercase text-content-muted px-1">Theme</h3>
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

  <div class="bg-surface border border-border rounded-card p-5 space-y-4 backdrop-blur-sm shadow-card animate-in fade-in">
    <div class="space-y-2">
      <h3 class="text-section uppercase text-content-muted px-1">Text Size</h3>
    </div>
    <div class="flex bg-surface-elevated/50 p-1 rounded-control">
      <button onclick={() => trainingState.setTextScale('sm')} class="flex-1 py-2.5 text-label rounded-control transition-all {trainingState.textScale === 'sm' ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}">Small</button>
      <button onclick={() => trainingState.setTextScale('md')} class="flex-1 py-2.5 text-label rounded-control transition-all {trainingState.textScale === 'md' ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}">Default</button>
      <button onclick={() => trainingState.setTextScale('lg')} class="flex-1 py-2.5 text-label rounded-control transition-all {trainingState.textScale === 'lg' ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}">Large</button>
    </div>
  </div>

  <div class="bg-surface border border-border rounded-card p-5 space-y-4 backdrop-blur-sm shadow-card animate-in fade-in">
    <div class="space-y-2">
      <h3 class="text-section uppercase text-content-muted px-1">Motion</h3>
      <p class="text-caption text-content-subtle px-1 leading-relaxed">"System" follows your device's reduced-motion setting automatically.</p>
    </div>
    <div class="flex bg-surface-elevated/50 p-1 rounded-control">
      <button onclick={() => trainingState.setMotion('system')} class="flex-1 py-2.5 text-label rounded-control transition-all {trainingState.motion === 'system' ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}">System</button>
      <button onclick={() => trainingState.setMotion('full')} class="flex-1 py-2.5 text-label rounded-control transition-all {trainingState.motion === 'full' ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}">Full</button>
      <button onclick={() => trainingState.setMotion('reduced')} class="flex-1 py-2.5 text-label rounded-control transition-all {trainingState.motion === 'reduced' ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}">Reduced</button>
    </div>
  </div>

  <LayoutSettings />
  <TimerSettings />
  <WeatherSettings />
  <NotificationSettings />
</div>
