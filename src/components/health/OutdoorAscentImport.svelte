<script lang="ts">
  /**
   * 8a.nu outdoor-ascent CSV import (PLAN.md Phase 6) - parse -> preview
   * (what will be imported / skipped) -> confirm -> commit. Deliberately a
   * lightweight log, not a pyramid-builder - see
   * `src/lib/importers/outdoorAscentCsvImport.ts`.
   */
  import { trainingState } from '../../lib/state.svelte';
  import { parseOutdoorAscentCsv, type OutdoorAscentImportResult } from '../../lib/importers/outdoorAscentCsvImport';
  import { formatDate } from '../../lib/dateUtils';
  import { showAlert } from '../../lib/utils';
  import Icon from '@iconify/svelte';

  let fileInput = $state<HTMLInputElement>();
  let preview = $state<OutdoorAscentImportResult | null>(null);
  let isImporting = $state(false);

  function ascentKey(a: { date: string; name?: string; grade: string; style?: string }): string {
    return [a.date, a.name ?? '', a.grade, a.style ?? ''].join('|');
  }

  const newAscents = $derived.by(() => {
    if (!preview) return [];
    const existingKeys = new Set(trainingState.outdoorAscents.map(ascentKey));
    return preview.ascents.filter((a) => !existingKeys.has(ascentKey(a)));
  });
  const duplicateCount = $derived(preview ? preview.ascents.length - newAscents.length : 0);

  async function handleFileChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const text = await file.text();
    preview = parseOutdoorAscentCsv(text);
    if (preview.ascents.length === 0 && preview.skipped.length === 0) {
      await showAlert('Empty File', 'No rows found in this CSV file.');
      preview = null;
    }
  }

  async function handleConfirm() {
    if (newAscents.length === 0) return;
    isImporting = true;
    try {
      // $state.snapshot: newAscents is a $derived value - passing the
      // reactive proxy straight to storage fails IndexedDB's structured
      // clone (matches this codebase's existing convention, e.g.
      // Settings.svelte's saveAll()).
      await trainingState.addOutdoorAscents($state.snapshot(newAscents));
      preview = null;
      if (fileInput) fileInput.value = '';
    } finally {
      isImporting = false;
    }
  }

  function handleCancel() {
    preview = null;
    if (fileInput) fileInput.value = '';
  }

  async function handleDelete(id: string) {
    await trainingState.deleteOutdoorAscent(id);
  }

  const recentAscents = $derived(
    trainingState.outdoorAscents.slice().sort((a, b) => b.date.localeCompare(a.date)),
  );
</script>

<div class="bg-surface/50 border border-border rounded-3xl p-6 space-y-6 backdrop-blur-sm shadow-xl">
  <div class="flex items-center justify-between px-1">
    <div>
      <h3 class="text-xs font-bold text-content-muted uppercase tracking-widest">Outdoor Ascent Log</h3>
      <p class="text-[9px] text-content-subtle uppercase mt-0.5">Import from an 8a.nu CSV export</p>
    </div>
    <div class="p-2 bg-tertiary-hover/10 rounded-xl text-tertiary">
      <Icon icon="ic:baseline-terrain" class="text-lg" />
    </div>
  </div>

  {#if !preview}
    <div class="relative">
      <button
        onclick={() => fileInput?.click()}
        class="w-full flex items-center justify-between p-4 bg-surface-elevated/50 hover:bg-surface-elevated rounded-2xl border border-border-strong/50 transition-all group"
      >
        <div class="flex items-center gap-3">
          <div class="p-2.5 bg-primary-hover/10 rounded-xl text-primary group-hover:bg-primary-hover group-hover:text-white transition-colors">
            <Icon icon="ic:baseline-upload-file" class="text-xl" />
          </div>
          <div class="text-left">
            <p class="text-sm font-bold text-content">Import CSV</p>
            <p class="text-[9px] text-content-subtle uppercase">8a.nu ascent export</p>
          </div>
        </div>
        <Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-xl" />
      </button>
      <input bind:this={fileInput} type="file" accept=".csv,text/csv" class="hidden" onchange={handleFileChange} />
    </div>
  {:else}
    <div class="space-y-3 p-4 bg-surface-elevated/50 rounded-2xl border border-border-strong/50">
      <p class="text-xs font-bold text-content">
        {newAscents.length} ascent{newAscents.length === 1 ? '' : 's'} will be imported
      </p>
      {#if duplicateCount > 0}
        <p class="text-[10px] text-content-subtle">{duplicateCount} already logged (skipped as duplicates)</p>
      {/if}
      {#if preview.skipped.length > 0}
        <p class="text-[10px] text-warning">
          {preview.skipped.length} row{preview.skipped.length === 1 ? '' : 's'} could not be read:
        </p>
        <ul class="text-[9px] text-content-subtle space-y-0.5 max-h-24 overflow-y-auto custom-scrollbar">
          {#each preview.skipped as s}
            <li>Line {s.line}: {s.reason}</li>
          {/each}
        </ul>
      {/if}
      <div class="flex gap-2 pt-2">
        <button onclick={handleCancel} class="flex-1 py-2.5 bg-surface-elevated text-content-muted text-xs font-bold rounded-xl border border-border-strong">Cancel</button>
        <button
          onclick={handleConfirm}
          disabled={newAscents.length === 0 || isImporting}
          class="flex-1 py-2.5 bg-primary hover:bg-primary-hover text-white text-xs font-bold rounded-xl shadow-lg disabled:opacity-50 disabled:pointer-events-none"
        >
          {isImporting ? 'Importing...' : 'Confirm Import'}
        </button>
      </div>
    </div>
  {/if}

  {#if recentAscents.length > 0}
    <div class="space-y-1.5 max-h-64 overflow-y-auto custom-scrollbar">
      {#each recentAscents as a}
        <div class="flex items-center justify-between p-2.5 bg-surface-elevated/50 rounded-xl border border-border-strong/50">
          <div class="min-w-0">
            <p class="text-xs font-bold text-content truncate">{a.name || 'Unnamed'} <span class="text-content-muted font-mono">{a.grade}</span></p>
            <p class="text-[9px] text-content-subtle uppercase truncate">{formatDate(a.date)}{a.crag ? ` · ${a.crag}` : ''}{a.style ? ` · ${a.style}` : ''}</p>
          </div>
          <button onclick={() => handleDelete(a.id)} class="text-content-subtle hover:text-danger transition-colors shrink-0 ml-2" aria-label="Delete ascent">
            <Icon icon="ic:baseline-close" class="text-sm" />
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>
