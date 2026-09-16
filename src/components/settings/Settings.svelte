<script lang="ts">
  import { trainingState } from '../../lib/state.svelte';
  import { onMount } from 'svelte';
  import { storage } from '../../lib/storage';
  import { showAlert, showConfirm } from '../../lib/utils';
  import type { ExerciseTypeDef, PhaseDef, WorkoutTemplate, BenchmarkTypeDef, AnalyticsCategory } from '../../lib/types';
  import ExerciseSettings from './ExerciseSettings.svelte';
  import PhaseSettings from './PhaseSettings.svelte';
  import BenchmarkTypeSettings from './BenchmarkTypeSettings.svelte';
  import BackupSettings from './BackupSettings.svelte';
  import PreferencesSettings from './PreferencesSettings.svelte';
  import Icon from "@iconify/svelte";

  // --- Props ---
  let {
    onExport,
    onImport
  } = $props<{
    onExport: () => void,
    onImport: (e: Event) => void
  }>();

  // --- State: Tabs ---
  type SettingsTab = 'overview' | 'customization' | 'design' | 'integration' | 'about';
  let currentTab = $state<SettingsTab>('overview');

  // --- State: local editable copies of every catalog, saved together via "Save All" ---
  let templates = $state<Record<string, WorkoutTemplate[]>>({});
  let phaseDefs = $state<PhaseDef[]>([]);
  let exerciseTypes = $state<ExerciseTypeDef[]>([]);
  let benchmarkTypes = $state<BenchmarkTypeDef[]>([]);
  let analyticsCategories = $state<AnalyticsCategory[]>([]);

  // --- Lifecycle ---
  onMount(async () => {
    templates = await storage.getTemplates();
    phaseDefs = await storage.getPhaseDefs();
    exerciseTypes = await storage.getExerciseTypes();
    benchmarkTypes = await storage.getBenchmarkTypes();
    analyticsCategories = await storage.getAnalyticsCategories();
  });

  // --- Global Actions ---
  async function saveAll() {
    try {
      await storage.saveTemplates($state.snapshot(templates));
      await storage.savePhaseDefs($state.snapshot(phaseDefs));
      await storage.saveExerciseTypes($state.snapshot(exerciseTypes));
      await storage.saveBenchmarkTypes($state.snapshot(benchmarkTypes));
      await storage.saveAnalyticsCategories($state.snapshot(analyticsCategories));
      await trainingState.refresh();
      await showAlert('Settings', 'Settings saved successfully!');
    } catch (err) {
      await showAlert('Settings Error', err instanceof Error ? err.message : 'Failed to save settings.');
    }
  }

  async function resetTemplates() {
    const confirmed = await showConfirm('Reset Templates', 'Reset all templates to default? This will overwrite your customizations.');
    if (!confirmed) return;
    await trainingState.resetTemplates();
    templates = await storage.getTemplates();
  }
</script>

<div class="w-full max-w-lg space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-24">
  <div class="flex items-center justify-between px-1">
    <div class="flex items-center gap-4">
      {#if currentTab === 'overview'}
        <button onclick={() => trainingState.navigate('history')} class="p-2 bg-surface-elevated/50 rounded-xl border border-border-strong/50 text-content-muted hover:text-content transition-colors"><Icon icon="ic:baseline-arrow-back" class="text-xl" /></button>
        <h2 class="text-xl font-bold text-content tracking-tight">Settings</h2>
      {:else}
        <button onclick={() => currentTab = 'overview'} class="p-2 bg-surface-elevated/50 rounded-xl border border-border-strong/50 text-content-muted hover:text-content transition-colors"><Icon icon="ic:baseline-arrow-back" class="text-xl" /></button>
        <h2 class="text-xl font-bold text-content tracking-tight">
          {#if currentTab === 'customization'}Customization
          {:else if currentTab === 'design'}Appearance & Design
          {:else if currentTab === 'integration'}Data & Exports
          {:else if currentTab === 'about'}About & Impressum{/if}
        </h2>
      {/if}
    </div>
    {#if currentTab === 'customization'}
      <button onclick={saveAll} class="px-4 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-bold rounded-xl transition-all shadow-lg active:scale-95">Save All</button>
    {/if}
  </div>

  {#if currentTab === 'overview'}
    <div class="space-y-4">
      <button onclick={() => currentTab = 'customization'} class="w-full flex items-center justify-between p-5 bg-surface/50 hover:bg-surface-elevated border border-border rounded-3xl transition-all group backdrop-blur-sm shadow-xl">
        <div class="flex items-center gap-4">
          <div class="p-3 bg-primary-hover/10 rounded-2xl text-primary group-hover:bg-primary-hover group-hover:text-white transition-colors"><Icon icon="ic:baseline-tune" class="text-2xl" /></div>
          <div class="text-left"><p class="text-base font-bold text-content">Customization</p><p class="text-[11px] text-content-subtle mt-1">Exercises, categories, training phases, templates & benchmarks</p></div>
        </div>
        <Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-2xl" />
      </button>
      <button onclick={() => currentTab = 'design'} class="w-full flex items-center justify-between p-5 bg-surface/50 hover:bg-surface-elevated border border-border rounded-3xl transition-all group backdrop-blur-sm shadow-xl">
        <div class="flex items-center gap-4">
          <div class="p-3 bg-tertiary-hover/10 rounded-2xl text-tertiary group-hover:bg-tertiary-hover group-hover:text-white transition-colors"><Icon icon="ic:baseline-color-lens" class="text-2xl" /></div>
          <div class="text-left"><p class="text-base font-bold text-content">Appearance & Design</p><p class="text-[11px] text-content-subtle mt-1">Interface aesthetics and accessibility</p></div>
        </div>
        <Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-2xl" />
      </button>
      <button onclick={() => currentTab = 'integration'} class="w-full flex items-center justify-between p-5 bg-surface/50 hover:bg-surface-elevated border border-border rounded-3xl transition-all group backdrop-blur-sm shadow-xl">
        <div class="flex items-center gap-4">
          <div class="p-3 bg-emerald-500/10 rounded-2xl text-emerald-500 group-hover:bg-emerald-500 group-hover:text-white transition-colors"><Icon icon="ic:baseline-sync" class="text-2xl" /></div>
          <div class="text-left"><p class="text-base font-bold text-content">Data & Exports</p><p class="text-[11px] text-content-subtle mt-1">Manage backups and external integrations</p></div>
        </div>
        <Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-2xl" />
      </button>
      <button onclick={() => currentTab = 'about'} class="w-full flex items-center justify-between p-5 bg-surface/50 hover:bg-surface-elevated border border-border rounded-3xl transition-all group backdrop-blur-sm shadow-xl">
        <div class="flex items-center gap-4">
          <div class="p-3 bg-zinc-500/10 rounded-2xl text-content-subtle group-hover:bg-zinc-500 group-hover:text-content transition-colors"><Icon icon="ic:baseline-info" class="text-2xl" /></div>
          <div class="text-left"><p class="text-base font-bold text-content">About & Impressum</p><p class="text-[11px] text-content-subtle mt-1">Application details and legal information</p></div>
        </div>
        <Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-2xl" />
      </button>
    </div>
  {:else if currentTab === 'customization'}
    <div class="space-y-6">
      <div class="bg-primary/5 border border-primary/20 rounded-3xl p-5 space-y-2.5">
        <div class="flex items-center gap-2 text-primary">
          <Icon icon="ic:baseline-info" class="text-lg" />
          <span class="text-[10px] font-black uppercase tracking-widest">How These Fit Together</span>
        </div>
        <p class="text-[10px] text-content-muted leading-relaxed">
          <strong class="text-content">Exercises</strong> define what you can log in a workout, grouped for charts by <strong class="text-content">Analytics Category</strong>. <strong class="text-content">Training Phases</strong> (Strength, Deload, ...) are the macrocycle blocks you assign to weeks on the Training Plan calendar — tap a phase below to edit the default workouts it generates. <strong class="text-content">Benchmarks</strong> are separate periodic tests (max hang, max pull-up) logged on their own, not part of a workout.
        </p>
      </div>
      <ExerciseSettings bind:exerciseTypes bind:analyticsCategories {templates} />
      <PhaseSettings bind:phaseDefs bind:templates onResetAllTemplates={resetTemplates} />
      <BenchmarkTypeSettings bind:benchmarkTypes />
    </div>
  {:else if currentTab === 'design'}
    <PreferencesSettings />
  {:else if currentTab === 'integration'}
    <BackupSettings {onExport} {onImport} />
  {:else if currentTab === 'about'}
    <div class="space-y-6">
      <div class="bg-surface/50 border border-border rounded-3xl p-6 space-y-6 backdrop-blur-sm shadow-xl animate-in fade-in">
        <div class="space-y-4">
          <div class="text-center py-4">
            <Icon icon="ic:baseline-terrain" class="text-6xl text-primary mx-auto mb-2" />
            <h3 class="text-xl font-black text-content">Climbing Tracker</h3>
            <p class="text-xs text-content-subtle mt-1">Version 1.0.0</p>
          </div>

          <div class="space-y-2 pt-4 border-t border-border">
            <h4 class="text-xs font-bold text-content-muted uppercase tracking-widest">Impressum</h4>
            <p class="text-[11px] text-content-muted leading-relaxed">
              Developer: Climbing Tracker Team<br/>
              Contact: support@climbingtracker.app<br/>
              <br/>
              Created with passion for the climbing community.
            </p>
          </div>

          <div class="space-y-2 pt-4 border-t border-border">
            <h4 class="text-xs font-bold text-content-muted uppercase tracking-widest">Credits & Dependencies</h4>
            <ul class="text-[11px] text-content-muted space-y-1 list-disc list-inside">
              <li>Built with Svelte & Capacitor</li>
              <li>Icons by Iconify (Material Icons)</li>
              <li>Charts powered by Chart.js</li>
            </ul>
          </div>

          <div class="space-y-2 pt-4 border-t border-border">
            <h4 class="text-xs font-bold text-content-muted uppercase tracking-widest">License</h4>
            <p class="text-[11px] text-content-muted leading-relaxed">
              MIT License. See full terms online.
            </p>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
