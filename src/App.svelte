<script lang="ts">
  import { onMount } from 'svelte';
  
  // Logic & Storage
  import { storage } from './lib/storage';
  import { getWeekId } from './lib/dateUtils';
  import type { Workout, PeriodizationWeek } from './lib/types';
  
  // View Components
  import TrainingPlan from './components/plan/TrainingPlan.svelte';
  import WorkoutForm from './components/workout/WorkoutForm.svelte';
  import History from './components/history/History.svelte';
  import Settings from './components/settings/Settings.svelte';
  import Analytics from './components/analytics/Analytics.svelte';
  import FatigueModal from './components/common/FatigueModal.svelte';
  import Icon from "@iconify/svelte";

  // --- State ---
  let workouts = $state<Workout[]>([]);
  let periodization = $state<PeriodizationWeek[]>([]);
  let view = $state<'plan' | 'add' | 'history' | 'settings' | 'analytics'>('plan');
  let activeWorkout = $state<Workout | null>(null);
  let showFatigue = $state(false);

  // --- Lifecycle ---
  onMount(async () => {
    await refreshData();
  });

  // --- Core Logic ---

  async function refreshData() {
    workouts = await storage.getWorkouts();
    periodization = await storage.getPeriodization();
  }

  // --- Handlers: Workout Management ---

  async function handleSaveWorkout(workout: Workout) {
    const data = $state.snapshot(workout);

    if (data.status === 'completed') {
      activeWorkout = data;
      showFatigue = true;
    } else {
      await storage.saveWorkout(data);
      await refreshData();
      view = 'plan';
      activeWorkout = null;
    }
  }

  async function handleConfirmFatigue(fatigueData: Partial<Workout>) {
    if (!activeWorkout) return;
    
    const completedWorkout: Workout = { 
      ...$state.snapshot(activeWorkout), 
      ...fatigueData, 
      status: 'completed',
      date: activeWorkout.date || new Date().toISOString()
    };

    await storage.saveWorkout(completedWorkout);
    await refreshData();
    showFatigue = false;
    activeWorkout = null;
    view = 'history';
  }

  async function handleDeleteWorkout(id: number) {
    if (!confirm('Are you sure you want to delete this workout?')) return;
    await storage.deleteWorkout(id);
    await refreshData();
  }

  function handleEditWorkout(workout: Workout) {
    activeWorkout = $state.snapshot(workout);
    view = 'add';
  }

  function handleAddWorkoutToWeek(weekId: string) {
    activeWorkout = {
      id: Date.now(),
      status: 'planned',
      date: null,
      weekId,
      notes: 'New Session',
      loadFactor: 0,
      exercises: []
    };
    view = 'add';
  }

  // --- Handlers: Data & Navigation ---

  async function handleExport() {
    try {
      await storage.exportData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Export failed');
    }
  }

  async function handleImport(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    try {
      await storage.importData(file);
      await refreshData();
      alert('Data imported successfully!');
      view = 'history';
    } catch (err) {
      alert('Failed to import data. Please check the file format.');
    }
  }

  // --- Derived State ---
  const currentWeekId = $derived(getWeekId(new Date()));
  const plannedThisWeek = $derived(workouts.filter(w => w.weekId === (activeWorkout?.weekId || currentWeekId) && w.status === 'planned'));
</script>

<main class="flex flex-col h-screen overflow-hidden bg-[#0a0a0b] text-zinc-100 font-sans">
  <div class="flex-1 overflow-y-auto bg-[#121214] flex flex-col items-center w-full p-4">
    {#if view === 'plan'}
      <TrainingPlan 
        {periodization} 
        workouts={workouts} 
        onAssignPhase={refreshData}
        onSelectWeek={() => { view = 'add'; }}
        onAddWorkout={handleAddWorkoutToWeek}
        onEditWorkout={handleEditWorkout}
        onDeleteWorkout={handleDeleteWorkout}
        onShowAnalytics={() => view = 'analytics'}
      />
    {:else if view === 'add'}
      <WorkoutForm 
        plannedWorkouts={plannedThisWeek} 
        workout={activeWorkout}
        onSave={handleSaveWorkout} 
        onCancel={() => { view = 'plan'; activeWorkout = null; }}
      />
    {:else if view === 'history'}
      <History 
        workouts={workouts.filter(w => w.status === 'completed')} 
        onEdit={handleEditWorkout}
        onDelete={handleDeleteWorkout}
        onOpenSettings={() => view = 'settings'}
      />
    {:else if view === 'settings'}
      <Settings 
        onExport={handleExport}
        onImport={handleImport}
        onBack={() => view = 'history'}
      />
    {:else if view === 'analytics'}
      <Analytics 
        {workouts}
        onBack={() => view = 'plan'}
      />
    {/if}
  </div>

  <nav 
    class="w-full h-[75px] border-t flex justify-evenly items-center shrink-0 select-none"
    style="background-color: #121214; border-color: rgba(255, 255, 255, 0.05);"
  >
    <button 
      onclick={() => { view = 'plan'; activeWorkout = null; }}
      class="flex flex-col items-center justify-center w-24 h-full cursor-pointer transition-all duration-300"
      style="color: {view === 'plan' || view === 'analytics' ? '#10b981' : '#71717a'}; transform: scale({view === 'plan' || view === 'analytics' ? '1.05' : '1'});"
    >
      <Icon icon="ic:baseline-calendar-month" class="text-[28px]" />
      <div class="w-1 h-1 mt-1 rounded-full transition-all duration-300" style="background-color: {view === 'plan' || view === 'analytics' ? '#10b981' : 'transparent'}; transform: scale({view === 'plan' || view === 'analytics' ? '1' : '0'});"></div>
    </button>

    <button 
      onclick={() => { view = 'add'; }}
      class="flex items-center justify-center w-12 h-12 rounded-full cursor-pointer transition-all duration-300 active:scale-90"
      style="background-color: {view === 'add' ? '#10b981' : '#27272a'}; color: {view === 'add' ? '#09090b' : '#a1a1aa'}; box-shadow: {view === 'add' ? '0 0 20px rgba(16, 185, 129, 0.3)' : 'none'};"
    >
      <Icon icon="ic:baseline-plus" class="text-[34px]" />
    </button>

    <button 
      onclick={() => { view = 'history'; activeWorkout = null; }}
      class="flex flex-col items-center justify-center w-24 h-full cursor-pointer transition-all duration-300"
      style="color: {(view === 'history' || view === 'settings') ? '#10b981' : '#71717a'}; transform: scale({(view === 'history' || view === 'settings') ? '1.05' : '1'});"
    >
      <Icon icon="ic:baseline-content-paste" class="text-[28px]" />
      <div class="w-1 h-1 mt-1 rounded-full transition-all duration-300" style="background-color: {(view === 'history' || view === 'settings') ? '#10b981' : 'transparent'}; transform: scale({(view === 'history' || view === 'settings') ? '1' : '0'});"></div>
    </button>
  </nav>

  <FatigueModal 
    show={showFatigue} 
    initialData={activeWorkout}
    duration={activeWorkout?.exercises.reduce((acc, e) => acc + (e.duration || 0), 0) || 0} 
    onConfirm={handleConfirmFatigue} 
    onBack={() => showFatigue = false}
  />
</main>
