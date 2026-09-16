<script lang="ts">
  import { trainingState } from '../../lib/state.svelte';
  import { showConfirm } from '../../lib/utils';
  import { exportWorkoutsToICS } from '../../lib/ics';
  import PDFExportModal from './PDFExportModal.svelte';
  import Icon from "@iconify/svelte";

  let {
    onExport,
    onImport,
  }: {
    onExport: () => void;
    onImport: (e: Event) => void;
  } = $props();

  let showPDFExport = $state(false);
  let fileInput = $state<HTMLInputElement>();

  async function handleImportClick() {
    const confirmed = await showConfirm(
      'Import Data',
      'Are you sure you want to import this data? This will overwrite your existing data and cannot be undone.'
    );
    if (confirmed) {
      fileInput?.click();
    }
  }
</script>

<div class="space-y-6">
  <div class="bg-surface/50 border border-border rounded-3xl p-6 space-y-6 backdrop-blur-sm shadow-xl animate-in fade-in">
    <div class="space-y-2">
      <h3 class="text-xs font-bold text-content-muted uppercase tracking-widest px-1">Calendar Integration</h3>
      <p class="text-[10px] text-content-subtle px-1 leading-relaxed">Export training history as an ICS file for integration with standard calendar applications.</p>
    </div>
    <button
      onclick={() => exportWorkoutsToICS(trainingState.workouts)}
      class="w-full flex items-center justify-between p-4 bg-surface-elevated/50 hover:bg-surface-elevated rounded-2xl border border-border-strong/50 transition-all group"
    >
      <div class="flex items-center gap-3">
        <div class="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-500 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
          <Icon icon="ic:baseline-calendar-today" class="text-xl" />
        </div>
        <div class="text-left">
          <p class="text-sm font-bold text-content">Export Calendar (.ics)</p>
          <p class="text-[9px] text-content-subtle uppercase">Download all sessions</p>
        </div>
      </div>
      <Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-xl" />
    </button>
  </div>

  <div class="bg-surface/50 border border-border rounded-3xl p-6 space-y-6 backdrop-blur-sm shadow-xl animate-in fade-in">
    <div class="space-y-2"><h3 class="text-xs font-bold text-content-muted uppercase tracking-widest px-1">Printable Training Plan</h3><p class="text-[10px] text-content-subtle px-1 leading-relaxed">Generate a PDF of your workouts for any week range.</p></div>
    <button
      onclick={() => showPDFExport = true}
      class="w-full flex items-center justify-between p-4 bg-surface-elevated/50 hover:bg-surface-elevated rounded-2xl border border-border-strong/50 transition-all group"
    >
      <div class="flex items-center gap-3">
        <div class="p-2.5 bg-rose-500/10 rounded-xl text-rose-500 group-hover:bg-rose-500 group-hover:text-white transition-colors">
          <Icon icon="ic:baseline-picture-as-pdf" class="text-xl" />
        </div>
        <div class="text-left">
          <p class="text-sm font-bold text-content">Export PDF</p>
          <p class="text-[9px] text-content-subtle uppercase">Select week range</p>
        </div>
      </div>
      <Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-xl" />
    </button>
  </div>

  <div class="bg-surface/50 border border-border rounded-3xl p-6 space-y-6 backdrop-blur-sm shadow-xl animate-in fade-in">
    <div class="space-y-2"><h3 class="text-xs font-bold text-content-muted uppercase tracking-widest px-1">JSON Backups</h3><p class="text-[10px] text-content-subtle px-1">Ensure your data is safe by exporting a local JSON backup.</p></div>
    <div class="grid grid-cols-1 gap-3">
      <button onclick={onExport} class="flex items-center justify-between p-4 bg-surface-elevated/50 hover:bg-surface-elevated rounded-2xl border border-border-strong/50 transition-all group"><div class="flex items-center gap-3"><div class="p-2.5 bg-primary-hover/10 rounded-xl text-primary group-hover:bg-primary-hover group-hover:text-white transition-colors"><Icon icon="ic:baseline-download" class="text-xl" /></div><div class="text-left"><p class="text-sm font-bold text-content">Export</p><p class="text-[9px] text-content-subtle uppercase">Save to local JSON</p></div></div><Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-xl" /></button>
      <div class="relative">
        <button onclick={handleImportClick} class="w-full flex items-center justify-between p-4 bg-surface-elevated/50 hover:bg-surface-elevated rounded-2xl border border-border-strong/50 transition-all group cursor-pointer"><div class="flex items-center gap-3"><div class="p-2.5 bg-success-hover/10 rounded-xl text-success group-hover:bg-success-hover group-hover:text-white transition-colors"><Icon icon="ic:baseline-upload" class="text-xl" /></div><div class="text-left"><p class="text-sm font-bold text-content">Import</p><p class="text-[9px] text-content-subtle uppercase">Restore from backup</p></div></div><Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-xl" /></button>
        <input bind:this={fileInput} type="file" accept=".json" class="hidden" onchange={onImport} />
      </div>
    </div>
  </div>
</div>

{#if showPDFExport}
  <PDFExportModal onClose={() => showPDFExport = false} />
{/if}
