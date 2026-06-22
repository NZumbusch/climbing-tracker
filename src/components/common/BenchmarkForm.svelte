<script lang="ts">
  /**
   * BenchmarkForm Component
   * 
   * Provides a unified form for creating and editing performance benchmarks
   * (e.g., Max Hangs, Pull-up 1RM). Automatically handles unit syncing based
   * on the selected benchmark type.
   */
  import { trainingState } from '../../lib/state.svelte';
  import { generateId, showAlert } from '../../lib/utils';
  import type { Benchmark, BenchmarkTypeDef } from '../../lib/types';
  import Icon from "@iconify/svelte";

  // --- Props ---
  let { 
    initialData = null, 
    weekId = '',
    onSave = () => {},
    onCancel = () => {}
  } = $props<{ 
    /** Pre-existing benchmark data if editing an existing entry */
    initialData?: Benchmark | null, 
    /** The macrocycle week this benchmark belongs to */
    weekId?: string,
    /** Callback fired after a successful save */
    onSave?: () => void,
    /** Callback fired when the user cancels the form */
    onCancel?: () => void
  }>();

  // --- Local State ---
  let benchmark = $state<Benchmark>({
    id: generateId(),
    typeId: '',
    type: '',
    value: 0,
    unit: '',
    date: new Date().toISOString(),
    weekId: '',
    notes: ''
  });

  // --- Derived State ---
  const benchmarkTypes = $derived(trainingState.benchmarkTypes);

  // --- Lifecycle & Sync ---
  $effect(() => {
    if (initialData) {
      // Hydrate form for editing
      benchmark.id = initialData.id;
      benchmark.typeId = initialData.typeId;
      benchmark.type = initialData.type;
      benchmark.value = initialData.value;
      benchmark.unit = initialData.unit;
      benchmark.date = initialData.date;
      benchmark.weekId = initialData.weekId;
      benchmark.notes = initialData.notes ?? '';
    } else if (weekId) {
      // Initialize new form
      benchmark.weekId = weekId;
      if (benchmarkTypes.length > 0 && !benchmark.typeId) {
        benchmark.typeId = benchmarkTypes[0].id;
        benchmark.type = benchmarkTypes[0].name;
        benchmark.unit = benchmarkTypes[0].unit;
      }
    }
  });

  // --- Handlers ---

  /**
   * Syncs the unit and type name when the user changes the benchmark modality.
   */
  function handleTypeChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    const selected = benchmarkTypes.find(t => t.id === target.value);
    if (selected) {
      benchmark.typeId = selected.id;
      benchmark.type = selected.name;
      benchmark.unit = selected.unit;
    }
  }

  /**
   * Validates and commits the benchmark to the global state.
   */
  async function handleSubmit() {
    if (!benchmark.typeId) {
      await showAlert('Validation Error', 'Please select a benchmark type.');
      return;
    }
    await trainingState.saveBenchmark($state.snapshot(benchmark));
    onSave();
  }
</script>

<!-- UI Structure -->
<div class="space-y-4 p-5 bg-surface/80 rounded-3xl border border-border animate-in zoom-in-95 shadow-2xl">
  <div class="flex items-center justify-between px-1">
    <h3 class="text-sm font-bold text-content tracking-tight">Benchmark Test</h3>
    <button onclick={onCancel} class="text-content-subtle hover:text-content transition-colors">
      <Icon icon="ic:baseline-close" />
    </button>
  </div>

  <div class="space-y-3">
    <div class="space-y-1">
      <label for="benchmark-type" class="text-[8px] font-black text-content-subtle uppercase tracking-widest ml-1">Type</label>
      <select 
        id="benchmark-type"
        bind:value={benchmark.typeId} 
        onchange={handleTypeChange}
        class="w-full bg-surface-elevated text-content p-3 rounded-xl border border-border-strong outline-none text-sm appearance-none"
      >
        <option value="" disabled>Select Type</option>
        {#each benchmarkTypes as type}
          <option value={type.id}>{type.name}</option>
        {/each}
      </select>
    </div>

    <div class="flex gap-3">
      <div class="flex-1 space-y-1">
        <label for="benchmark-value" class="text-[8px] font-black text-content-subtle uppercase tracking-widest ml-1">Result</label>
        <input 
          id="benchmark-value"
          type="number" 
          bind:value={benchmark.value} 
          class="w-full bg-surface-elevated text-content p-3 rounded-xl border border-border-strong outline-none text-sm"
        />
      </div>
      <div class="w-24 space-y-1">
        <label for="benchmark-unit" class="text-[8px] font-black text-content-subtle uppercase tracking-widest ml-1">Unit</label>
        <input 
          id="benchmark-unit"
          bind:value={benchmark.unit} 
          readonly
          class="w-full bg-surface-elevated-hover/50 text-content-muted p-3 rounded-xl border border-border-strong outline-none text-sm"
        />
      </div>
    </div>

    <div class="space-y-1">
      <label for="benchmark-notes" class="text-[8px] font-black text-content-subtle uppercase tracking-widest ml-1">Notes</label>
      <textarea 
        id="benchmark-notes"
        bind:value={benchmark.notes} 
        class="w-full bg-surface-elevated text-content p-3 rounded-xl border border-border-strong outline-none text-sm h-20"
      ></textarea>
    </div>
  </div>

  <button 
    onclick={handleSubmit}
    class="w-full py-3.5 bg-primary hover:bg-primary-hover text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-lg active:scale-95"
  >
    Save Benchmark
  </button>
</div>
