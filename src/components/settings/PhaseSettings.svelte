<script lang="ts">
  import { generateId, showAlert, showConfirm } from '../../lib/utils';
  import { DEFAULT_TEMPLATE_LIBRARY } from '../../lib/constants';
  import type { PhaseDef, WorkoutTemplate } from '../../lib/types';
  import PhaseTemplateEditor from './PhaseTemplateEditor.svelte';
  import Icon from "@iconify/svelte";

  let {
    phaseDefs = $bindable(),
    templates = $bindable(),
    onResetAllTemplates,
  }: {
    phaseDefs: PhaseDef[];
    templates: Record<string, WorkoutTemplate[]>;
    onResetAllTemplates: () => void | Promise<void>;
  } = $props();

  const predefinedColors = ['bg-success-hover', 'bg-tertiary-hover', 'bg-indigo-500', 'bg-rose-500', 'bg-amber-500', 'bg-sky-500', 'bg-zinc-500', 'bg-warning', 'bg-cyan-500', 'bg-fuchsia-500', 'bg-lime-500', 'bg-teal-500', 'bg-pink-500'];

  let editingPhase = $state<PhaseDef | null>(null);
  let isAddingPhase = $state(false);
  let expandedPhaseId = $state<string | null>(null);
  let showStarterLibrary = $state(false);

  const sortedPhaseDefs = $derived([...phaseDefs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));

  function togglePhaseExpanded(id: string) {
    expandedPhaseId = expandedPhaseId === id ? null : id;
  }

  function startAddPhase() {
    const maxOrder = phaseDefs.reduce((acc, p) => Math.max(acc, p.order ?? 0), 0);
    editingPhase = {
      id: generateId(),
      name: 'New Phase',
      color: predefinedColors[0],
      order: maxOrder + 1,
    };
    isAddingPhase = true;
  }

  function savePhase() {
    if (!editingPhase) return;

    const name = editingPhase.name.trim();
    if (!name) {
      showAlert('Input Error', 'Phase name cannot be empty.');
      return;
    }

    const isDuplicate = phaseDefs.some(p =>
      p.id !== editingPhase?.id &&
      p.name.toLowerCase() === name.toLowerCase()
    );

    if (isDuplicate) {
      showAlert('Input Error', 'A phase with this name already exists.');
      return;
    }

    const index = phaseDefs.findIndex(p => p.id === editingPhase?.id);
    if (index !== -1) {
      phaseDefs[index] = { ...editingPhase, name };
    } else {
      phaseDefs.push({ ...editingPhase, name });
    }
    isAddingPhase = false;
    editingPhase = null;
  }

  async function deletePhase(id: string) {
    const confirmed = await showConfirm('Delete Phase', 'Delete this phase? Historical training blocks/templates referencing it may be affected.');
    if (!confirmed) return;
    phaseDefs = phaseDefs.filter(p => p.id !== id);
    if (expandedPhaseId === id) expandedPhaseId = null;
  }

  function movePhase(id: string, direction: 'up' | 'down') {
    const sorted = sortedPhaseDefs;
    const index = sorted.findIndex(p => p.id === id);
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (index === -1 || swapIndex < 0 || swapIndex >= sorted.length) return;

    const a = phaseDefs.find(p => p.id === sorted[index].id)!;
    const b = phaseDefs.find(p => p.id === sorted[swapIndex].id)!;
    const tempOrder = a.order;
    a.order = b.order;
    b.order = tempOrder;
  }

  async function loadStarterSet(setId: string) {
    const set = DEFAULT_TEMPLATE_LIBRARY.find(s => s.id === setId);
    if (!set) return;
    const confirmed = await showConfirm(
      'Load Starter Set',
      `Load "${set.name}"? This will overwrite your current templates for any phase included in this set.`
    );
    if (!confirmed) return;
    templates = { ...templates, ...JSON.parse(JSON.stringify(set.templates)) };
    showStarterLibrary = false;
    showAlert('Starter Set Loaded', `"${set.name}" has been loaded. Review and Save All to keep it.`);
  }
</script>

<div class="bg-surface/50 border border-border rounded-card p-5 space-y-4 backdrop-blur-sm shadow-card">
  <div class="space-y-2">
    <h3 class="text-section uppercase text-content-muted px-1">Training Phases</h3>
    <p class="text-caption text-content-subtle px-1 leading-relaxed">The macrocycle blocks (e.g. "Strength", "Deload") you assign to weeks on the Training Plan calendar. Tap a phase below to edit the default workouts it generates when assigned to a week.</p>
  </div>

  {#if isAddingPhase && editingPhase}
    <div class="p-5 bg-surface-elevated/50 border border-primary/30 rounded-card space-y-4 animate-in zoom-in-95 shadow-inner">
      <div class="space-y-3">
        <div class="space-y-1"><label for="phase-name" class="text-label text-content-subtle ml-1">Phase Name</label><input id="phase-name" bind:value={editingPhase.name} class="w-full bg-surface text-content p-3 rounded-control border border-border-strong focus:ring-1 focus:ring-primary outline-none text-sm" placeholder="e.g., Hypertrophy" /></div>
        <div class="space-y-1"><p class="text-label text-content-subtle ml-1">Color</p>
          <div class="flex flex-wrap gap-2">
            {#each predefinedColors as color}
              <button type="button" aria-label="Select color {color}" onclick={() => editingPhase!.color = color} class="w-6 h-6 rounded-full {color} {editingPhase!.color === color ? 'ring-2 ring-white ring-offset-2 ring-offset-surface' : 'opacity-70 hover:opacity-100'} transition-all"></button>
            {/each}
          </div>
        </div>
      </div>
      <div class="flex gap-2 pt-2"><button onclick={savePhase} class="flex-1 py-3 bg-primary text-white text-sm font-bold rounded-control">Save</button><button onclick={() => { isAddingPhase = false; editingPhase = null; }} class="px-5 py-3 bg-surface-elevated text-content-muted text-sm font-bold rounded-control">Cancel</button></div>
    </div>
  {:else}
    <div class="space-y-2">
      {#each sortedPhaseDefs as phase, index}
        <div class="bg-surface-elevated/30 border border-border-strong/50 rounded-card transition-all overflow-hidden">
          <div class="flex items-center justify-between p-3.5 group hover:bg-surface-elevated/50">
            <button
              onclick={() => togglePhaseExpanded(phase.id)}
              class="flex items-center gap-3 flex-1 min-w-0 text-left"
              aria-expanded={expandedPhaseId === phase.id}
            >
              <div class="w-3 h-3 rounded-full flex-shrink-0 {phase.color || 'bg-status-neutral'}"></div>
              <p class="text-body font-bold text-content truncate">{phase.name}</p>
              <span class="text-caption text-content-subtle flex-shrink-0">{(templates[phase.id] || []).length} session{(templates[phase.id] || []).length === 1 ? '' : 's'}</span>
              <Icon icon="ic:baseline-expand-more" class="text-content-subtle text-lg flex-shrink-0 transition-transform {expandedPhaseId === phase.id ? 'rotate-180' : ''}" />
            </button>
            <div class="flex items-center gap-0.5 flex-shrink-0">
              <button onclick={() => movePhase(phase.id, 'up')} disabled={index === 0} class="p-1.5 text-content-subtle hover:text-content disabled:opacity-30 disabled:hover:text-content-subtle transition-colors" aria-label="Move Up"><Icon icon="ic:baseline-keyboard-arrow-up" class="text-lg" /></button>
              <button onclick={() => movePhase(phase.id, 'down')} disabled={index === sortedPhaseDefs.length - 1} class="p-1.5 text-content-subtle hover:text-content disabled:opacity-30 disabled:hover:text-content-subtle transition-colors" aria-label="Move Down"><Icon icon="ic:baseline-keyboard-arrow-down" class="text-lg" /></button>
              <button onclick={() => { editingPhase = { ...phase }; isAddingPhase = true; }} class="p-1.5 text-content-subtle hover:text-content transition-colors" aria-label="Edit Phase"><Icon icon="ic:baseline-edit" class="text-sm" /></button>
              <button onclick={() => deletePhase(phase.id)} class="p-1.5 text-content-subtle hover:text-danger transition-colors" aria-label="Delete Phase"><Icon icon="ic:baseline-delete" class="text-sm" /></button>
            </div>
          </div>
          {#if expandedPhaseId === phase.id}
            <div class="px-3.5 pb-3.5 border-t border-border-strong/50 animate-in fade-in">
              <PhaseTemplateEditor bind:templates phaseId={phase.id} />
            </div>
          {/if}
        </div>
      {/each}
      <button onclick={startAddPhase} class="w-full py-3.5 border-2 border-dashed border-border hover:border-border-strong rounded-card flex items-center justify-center gap-2 text-content-subtle hover:text-content-muted transition-all"><Icon icon="ic:baseline-plus" /><span class="text-label">Add Phase</span></button>
    </div>
  {/if}

  <div class="pt-2 border-t border-border space-y-3">
    <button onclick={() => showStarterLibrary = !showStarterLibrary} class="w-full flex items-center justify-between p-3.5 bg-surface-elevated/30 hover:bg-surface-elevated/50 border border-border-strong/50 rounded-card transition-all">
      <div class="flex items-center gap-3">
        <Icon icon="ic:baseline-library-books" class="text-lg text-content-subtle" />
        <div class="text-left">
          <p class="text-body font-bold text-content">Starter Template Library</p>
          <p class="text-caption text-content-subtle">Load a pre-built set of sessions into one or more phases above</p>
        </div>
      </div>
      <Icon icon="ic:baseline-expand-more" class="text-content-subtle text-lg transition-transform {showStarterLibrary ? 'rotate-180' : ''}" />
    </button>

    {#if showStarterLibrary}
      <div class="space-y-2 animate-in fade-in">
        {#each DEFAULT_TEMPLATE_LIBRARY as set}
          <div class="flex items-center justify-between p-3 bg-surface-elevated/30 border border-border-strong/50 rounded-card">
            <div class="min-w-0 flex-1 pr-3">
              <p class="text-body font-bold text-content truncate">{set.name}</p>
              {#if set.description}<p class="text-caption text-content-subtle mt-0.5 leading-relaxed">{set.description}</p>{/if}
            </div>
            <button onclick={() => loadStarterSet(set.id)} class="px-3 py-1.5 bg-surface-elevated hover:bg-surface-elevated-hover text-content text-label rounded-control transition-colors flex-shrink-0">Load</button>
          </div>
        {:else}
          <p class="text-caption text-content-subtle italic px-1">No starter sets available.</p>
        {/each}
      </div>
    {/if}

    <button onclick={onResetAllTemplates} class="w-full py-2 text-label text-content-subtle hover:text-danger transition-colors">Reset ALL Phases to App Defaults</button>
  </div>
</div>
