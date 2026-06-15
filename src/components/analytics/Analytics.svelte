<script lang="ts">
  import { onMount } from 'svelte';
  import { storage } from '../../lib/storage';
  import { CATEGORY_COLORS } from '../../lib/constants';
  import type { Workout, ExerciseCategory, ExerciseTypeDef } from '../../lib/types';
  import Icon from "@iconify/svelte";

  // --- Props ---
  let { 
    workouts = [],
    onBack
  } = $props<{ 
    workouts: Workout[],
    onBack: () => void
  }>();

  // --- State ---
  let exerciseTypes = $state<ExerciseTypeDef[]>([]);
  const categories: ExerciseCategory[] = ['Technique Bouldering', 'Power Bouldering', 'Arms', 'Legs', 'Core', 'Other'];

  // --- Lifecycle ---
  onMount(async () => {
    exerciseTypes = await storage.getExerciseTypes();
  });

  // --- Logic: Data Processing ---

  function processChartData(data: Workout[], types: ExerciseTypeDef[]) {
    const typeToCategory = new Map<string, ExerciseCategory>();
    types.forEach(t => typeToCategory.set(t.name.toLowerCase(), t.category));

    const completedWorkouts = data
      .filter(w => w.status === 'completed' && w.date)
      .sort((a, b) => new Date(a.date!).getTime() - new Date(b.date!).getTime());

    const weeksMap = new Map<string, { 
      load: number, 
      count: number, 
      categories: Record<string, number> 
    }>();

    completedWorkouts.forEach(w => {
      if (!w.weekId) return;
      
      const week = weeksMap.get(w.weekId) || { 
        load: 0, 
        count: 0, 
        categories: Object.fromEntries(categories.map(c => [c, 0])) 
      };

      week.load += (w.loadFactor || 0);
      week.count += 1;
      
      w.exercises.forEach(e => {
        const category = typeToCategory.get(e.type.toLowerCase()) || 'Other';
        week.categories[category] = (week.categories[category] || 0) + 1;
      });
      
      weeksMap.set(w.weekId, week);
    });

    const sortedWeeks = Array.from(weeksMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12);

    if (sortedWeeks.length === 0) {
      return { weeks: [], maxLoad: 10, maxExercises: 5 };
    }

    const maxLoad = Math.max(...sortedWeeks.map(([_, v]) => v.load / v.count), 10);
    const maxExercises = Math.max(...sortedWeeks.map(([_, v]) => 
      Object.values(v.categories).reduce((a, b) => a + b, 0)
    ), 5);

    return {
      weeks: sortedWeeks.map(([id, data]) => ({
        id,
        label: id.split('-W')[1],
        avgLoad: data.load / data.count,
        categories: data.categories,
        totalExercises: Object.values(data.categories).reduce((a, b) => a + b, 0)
      })),
      maxLoad,
      maxExercises
    };
  }

  const chartData = $derived(processChartData(workouts, exerciseTypes));
</script>

<div class="w-full max-w-lg space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-24">
  <div class="flex items-center gap-4 px-1">
    <button 
      onclick={onBack}
      class="p-2 bg-zinc-800/50 rounded-xl border border-zinc-700/50 text-zinc-400 hover:text-white transition-colors"
    >
      <Icon icon="ic:baseline-arrow-back" class="text-xl" />
    </button>
    <h2 class="text-xl font-bold text-white tracking-tight">Training Analytics</h2>
  </div>

  <div class="space-y-8">
    <div class="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 space-y-6 backdrop-blur-sm shadow-xl">
      <div class="flex items-center justify-between px-1">
        <div>
          <h3 class="text-xs font-bold text-zinc-400 uppercase tracking-widest">Rolling Load</h3>
          <p class="text-[9px] text-zinc-500 uppercase mt-0.5">Historical stress levels</p>
        </div>
        <div class="p-2 bg-blue-500/10 rounded-xl text-blue-500">
          <Icon icon="ic:baseline-trending-up" class="text-lg" />
        </div>
      </div>

      <div class="h-48 flex items-end justify-between gap-2 px-1 relative">
        <div class="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20 py-2">
          <div class="border-t border-zinc-700 w-full"></div>
          <div class="border-t border-zinc-700 w-full"></div>
          <div class="border-t border-zinc-700 w-full"></div>
        </div>

        {#each chartData.weeks as week}
          <div class="flex-1 flex flex-col items-center gap-2 group relative">
            <div 
              class="w-full bg-blue-500/80 rounded-t-lg transition-all duration-500 group-hover:bg-blue-400"
              style="height: {(week.avgLoad / chartData.maxLoad) * 100}%"
            >
              <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-zinc-800 text-[8px] font-bold text-white rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 border border-zinc-700 shadow-xl pointer-events-none">
                AVG: {Math.round(week.avgLoad)}
              </div>
            </div>
            <span class="text-[8px] font-bold text-zinc-600 group-hover:text-zinc-400">W{week.label}</span>
          </div>
        {/each}
      </div>
    </div>

    <div class="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 space-y-6 backdrop-blur-sm shadow-xl">
      <div class="flex items-center justify-between px-1">
        <div>
          <h3 class="text-xs font-bold text-zinc-400 uppercase tracking-widest">Exercise Volume</h3>
          <p class="text-[9px] text-zinc-500 uppercase mt-0.5">Modality breakdown over time</p>
        </div>
        <div class="p-2 bg-emerald-500/10 rounded-xl text-emerald-500">
          <Icon icon="ic:baseline-bar-chart" class="text-lg" />
        </div>
      </div>

      <div class="h-48 flex items-end justify-between gap-2 px-1">
        {#each chartData.weeks as week}
          <div class="flex-1 flex flex-col items-center gap-2 group">
            <div class="w-full flex flex-col-reverse rounded-t-lg overflow-hidden h-full justify-end">
              {#each categories as cat}
                {#if week.categories[cat]}
                  <div 
                    class="{CATEGORY_COLORS[cat]} w-full border-t border-zinc-900/20 first:border-0"
                    style="height: {(week.categories[cat] / chartData.maxExercises) * 100}%"
                  ></div>
                {/if}
              {/each}
            </div>
            <span class="text-[8px] font-bold text-zinc-600 group-hover:text-zinc-400">W{week.label}</span>
          </div>
        {/each}
      </div>

      <div class="flex flex-wrap gap-x-4 gap-y-2 px-1 pt-2">
        {#each categories as cat}
          <div class="flex items-center gap-1.5">
            <div class="w-2 h-2 rounded-full {CATEGORY_COLORS[cat]}"></div>
            <span class="text-[8px] font-bold text-zinc-500 uppercase tracking-widest">{cat}</span>
          </div>
        {/each}
      </div>
    </div>

    {#if workouts.filter(w => w.status === 'completed').length === 0}
      <div class="py-12 text-center bg-zinc-800/20 rounded-3xl border border-dashed border-zinc-800">
        <Icon icon="ic:baseline-insights" class="text-3xl text-zinc-700 mx-auto mb-3" />
        <p class="text-[10px] text-zinc-500 italic uppercase tracking-widest px-8 leading-relaxed">
          Complete some sessions to unlock detailed training analytics
        </p>
      </div>
    {/if}
  </div>
</div>
