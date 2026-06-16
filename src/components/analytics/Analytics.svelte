<script lang="ts">
  import { trainingState } from '../../lib/state.svelte';
  import { CATEGORY_COLORS } from '../../lib/constants';
  import { getWeekId } from '../../lib/dateUtils';
  import type { Workout, ExerciseCategory, ExerciseTypeDef, Benchmark } from '../../lib/types';
  import Icon from "@iconify/svelte";

  // --- State ---
  const categories: ExerciseCategory[] = ['Technique Bouldering', 'Power Bouldering', 'Fingers', 'Arms', 'Legs', 'Core', 'Other'];
  let selectedBenchmarkType = $state<string>('');
  let viewOffset = $state<number>(0);

  // --- Handlers ---
  function navigate(direction: 'prev' | 'next' | 'today') {
    if (direction === 'prev') viewOffset--;
    else if (direction === 'next') viewOffset++;
    else if (direction === 'today') viewOffset = 0;
  }

  // --- Logic: Data Processing ---

  /**
   * Derives chart data for the "Rolling Load" and "Exercise Volume" graphs.
   * Processes the last 12 weeks of data, aggregating total actual load, total
   * planned load, and counts of exercise categories.
   */
  const chartData = $derived.by(() => {
    const data = trainingState.workouts;
    const types = trainingState.exerciseTypes;
    
    // Quick lookup for assigning categories to recorded exercises
    const typeToCategory = new Map<string, ExerciseCategory>();
    types.forEach((t: ExerciseTypeDef) => typeToCategory.set(t.name.toLowerCase(), t.category));

    const completedWorkouts = data
      .filter((w: Workout) => w.status === 'completed' && w.date)
      .sort((a: Workout, b: Workout) => new Date(a.date!).getTime() - new Date(b.date!).getTime());

    const allRelevantWorkouts = data.filter(w => w.weekId);

    const weeksMap = new Map<string, { 
      load: number, 
      plannedLoad: number,
      completedCount: number,
      totalCount: number,
      categories: Record<string, number> 
    }>();

    const weeksToDisplay: string[] = [];
    // Display 12 weeks at a time. If viewOffset is 0, show 9 weeks back to 2 weeks ahead.
    const startOffset = -9 + (viewOffset * 12);
    const endOffset = 2 + (viewOffset * 12);

    for (let i = startOffset; i <= endOffset; i++) {
      const d = new Date();
      d.setDate(d.getDate() + (i * 7));
      const id = getWeekId(d);
      weeksToDisplay.push(id);
      
      weeksMap.set(id, {
        load: 0,
        plannedLoad: 0,
        completedCount: 0,
        totalCount: 0,
        categories: Object.fromEntries(categories.map(c => [c, 0]))
      });
    }

    // Only process workouts that fall within our displayed weeks
    const visibleWorkouts = allRelevantWorkouts.filter(w => weeksToDisplay.includes(w.weekId));

    visibleWorkouts.forEach((w: Workout) => {
      const week = weeksMap.get(w.weekId)!;

      week.plannedLoad += (w.plannedLoad || 0);
      week.totalCount += 1;

      if (w.status === 'completed') {
        week.load += (w.loadFactor || 0);
        week.completedCount += 1;
      }
      
      // Count exercises for both planned and completed to show Training Mix
      w.exercises?.forEach(e => {
        const typeKey = (e.type || '').trim().toLowerCase();
        let category = typeToCategory.get(typeKey);
        
        if (!category) {
          if (typeKey.includes('hang')) category = 'Fingers';
          else if (typeKey.includes('pull')) category = 'Arms';
          else if (typeKey.includes('core')) category = 'Core';
          else if (typeKey.includes('board') || typeKey.includes('boulder')) category = 'Power Bouldering';
          else category = 'Other';
        }
        
        // Weight the ratio by duration (default to 30 mins if not specified)
        const durationWeight = e.duration ? e.duration : 30;
        week.categories[category] = (week.categories[category] || 0) + durationWeight;
      });
    });

    const sortedWeeks = weeksToDisplay.map(id => [id, weeksMap.get(id)!] as const);

    const getWeeklyTotal = (v: any) => v.load || 0;
    const getWeeklyPlannedTotal = (v: any) => v.plannedLoad || 0;

    const maxLoad = Math.max(...sortedWeeks.map(([_, v]) => Math.max(getWeeklyTotal(v), getWeeklyPlannedTotal(v))), 100) * 1.15;

    return {
      weeks: sortedWeeks.map(([id, data]) => ({
        id,
        label: id.split('-W')[1],
        totalLoad: getWeeklyTotal(data),
        totalPlannedLoad: getWeeklyPlannedTotal(data),
        categories: data.categories,
        totalDuration: Object.values(data.categories).reduce((a: number, b: number) => a + b, 0),
        isCurrent: id === trainingState.currentWeekId
      })),
      maxLoad
    };
  });

  /**
   * Derives chart data for the "Benchmark Progress" line graph.
   * Filters the last 10 historical entries for the currently selected benchmark type
   * and calculates SVG paths for the interactive line and area gradient.
   */
  const benchmarkProgress = $derived.by(() => {
    const data = trainingState.benchmarks;
    const benchmarkTypes = trainingState.benchmarkTypes;
    
    if (benchmarkTypes.length === 0) {
      return { types: [], history: [], maxValue: 1, unit: '', areaPath: '', linePath: '' };
    }

    const availableTypes = benchmarkTypes;

    // Use a local variable for the effective selection to avoid mutating state in derived
    let effectiveTypeId = selectedBenchmarkType;
    if (!effectiveTypeId || !availableTypes.find(t => t.id === effectiveTypeId)) {
      effectiveTypeId = availableTypes[0].id;
    }

    const filtered = data
      .filter(b => b.typeId === effectiveTypeId)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-10);

    const maxValue = filtered.length > 0 ? Math.max(...filtered.map(b => b.value), 1) * 1.25 : 1;
    const selectedTypeInfo = availableTypes.find(t => t.id === effectiveTypeId);
    const unit = selectedTypeInfo ? selectedTypeInfo.unit : '';

    const history = filtered.map(b => ({
      ...b,
      height: (b.value / maxValue) * 100
    }));

    const count = history.length;
    const points = history.map((b, i) => ({
      x: (i / Math.max(count - 1, 1)) * 100,
      y: 100 - b.height
    }));

    const areaPath = count > 1 ? `M 0,100 ${points.map(p => `L ${p.x},${p.y}`).join(' ')} L 100,100 Z` : '';
    const linePath = count > 1 ? `M ${points.map(p => `${p.x},${p.y}`).join(' L ')}` : '';

    return {
      types: availableTypes,
      history,
      maxValue,
      unit,
      areaPath,
      linePath
    };
  });

  $effect(() => {
    const benchmarkTypes = trainingState.benchmarkTypes;
    if (benchmarkTypes.length > 0) {
      if (!selectedBenchmarkType || !benchmarkTypes.find(t => t.id === selectedBenchmarkType)) {
        selectedBenchmarkType = benchmarkTypes[0].id;
      }
    }
  });
</script>

<div class="w-full max-w-lg space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-24">
  <div class="flex items-center justify-between px-1">
    <div class="flex items-center gap-4">
      <button 
        onclick={() => trainingState.navigate('plan')}
        class="p-2 bg-zinc-800/50 rounded-xl border border-zinc-700/50 text-zinc-400 hover:text-white transition-colors"
      >
        <Icon icon="ic:baseline-arrow-back" class="text-xl" />
      </button>
      <h2 class="text-xl font-bold text-white tracking-tight">Training Analytics</h2>
    </div>
    
    <button 
      onclick={() => trainingState.exportToCSV()}
      class="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-xl border border-zinc-700/50 transition-all text-[10px] font-bold uppercase tracking-widest active:scale-95"
    >
      <Icon icon="ic:baseline-download" class="text-sm" />
      CSV Export
    </button>
  </div>

  <div class="space-y-8">
    <div class="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 space-y-6 backdrop-blur-sm shadow-xl overflow-hidden relative">
      <!-- Background Glow -->
      <div class="absolute -top-24 -right-24 w-48 h-48 bg-blue-500/10 blur-[100px] pointer-events-none"></div>
      
      <div class="flex items-center justify-between px-1 relative z-10">
        <div>
          <h3 class="text-xs font-bold text-zinc-400 uppercase tracking-widest">Rolling Load</h3>
          <p class="text-[9px] text-zinc-500 uppercase mt-0.5">Weekly Targets vs Actual Output</p>
        </div>
        <div class="flex items-center gap-2">
          <button onclick={() => navigate('today')} class="px-2 py-1 bg-zinc-800/50 hover:bg-zinc-800 text-[9px] font-black text-zinc-400 hover:text-white uppercase tracking-widest rounded-lg transition-all active:scale-95 border border-zinc-700/50">Today</button>
          <div class="flex bg-zinc-900/50 rounded-xl border border-zinc-800 p-1">
            <button onclick={() => navigate('prev')} class="p-1.5 hover:bg-zinc-800 text-zinc-500 hover:text-white rounded-lg transition-colors"><Icon icon="ic:baseline-chevron-left" class="text-lg" /></button>
            <button onclick={() => navigate('next')} class="p-1.5 hover:bg-zinc-800 text-zinc-500 hover:text-white rounded-lg transition-colors"><Icon icon="ic:baseline-chevron-right" class="text-lg" /></button>
          </div>
        </div>
      </div>

      <div class="h-56 flex flex-col gap-2 relative z-10 px-1">
        <!-- Chart Area -->
        <div class="flex-1 relative flex items-end justify-between gap-2">
          <!-- Grid Lines -->
          <div class="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20 py-2">
            <div class="border-t border-zinc-700 w-full"></div>
            <div class="border-t border-zinc-700 w-full"></div>
            <div class="border-t border-zinc-700 w-full"></div>
          </div>

          <!-- Planned Load Line (SVG) -->
          <svg 
            class="absolute inset-0 w-full h-full overflow-visible pointer-events-none" 
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {#if chartData.weeks.length > 1}
              {@const planPoints = chartData.weeks.map((w, i) => ({
                x: ((i + 0.5) / chartData.weeks.length) * 100,
                y: 100 - (w.totalPlannedLoad / chartData.maxLoad) * 100,
                val: w.totalPlannedLoad
              }))}
              
              {@const connectedPoints = planPoints.filter(p => p.val > 0)}
              
              {#if connectedPoints.length > 1}
                <path 
                  d="M {connectedPoints.map(p => `${p.x} ${p.y}`).join(' L ')}" 
                  fill="none" 
                  stroke="#10b981" 
                  stroke-width="2" 
                  stroke-dasharray="4 3"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  vector-effect="non-scaling-stroke"
                  class="transition-all duration-1000"
                />
              {/if}
              
              <!-- Target Dots -->
              {#each planPoints as p}
                {#if p.val > 0}
                  <circle cx={p.x} cy={p.y} r="1.5" fill="#10b981" class="transition-all duration-1000" />
                {/if}
              {/each}
            {/if}
          </svg>

          {#each chartData.weeks as week}
            <div class="flex-1 flex flex-col items-center group relative h-full justify-end">
              <div 
                class="w-full bg-gradient-to-t from-blue-600/60 to-blue-400 rounded-t-lg transition-all duration-700 group-hover:from-blue-500 group-hover:to-blue-300 relative shadow-[0_-4px_12px_rgba(59,130,246,0.2)]"
                style="height: {(week.totalLoad / chartData.maxLoad) * 100}%"
              >
                <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 px-2 py-1.5 bg-zinc-800 text-[9px] font-black text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all scale-95 group-hover:scale-100 whitespace-nowrap z-20 border border-zinc-700 shadow-2xl pointer-events-none">
                  <div class="flex flex-col gap-1">
                    <div class="flex items-center gap-2">
                      <div class="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                      <span>Actual: {Math.round(week.totalLoad)}</span>
                    </div>
                    <div class="flex items-center gap-2 text-emerald-400">
                      <div class="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                      <span>Target: {Math.round(week.totalPlannedLoad)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          {/each}
        </div>
        
        <!-- X-Axis Labels -->
        <div class="flex justify-between gap-2 h-4">
          {#each chartData.weeks as week}
            <div class="flex-1 flex justify-center">
              <span class="text-[8px] font-bold text-zinc-600 {week.isCurrent ? 'text-blue-500' : ''}">W{week.label}</span>
            </div>
          {/each}
        </div>
      </div>

      <div class="flex items-center gap-6 px-1 pt-2 relative z-10">
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 rounded-md bg-gradient-to-t from-blue-600/80 to-blue-400"></div>
          <span class="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Actual Output</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="w-4 h-0 border-t-2 border-dashed border-emerald-500"></div>
          <span class="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Target Path</span>
        </div>
      </div>
    </div>

    <div class="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 space-y-6 backdrop-blur-sm shadow-xl relative overflow-hidden">
      <div class="absolute -bottom-24 -left-24 w-48 h-48 bg-emerald-500/10 blur-[100px] pointer-events-none"></div>

      <div class="flex items-center justify-between px-1 relative z-10">
        <div>
          <h3 class="text-xs font-bold text-zinc-400 uppercase tracking-widest">Training Mix</h3>
          <p class="text-[9px] text-zinc-500 uppercase mt-0.5">Activity breakdown by category</p>
        </div>
        <div class="flex items-center gap-2">
          <button onclick={() => navigate('today')} class="px-2 py-1 bg-zinc-800/50 hover:bg-zinc-800 text-[9px] font-black text-zinc-400 hover:text-white uppercase tracking-widest rounded-lg transition-all active:scale-95 border border-zinc-700/50">Today</button>
          <div class="flex bg-zinc-900/50 rounded-xl border border-zinc-800 p-1">
            <button onclick={() => navigate('prev')} class="p-1.5 hover:bg-zinc-800 text-zinc-500 hover:text-white rounded-lg transition-colors"><Icon icon="ic:baseline-chevron-left" class="text-lg" /></button>
            <button onclick={() => navigate('next')} class="p-1.5 hover:bg-zinc-800 text-zinc-500 hover:text-white rounded-lg transition-colors"><Icon icon="ic:baseline-chevron-right" class="text-lg" /></button>
          </div>
        </div>
      </div>

      <div class="h-48 flex items-end justify-between gap-2 px-1 relative">
        {#each chartData.weeks as week}
          <div class="flex-1 flex flex-col items-center gap-2 group relative h-full justify-end">
            <div class="w-full flex flex-col-reverse rounded-t-lg overflow-hidden h-full justify-end shadow-lg">
              {#each categories as cat}
                {#if week.categories[cat] && week.totalDuration > 0}
                  <div 
                    class="{CATEGORY_COLORS[cat]} w-full border-t border-zinc-900/20 first:border-0 opacity-90 hover:opacity-100 transition-opacity"
                    style="height: {(week.categories[cat] / week.totalDuration) * 100}%"
                  ></div>
                {/if}
              {/each}
            </div>
            <span class="text-[8px] font-bold text-zinc-600 group-hover:text-zinc-400">W{week.label}</span>
          </div>
        {/each}
      </div>

      <div class="flex flex-wrap gap-x-4 gap-y-2 px-1 pt-2 relative z-10">
        {#each categories as cat}
          <div class="flex items-center gap-2">
            <div class="w-2.5 h-2.5 rounded-full {CATEGORY_COLORS[cat]} shadow-[0_0_8px_rgba(0,0,0,0.3)]"></div>
            <span class="text-[8px] font-bold text-zinc-500 uppercase tracking-widest">{cat}</span>
          </div>
        {/each}
      </div>
    </div>

    {#if benchmarkProgress.types.length > 0}
      <div class="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 space-y-6 backdrop-blur-sm shadow-xl">
        <div class="flex items-center justify-between px-1">
          <div>
            <h3 class="text-xs font-bold text-zinc-400 uppercase tracking-widest">Benchmark Progress</h3>
            <div class="relative mt-1">
              <select 
                bind:value={selectedBenchmarkType}
                class="bg-transparent text-[9px] text-blue-500 uppercase font-bold outline-none appearance-none pr-4 cursor-pointer"
              >
                {#each benchmarkProgress.types as type}
                  <option value={type.id}>{type.name}</option>
                {/each}
              </select>
              <Icon icon="ic:baseline-arrow-drop-down" class="absolute right-0 top-1/2 -translate-y-1/2 text-blue-500 pointer-events-none" />
            </div>
          </div>
          <div class="p-2 bg-blue-500/10 rounded-xl text-blue-500">
            <Icon icon="ic:baseline-insights" class="text-lg" />
          </div>
        </div>

        <div class="h-48 relative px-1">
          <!-- Grid Lines -->
          <div class="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20 py-2">
            <div class="border-t border-zinc-700 w-full"></div>
            <div class="border-t border-zinc-700 w-full"></div>
            <div class="border-t border-zinc-700 w-full"></div>
          </div>

          <!-- SVG Line Graph -->
          <svg class="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
            <defs>
              <linearGradient id="line-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.3" />
                <stop offset="100%" stop-color="#3b82f6" stop-opacity="0" />
              </linearGradient>
            </defs>
            
            {#if benchmarkProgress.history.length > 1}
              <!-- Area under line -->
              <path 
                d={benchmarkProgress.areaPath}
                fill="url(#line-gradient)"
                class="transition-all duration-700"
              />
              
              <!-- The Line -->
              <path 
                d={benchmarkProgress.linePath}
                fill="none" 
                stroke="#3b82f6" 
                stroke-width="3" 
                stroke-linecap="round" 
                stroke-linejoin="round"
                class="transition-all duration-700"
              />
            {/if}
          </svg>

          <!-- Data Points & Labels -->
          <div class="absolute inset-0 flex justify-between items-end h-full">
            {#each benchmarkProgress.history as entry, i}
              {@const xPos = (i / Math.max(benchmarkProgress.history.length - 1, 1)) * 100}
              <div class="absolute flex flex-col items-center group" style="left: {xPos}%; height: 100%;">
                <!-- Tooltip -->
                <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 px-2 py-1 bg-zinc-800 text-[8px] font-bold text-white rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20 border border-zinc-700 shadow-xl pointer-events-none">
                  {entry.value} {entry.unit}
                </div>
                
                <!-- Dot -->
                <div 
                  class="w-3 h-3 bg-blue-500 rounded-full border-4 border-[#121214] shadow-lg group-hover:scale-150 transition-transform z-10 absolute -translate-x-1/2"
                  style="bottom: {entry.height}%; left: 0;"
                ></div>

                <!-- Date Label -->
                <span class="text-[8px] font-bold text-zinc-600 group-hover:text-zinc-400 absolute top-full mt-2 rotate-[-45deg] origin-top-left whitespace-nowrap">
                  {new Date(entry.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              </div>
            {/each}
          </div>
          
          {#if benchmarkProgress.history.length === 0}
            <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
              <p class="text-[10px] text-zinc-600 italic font-bold uppercase tracking-widest text-center px-4 leading-relaxed">
                Log a {benchmarkProgress.types.find(t => t.id === selectedBenchmarkType)?.name || 'benchmark'} to see your progress
              </p>
            </div>
          {/if}
        </div>
        <div class="h-6"></div> <!-- Spacer for rotated labels -->
      </div>
    {/if}

    {#if trainingState.completedWorkouts.length === 0}
      <div class="py-12 text-center bg-zinc-800/20 rounded-3xl border border-dashed border-zinc-800">
        <Icon icon="ic:baseline-insights" class="text-3xl text-zinc-700 mx-auto mb-3" />
        <p class="text-[10px] text-zinc-500 italic uppercase tracking-widest px-8 leading-relaxed">
          Complete some sessions to unlock detailed training analytics
        </p>
      </div>
    {/if}
  </div>
</div>
