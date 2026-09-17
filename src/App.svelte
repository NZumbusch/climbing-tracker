<script lang="ts">
  // Logic & Storage
  import { trainingState } from './lib/state.svelte';
  
  import FatigueModal from './components/common/FatigueModal.svelte';
  import { slotValues } from './lib/exerciseSlot';
  import Icon from "@iconify/svelte";

  // --- Derived State ---
  const plannedThisWeek = $derived(trainingState.getPlannedWorkoutsForWeek(trainingState.activeWorkout?.weekId || trainingState.currentWeekId));

  $effect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', trainingState.theme);
    }
  });

  $effect(() => {
    if (!trainingState.isLoading) {
      trainingState.maybePromptForNotifications();
    }
  });
</script>

<main class="flex flex-col h-screen overflow-hidden bg-app-bg text-content font-sans">
  <div class="flex-1 overflow-y-auto no-scrollbar bg-surface flex flex-col items-center w-full p-4">
    {#if trainingState.isLoading}
      <div class="flex flex-col items-center justify-center h-full space-y-4">
        <div class="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p class="text-content-subtle text-xs font-bold uppercase tracking-widest">Loading Training Data...</p>
      </div>
    {:else if trainingState.view === 'plan'}
      {#await import('./components/plan/TrainingPlan.svelte') then { default: TrainingPlan }}
        <TrainingPlan />
      {/await}
    {:else if trainingState.view === 'add'}
      {#await import('./components/workout/WorkoutForm.svelte') then { default: WorkoutForm }}
        <WorkoutForm 
          plannedWorkouts={plannedThisWeek} 
          workout={trainingState.activeWorkout}
        />
      {/await}
    {:else if trainingState.view === 'history'}
      {#await import('./components/history/History.svelte') then { default: History }}
        <History />
      {/await}
    {:else if trainingState.view === 'settings'}
      {#await import('./components/settings/Settings.svelte') then { default: Settings }}
        <Settings 
          onExport={() => trainingState.exportData()}
          onImport={(e) => trainingState.importData(e)}
        />
      {/await}
    {:else if trainingState.view === 'analytics'}
      {#await import('./components/analytics/Analytics.svelte') then { default: Analytics }}
        <Analytics />
      {/await}
    {/if}
  </div>

  <nav 
    class="w-full h-[75px] border-t flex justify-evenly items-center shrink-0 select-none bg-surface border-border"
  >
    <button 
      onclick={() => trainingState.navigate('plan')}
      class="flex flex-col items-center justify-center w-24 h-full cursor-pointer transition-all duration-300 {trainingState.view === 'plan' || trainingState.view === 'analytics' ? 'text-success scale-105' : 'text-content-subtle scale-100'}"
    >
      <Icon icon="ic:baseline-calendar-month" class="text-[28px]" />
      <div class="w-1 h-1 mt-1 rounded-full transition-all duration-300 {trainingState.view === 'plan' || trainingState.view === 'analytics' ? 'bg-success scale-100' : 'bg-transparent scale-0'}"></div>
    </button>

    <button 
      onclick={() => trainingState.navigate('add')}
      class="flex items-center justify-center w-12 h-12 rounded-full cursor-pointer transition-all duration-300 active:scale-90 {trainingState.view === 'add' ? 'bg-success text-app-bg shadow-[0_0_20px_var(--color-success)]' : 'bg-surface-elevated text-content-muted'}"
    >
      <Icon icon="ic:baseline-plus" class="text-[34px]" />
    </button>

    <button 
      onclick={() => trainingState.navigate('history')}
      class="flex flex-col items-center justify-center w-24 h-full cursor-pointer transition-all duration-300 {(trainingState.view === 'history' || trainingState.view === 'settings') ? 'text-success scale-105' : 'text-content-subtle scale-100'}"
    >
      <Icon icon="ic:baseline-content-paste" class="text-[28px]" />
      <div class="w-1 h-1 mt-1 rounded-full transition-all duration-300 {(trainingState.view === 'history' || trainingState.view === 'settings') ? 'bg-success scale-100' : 'bg-transparent scale-0'}"></div>
    </button>
  </nav>

  {#if trainingState.activeWorkout && trainingState.showFatigue}
    <FatigueModal 
      initialData={trainingState.activeWorkout}
      duration={trainingState.activeWorkout.exercises.reduce((acc, e) => acc + (slotValues(e).duration || 0), 0)}
      onConfirm={(data) => trainingState.confirmFatigue(data)} 
    />
  {/if}
</main>
