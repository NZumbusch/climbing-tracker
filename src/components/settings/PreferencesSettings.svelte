<script lang="ts">
  import { trainingState } from '../../lib/state.svelte';
  import Icon from "@iconify/svelte";
</script>

<div class="space-y-6">
  <div class="bg-surface border border-border rounded-3xl p-6 space-y-6 backdrop-blur-sm shadow-xl animate-in fade-in">
    <div class="space-y-2">
      <h3 class="text-xs font-bold text-content-muted uppercase tracking-widest px-1">Visual Settings</h3>
      <p class="text-[10px] text-content-subtle px-1 leading-relaxed">Configure interface themes and high-contrast settings to optimize visibility across diverse lighting conditions.</p>
    </div>
    <div class="space-y-3">
      <button
        onclick={() => trainingState.setTheme('dark')}
        class="w-full flex items-center justify-between p-4 rounded-2xl border transition-all {trainingState.theme === 'dark' ? 'bg-primary/10 border-primary text-primary' : 'bg-surface-elevated/30 border-border-strong/50 text-content'}"
      >
        <div class="flex items-center gap-3">
          <Icon icon="ic:baseline-dark-mode" class="text-xl" />
          <div class="text-left">
            <p class="text-sm font-bold">Dark Theme (Default)</p>
          </div>
        </div>
        {#if trainingState.theme === 'dark'}
          <Icon icon="ic:baseline-check-circle" class="text-xl" />
        {/if}
      </button>

      <button
        onclick={() => trainingState.setTheme('light')}
        class="w-full flex items-center justify-between p-4 rounded-2xl border transition-all {trainingState.theme === 'light' ? 'bg-primary/10 border-primary text-primary' : 'bg-surface-elevated/30 border-border-strong/50 text-content'}"
      >
        <div class="flex items-center gap-3">
          <Icon icon="ic:baseline-light-mode" class="text-xl" />
          <div class="text-left">
            <p class="text-sm font-bold">Light Theme</p>
          </div>
        </div>
        {#if trainingState.theme === 'light'}
          <Icon icon="ic:baseline-check-circle" class="text-xl" />
        {/if}
      </button>

      <button
        onclick={() => trainingState.setTheme('contrast')}
        class="w-full flex items-center justify-between p-4 rounded-2xl border transition-all {trainingState.theme === 'contrast' ? 'bg-primary/10 border-primary text-primary' : 'bg-surface-elevated/30 border-border-strong/50 text-content'}"
      >
        <div class="flex items-center gap-3">
          <Icon icon="ic:baseline-contrast" class="text-xl" />
          <div class="text-left">
            <p class="text-sm font-bold">High Contrast</p>
            <p class="text-[9px] opacity-80 mt-1">Maximized contrast ratio for optimal outdoor readability.</p>
          </div>
        </div>
        {#if trainingState.theme === 'contrast'}
          <Icon icon="ic:baseline-check-circle" class="text-xl" />
        {/if}
      </button>
    </div>
  </div>
</div>
