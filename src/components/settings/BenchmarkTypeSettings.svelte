<script lang="ts">
  import { generateId, showAlert, showConfirm } from '../../lib/utils';
  import type { BenchmarkTypeDef } from '../../lib/types';
  import Icon from "@iconify/svelte";

  let { benchmarkTypes = $bindable() }: { benchmarkTypes: BenchmarkTypeDef[] } = $props();

  let editingBenchmarkType = $state<BenchmarkTypeDef | null>(null);
  let isAddingBenchmark = $state(false);

  function startAddBenchmark() {
    editingBenchmarkType = {
      id: generateId(),
      name: 'New Benchmark',
      unit: 'kg'
    };
    isAddingBenchmark = true;
  }

  function saveBenchmarkType() {
    if (!editingBenchmarkType) return;

    const name = editingBenchmarkType.name.trim();
    if (!name) {
      showAlert('Input Error', 'Benchmark name cannot be empty.');
      return;
    }

    const isDuplicate = benchmarkTypes.some(t =>
      t.id !== editingBenchmarkType?.id &&
      t.name.toLowerCase() === name.toLowerCase()
    );

    if (isDuplicate) {
      showAlert('Input Error', 'A benchmark with this name already exists.');
      return;
    }

    const index = benchmarkTypes.findIndex(t => t.id === editingBenchmarkType?.id);
    if (index !== -1) {
      benchmarkTypes[index] = { ...editingBenchmarkType, name };
    } else {
      benchmarkTypes.push({ ...editingBenchmarkType, name });
    }
    isAddingBenchmark = false;
    editingBenchmarkType = null;
  }

  async function deleteBenchmarkType(id: string) {
    const confirmed = await showConfirm('Delete Benchmark Type', 'Delete this benchmark type? Historical progress data will remain but the type will be unlinked.');
    if (!confirmed) return;
    benchmarkTypes = benchmarkTypes.filter(t => t.id !== id);
  }
</script>

<div class="bg-surface/50 border border-border rounded-card p-5 space-y-4 backdrop-blur-sm shadow-card">
  <div class="space-y-2">
    <h3 class="text-section uppercase text-content-muted px-1">Benchmark Types</h3>
    <p class="text-caption text-content-subtle px-1 leading-relaxed">Periodic performance tests (max hang, max pull-up, ...) tracked over time. These are separate from Exercise Modalities — you log a result under "Benchmark Tests" on the Training Plan screen, not as part of a workout.</p>
  </div>

  {#if isAddingBenchmark && editingBenchmarkType}
    <div class="p-5 bg-surface-elevated/50 border border-success/30 rounded-card space-y-4 animate-in zoom-in-95 shadow-inner">
      <div class="space-y-3">
        <div class="space-y-1"><label for="bench-name" class="text-label text-content-subtle ml-1">Test Name</label><input id="bench-name" bind:value={editingBenchmarkType.name} class="w-full bg-surface text-content p-3 rounded-control border border-border-strong focus:ring-1 focus:ring-success outline-none text-sm" placeholder="e.g., 20mm Max Hang" /></div>
        <div class="space-y-1"><label for="bench-unit" class="text-label text-content-subtle ml-1">Result Unit</label><input id="bench-unit" bind:value={editingBenchmarkType.unit} class="w-full bg-surface text-content p-3 rounded-control border border-border-strong focus:ring-1 focus:ring-success outline-none text-sm" placeholder="e.g., kg, reps, s" /></div>
      </div>
      <div class="flex gap-2 pt-2"><button onclick={saveBenchmarkType} class="flex-1 py-3 bg-success text-white text-sm font-bold rounded-control">Save</button><button onclick={() => { isAddingBenchmark = false; editingBenchmarkType = null; }} class="px-5 py-3 bg-surface-elevated text-content-muted text-sm font-bold rounded-control">Cancel</button></div>
    </div>
  {:else}
    <div class="space-y-2">
      {#each benchmarkTypes as type}
        <div class="flex items-center justify-between p-3.5 bg-surface-elevated/30 border border-border-strong/50 rounded-card group transition-all hover:bg-surface-elevated/50">
          <div><p class="text-body font-bold text-content">{type.name}</p><p class="text-caption text-content-subtle">Unit: {type.unit}</p></div>
          <div class="flex items-center gap-1">
            <button onclick={() => { editingBenchmarkType = { ...type }; isAddingBenchmark = true; }} class="p-2 text-content-subtle hover:text-content transition-colors" aria-label="Edit Benchmark"><Icon icon="ic:baseline-edit" /></button>
            <button onclick={() => deleteBenchmarkType(type.id)} class="p-2 text-content-subtle hover:text-danger transition-colors" aria-label="Delete Benchmark"><Icon icon="ic:baseline-delete" /></button>
          </div>
        </div>
      {/each}
      <button onclick={startAddBenchmark} class="w-full py-3.5 border-2 border-dashed border-border hover:border-border-strong rounded-card flex items-center justify-center gap-2 text-content-subtle hover:text-content-muted transition-all"><Icon icon="ic:baseline-plus" /><span class="text-label">Add Benchmark Type</span></button>
    </div>
  {/if}
</div>
