<script lang="ts">
  // Logic & Storage
  import { trainingState } from './lib/state.svelte';
  
  // View Components
  import TrainingPlan from './components/plan/TrainingPlan.svelte';
  import WorkoutForm from './components/workout/WorkoutForm.svelte';
  import History from './components/history/History.svelte';
  import Settings from './components/settings/Settings.svelte';
  import Analytics from './components/analytics/Analytics.svelte';
  import FatigueModal from './components/common/FatigueModal.svelte';
  import Icon from "@iconify/svelte";

  // --- Derived State ---
  const plannedThisWeek = $derived(trainingState.getPlannedWorkoutsForWeek(trainingState.activeWorkout?.weekId || trainingState.currentWeekId));
</script>

<main class="flex flex-col h-screen overflow-hidden bg-[#0a0a0b] text-zinc-100 font-sans">
  <div class="flex-1 overflow-y-auto no-scrollbar bg-[#121214] flex flex-col items-center w-full p-4">
    {#if trainingState.isLoading}
      <div class="flex flex-col items-center justify-center h-full space-y-4">
        <div class="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <p class="text-zinc-500 text-xs font-bold uppercase tracking-widest">Loading Training Data...</p>
      </div>
    {:else if trainingState.view === 'plan'}
      <TrainingPlan />
    {:else if trainingState.view === 'add'}
      <WorkoutForm 
        plannedWorkouts={plannedThisWeek} 
        workout={trainingState.activeWorkout}
      />
    {:else if trainingState.view === 'history'}
      <History />
    {:else if trainingState.view === 'settings'}
      <Settings 
        onExport={() => trainingState.exportData()}
        onImport={(e) => trainingState.importData(e)}
      />
    {:else if trainingState.view === 'analytics'}
      <Analytics />
    {/if}
  </div>

  <nav 
    class="w-full h-[75px] border-t flex justify-evenly items-center shrink-0 select-none"
    style="background-color: #121214; border-color: rgba(255, 255, 255, 0.05);"
  >
    <button 
      onclick={() => trainingState.navigate('plan')}
      class="flex flex-col items-center justify-center w-24 h-full cursor-pointer transition-all duration-300"
      style="color: {trainingState.view === 'plan' || trainingState.view === 'analytics' ? '#10b981' : '#71717a'}; transform: scale({trainingState.view === 'plan' || trainingState.view === 'analytics' ? '1.05' : '1'});"
    >
      <Icon icon="ic:baseline-calendar-month" class="text-[28px]" />
      <div class="w-1 h-1 mt-1 rounded-full transition-all duration-300" style="background-color: {trainingState.view === 'plan' || trainingState.view === 'analytics' ? '#10b981' : 'transparent'}; transform: scale({trainingState.view === 'plan' || trainingState.view === 'analytics' ? '1' : '0'});"></div>
    </button>

    <button 
      onclick={() => trainingState.navigate('add')}
      class="flex items-center justify-center w-12 h-12 rounded-full cursor-pointer transition-all duration-300 active:scale-90"
      style="background-color: {trainingState.view === 'add' ? '#10b981' : '#27272a'}; color: {trainingState.view === 'add' ? '#09090b' : '#a1a1aa'}; box-shadow: {trainingState.view === 'add' ? '0 0 20px rgba(16, 185, 129, 0.3)' : 'none'};"
    >
      <Icon icon="ic:baseline-plus" class="text-[34px]" />
    </button>

    <button 
      onclick={() => trainingState.navigate('history')}
      class="flex flex-col items-center justify-center w-24 h-full cursor-pointer transition-all duration-300"
      style="color: {(trainingState.view === 'history' || trainingState.view === 'settings') ? '#10b981' : '#71717a'}; transform: scale({(trainingState.view === 'history' || trainingState.view === 'settings') ? '1.05' : '1'});"
    >
      <Icon icon="ic:baseline-content-paste" class="text-[28px]" />
      <div class="w-1 h-1 mt-1 rounded-full transition-all duration-300" style="background-color: {(trainingState.view === 'history' || trainingState.view === 'settings') ? '#10b981' : 'transparent'}; transform: scale({(trainingState.view === 'history' || trainingState.view === 'settings') ? '1' : '0'});"></div>
    </button>
  </nav>

  {#if trainingState.activeWorkout && trainingState.showFatigue}
    <FatigueModal 
      initialData={trainingState.activeWorkout}
      duration={trainingState.activeWorkout.exercises.reduce((acc, e) => acc + (e.duration || 0), 0)} 
      onConfirm={(data) => trainingState.confirmFatigue(data)} 
    />
  {/if}
</main>
