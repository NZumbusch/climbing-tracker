<script lang="ts">
  import { PARAMETER_LABELS } from '../../lib/constants';
  import { generateId, showAlert, showConfirm } from '../../lib/utils';
  import type { ExerciseTypeDef, ParameterBlock, AnalyticsCategory } from '../../lib/types';
  import Icon from "@iconify/svelte";

  let {
    exerciseTypes = $bindable(),
    analyticsCategories,
  }: {
    exerciseTypes: ExerciseTypeDef[];
    analyticsCategories: AnalyticsCategory[];
  } = $props();

  let editingType = $state<ExerciseTypeDef | null>(null);
  let isAddingType = $state(false);

  const parameterBlocks = Object.entries(PARAMETER_LABELS).map(([id, label]) => ({ id: id as ParameterBlock, label }));

  function startAddType() {
    editingType = {
      id: generateId(),
      name: 'New Modality',
      category: 'Other',
      parameters: ['duration']
    };
    isAddingType = true;
  }

  function saveType() {
    if (!editingType) return;

    const name = editingType.name.trim();
    if (!name) {
      showAlert('Input Error', 'Modality name cannot be empty.');
      return;
    }

    const isDuplicate = exerciseTypes.some(t =>
      t.id !== editingType?.id &&
      t.name.toLowerCase() === name.toLowerCase()
    );

    if (isDuplicate) {
      showAlert('Input Error', 'A modality with this name already exists.');
      return;
    }

    const index = exerciseTypes.findIndex(t => t.id === editingType?.id);
    if (index !== -1) {
      exerciseTypes[index] = { ...editingType, name };
    } else {
      exerciseTypes.push({ ...editingType, name });
    }
    isAddingType = false;
    editingType = null;
  }

  async function deleteType(id: string) {
    const confirmed = await showConfirm('Delete Modality', 'Delete this modality? Historical analytics may be affected.');
    if (!confirmed) return;
    exerciseTypes = exerciseTypes.filter(t => t.id !== id);
  }

  function cycleParam(param: ParameterBlock) {
    if (!editingType) return;

    if (!editingType.possibleParameters) {
      editingType.possibleParameters = [...editingType.parameters];
    }

    const isDefault = editingType.parameters.includes(param);
    const isPossible = editingType.possibleParameters.includes(param);

    if (isDefault) {
      // State 2 (Default) -> State 0 (Unselected)
      editingType.parameters = editingType.parameters.filter(p => p !== param);
      editingType.possibleParameters = editingType.possibleParameters.filter(p => p !== param);
    } else if (isPossible) {
      // State 1 (Possible) -> State 2 (Default)
      editingType.parameters = [...editingType.parameters, param];
    } else {
      // State 0 (Unselected) -> State 1 (Possible)
      editingType.possibleParameters = [...editingType.possibleParameters, param];
    }
  }
</script>

{#if isAddingType && editingType}
  <div class="p-5 bg-surface-elevated/50 border border-primary/30 rounded-card space-y-4 animate-in zoom-in-95 shadow-inner">
    <div class="space-y-3">
      <div class="grid grid-cols-2 gap-4">
        <div class="space-y-1"><label for="edit-name" class="text-label text-content-subtle ml-1">Modality Name</label><input id="edit-name" bind:value={editingType.name} class="w-full bg-surface text-content p-3 rounded-control border border-border-strong focus:ring-1 focus:ring-primary outline-none text-sm" placeholder="e.g., Hangboard" /></div>
        <div class="space-y-1"><label for="edit-load" class="text-label text-content-subtle ml-1">Default Load (1-10)</label><input id="edit-load" type="number" min="1" max="10" bind:value={editingType.defaultPlannedLoad} class="w-full bg-surface text-content p-3 rounded-control border border-border-strong focus:ring-1 focus:ring-primary outline-none text-sm" /></div>
      </div>

      <div class="space-y-1">
        <label for="edit-cat" class="text-label text-content-subtle ml-1">Analytics Category</label>
        <select id="edit-cat" bind:value={editingType.category} class="w-full bg-surface text-content p-3 rounded-control border border-border-strong outline-none text-sm appearance-none">{#each analyticsCategories as cat} <option value={cat.name}>{cat.name}</option> {/each}</select>
        <p class="text-caption text-content-subtle ml-1 leading-relaxed">Only affects chart grouping in Analytics — doesn't change what this modality tracks. A single logged exercise can override this later.</p>
      </div>
      <div class="space-y-2"><span class="text-label text-content-subtle ml-1 block">Active Parameters</span><div class="grid grid-cols-2 gap-2">{#each parameterBlocks as block}<button onclick={() => cycleParam(block.id)} class="px-3 py-2 rounded-control text-label border transition-all flex items-center justify-between gap-2 {editingType.parameters.includes(block.id) ? 'bg-primary-hover/10 border-primary/50 text-primary-hover' : (editingType.possibleParameters?.includes(block.id) ? 'bg-surface-elevated border-border-strong text-content' : 'bg-surface border-border/50 text-content-subtle opacity-50')}"><div class="flex items-center gap-2"><Icon icon={editingType.parameters.includes(block.id) ? 'ic:baseline-check-box' : (editingType.possibleParameters?.includes(block.id) ? 'ic:baseline-indeterminate-check-box' : 'ic:baseline-check-box-outline-blank')} class="text-sm" /><span>{block.label}</span></div><span class="text-caption opacity-60">{editingType.parameters.includes(block.id) ? 'Default' : (editingType.possibleParameters?.includes(block.id) ? 'Possible' : '')}</span></button>{/each}</div></div>
    </div>
    <div class="flex gap-2 pt-2"><button onclick={saveType} class="flex-1 py-3 bg-primary text-white text-sm font-bold rounded-control">Save</button><button onclick={() => { isAddingType = false; editingType = null; }} class="px-5 py-3 bg-surface-elevated text-content-muted text-sm font-bold rounded-control">Cancel</button></div>
  </div>
{:else}
  <div class="space-y-2">
    {#each exerciseTypes as type}
      <div class="flex items-center justify-between p-3.5 bg-surface-elevated/30 border border-border-strong/50 rounded-card group transition-all hover:bg-surface-elevated/50">
        <div><p class="text-body font-bold text-content">{type.name}</p><p class="text-caption text-content-subtle">{type.category}</p></div>
        <div class="flex items-center gap-1">
          <button onclick={() => { editingType = { ...type }; isAddingType = true; }} class="p-2 text-content-subtle hover:text-content transition-colors" aria-label="Edit Modality"><Icon icon="ic:baseline-edit" /></button>
          <button onclick={() => deleteType(type.id)} class="p-2 text-content-subtle hover:text-danger transition-colors" aria-label="Delete Modality"><Icon icon="ic:baseline-delete" /></button>
        </div>
      </div>
    {/each}
    <button onclick={startAddType} class="w-full py-3.5 border-2 border-dashed border-border hover:border-border-strong rounded-card flex items-center justify-center gap-2 text-content-subtle hover:text-content-muted transition-all"><Icon icon="ic:baseline-plus" /><span class="text-label">Add New Modality</span></button>
  </div>
{/if}
