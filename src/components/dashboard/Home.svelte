<script lang="ts">
  import { trainingState } from '../../lib/state.svelte';
  import { formatDate } from '../../lib/dateUtils';
  import Icon from "@iconify/svelte";

  const today = formatDate(new Date().toISOString());

  /**
   * Stage 1 (UI_PLAN.md §4.1/§6) is shell-and-nav only: this renders the
   * fixed section order from §4.2 as static skeleton cards, with no
   * workout/metric data read anywhere below the header. Each section's
   * real content (readiness score, fatigue bars, quick-entry, weekly load,
   * block context, competition countdown, recent activity, weather) is
   * wired up in later stages - see UI_PLAN.md §6's "Home fully populated"
   * step and PROGRESS.md's Stage 1 entry for why this line was drawn here
   * rather than wiring the handful of sections that could reuse an
   * existing accessor (e.g. today's planned session, current block/phase).
   */
  const sections: { icon: string; title: string; caption: string }[] = [
    { icon: 'ic:baseline-today', title: 'Today', caption: "Today's planned session and a Start action will appear here." },
    { icon: 'ic:baseline-favorite', title: 'Metrics', caption: 'Sleep, HRV and resting heart-rate quick-entry.' },
    { icon: 'ic:baseline-bolt', title: 'Fatigue', caption: 'Fingers, arms, core and systemic fatigue.' },
    { icon: 'ic:baseline-trending-up', title: 'This Week', caption: 'Completed vs. planned load for the current week.' },
    { icon: 'ic:baseline-view-week', title: 'Training Block', caption: 'Current block and phase, and where this week sits in it.' },
    { icon: 'ic:baseline-flag', title: 'Next Competition', caption: 'Countdown to your next A-priority event.' },
    { icon: 'ic:baseline-history', title: 'Recent Activity', caption: 'Your last few completed sessions.' },
    { icon: 'ic:baseline-cloud', title: 'Weather', caption: 'Conditions at your home location.' },
  ];
</script>

<div class="w-full max-w-lg space-y-5 animate-in fade-in duration-700 pb-24">
  <div class="flex items-center justify-between px-1">
    <div>
      <p class="text-caption text-content-subtle">{today}</p>
      <h2 class="text-title text-content">Home</h2>
    </div>
    <button
      onclick={() => trainingState.navigate('settings')}
      class="p-2 bg-surface-elevated/50 rounded-control border border-border-strong/50 text-content-subtle hover:text-content transition-colors"
      aria-label="Settings"
    >
      <Icon icon="ic:baseline-settings" class="text-lg" />
    </button>
  </div>

  <div class="bg-surface/50 border border-border rounded-card p-5 shadow-card text-center space-y-1">
    <span class="text-section uppercase text-content-muted">Readiness</span>
    <div class="text-display text-content-subtle tabular-nums">&mdash;</div>
    <p class="text-caption text-content-subtle">Score, status and advice will appear once Stage 2 lands.</p>
  </div>

  {#each sections as section}
    <div class="bg-surface/50 border border-border rounded-card p-5 shadow-card space-y-1.5">
      <div class="flex items-center gap-2 text-content-muted">
        <Icon icon={section.icon} class="text-lg" />
        <span class="text-section uppercase">{section.title}</span>
      </div>
      <p class="text-caption text-content-subtle">{section.caption}</p>
    </div>
  {/each}
</div>
