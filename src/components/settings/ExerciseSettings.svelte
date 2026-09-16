<script lang="ts">
  import type { ExerciseTypeDef, AnalyticsCategory, WorkoutTemplate } from '../../lib/types';
  import ExerciseTypeSettings from './ExerciseTypeSettings.svelte';
  import AnalyticsCategorySettings from './AnalyticsCategorySettings.svelte';

  let {
    exerciseTypes = $bindable(),
    analyticsCategories = $bindable(),
    templates,
  }: {
    exerciseTypes: ExerciseTypeDef[];
    analyticsCategories: AnalyticsCategory[];
    templates: Record<string, WorkoutTemplate[]>;
  } = $props();

  type SubTab = 'modalities' | 'categories';
  let subTab = $state<SubTab>('modalities');
</script>

<div class="bg-surface/50 border border-border rounded-3xl p-6 space-y-6 backdrop-blur-sm shadow-xl">
  <div class="space-y-2">
    <h3 class="text-xs font-bold text-content-muted uppercase tracking-widest px-1">Exercises</h3>
    <p class="text-[10px] text-content-subtle px-1 leading-relaxed">What you can log in a workout, and how it's grouped on charts.</p>
  </div>

  <div class="flex bg-surface-elevated/50 rounded-xl border border-border p-1">
    <button
      onclick={() => subTab = 'modalities'}
      class="flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all {subTab === 'modalities' ? 'bg-primary text-white shadow-lg' : 'text-content-muted hover:text-content'}"
    >
      Modalities
    </button>
    <button
      onclick={() => subTab = 'categories'}
      class="flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all {subTab === 'categories' ? 'bg-primary text-white shadow-lg' : 'text-content-muted hover:text-content'}"
    >
      Analytics Categories
    </button>
  </div>

  {#if subTab === 'modalities'}
    <div class="space-y-2">
      <p class="text-[10px] text-content-subtle px-1 leading-relaxed">The kinds of exercises you can add to a workout or template (e.g. "Free Bouldering", "Max Hangs"). Each one defines which fields (sets, grades, hold size, ...) show up when you log it, plus a default category below used for charts.</p>
    </div>
    <ExerciseTypeSettings bind:exerciseTypes {analyticsCategories} />
  {:else}
    <div class="space-y-2">
      <p class="text-[10px] text-content-subtle px-1 leading-relaxed">Groupings used only by the charts in the Analytics tab (e.g. "Fingers", "Power Bouldering") — reorder them to change chart legend order. Every modality picks one of these as its default; nothing here changes what you can log.</p>
    </div>
    <AnalyticsCategorySettings bind:analyticsCategories {templates} />
  {/if}
</div>
