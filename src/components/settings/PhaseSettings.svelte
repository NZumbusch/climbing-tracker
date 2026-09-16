<script lang="ts">
  import { generateId, showAlert, showConfirm } from '../../lib/utils';
  import type { PhaseDef } from '../../lib/types';
  import Icon from "@iconify/svelte";

  let { phaseDefs = $bindable() }: { phaseDefs: PhaseDef[] } = $props();

  const predefinedColors = ['bg-success-hover', 'bg-tertiary-hover', 'bg-indigo-500', 'bg-rose-500', 'bg-amber-500', 'bg-sky-500', 'bg-zinc-500', 'bg-warning', 'bg-cyan-500', 'bg-fuchsia-500', 'bg-lime-500', 'bg-teal-500', 'bg-pink-500'];

  let editingPhase = $state<PhaseDef | null>(null);
  let isAddingPhase = $state(false);

  const sortedPhaseDefs = $derived([...phaseDefs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));

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
    const confirmed = await showConfirm('Delete Phase', 'Delete this phase? Historical periodization/templates referencing it may be affected.');
    if (!confirmed) return;
    phaseDefs = phaseDefs.filter(p => p.id !== id);
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
</script>

<div class="bg-surface/50 border border-border rounded-3xl p-6 space-y-6 backdrop-blur-sm shadow-xl">
  <div class="space-y-2">
    <h3 class="text-xs font-bold text-content-muted uppercase tracking-widest px-1">Training Phases</h3>
    <p class="text-[10px] text-content-subtle px-1 leading-relaxed">Configure the macrocycle phases used for periodization and templates.</p>
  </div>

  {#if isAddingPhase && editingPhase}
    <div class="p-5 bg-surface-elevated/50 border border-primary/30 rounded-2xl space-y-4 animate-in zoom-in-95 shadow-inner">
      <div class="space-y-3">
        <div class="space-y-1"><label for="phase-name" class="text-[8px] font-black text-content-subtle uppercase tracking-widest ml-1">Phase Name</label><input id="phase-name" bind:value={editingPhase.name} class="w-full bg-surface text-content p-3 rounded-xl border border-border-strong focus:ring-1 focus:ring-blue-500 outline-none text-sm" placeholder="e.g., Hypertrophy" /></div>
        <div class="space-y-1"><p class="text-[8px] font-black text-content-subtle uppercase tracking-widest ml-1">Color</p>
          <div class="flex flex-wrap gap-2">
            {#each predefinedColors as color}
              <button type="button" aria-label="Select color {color}" onclick={() => editingPhase!.color = color} class="w-6 h-6 rounded-full {color} {editingPhase!.color === color ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-900' : 'opacity-70 hover:opacity-100'} transition-all"></button>
            {/each}
          </div>
        </div>
      </div>
      <div class="flex gap-2 pt-2"><button onclick={savePhase} class="flex-1 py-3 bg-primary text-white text-[10px] font-black uppercase tracking-widest rounded-xl">Save</button><button onclick={() => { isAddingPhase = false; editingPhase = null; }} class="px-5 py-3 bg-surface-elevated text-content-muted text-[10px] font-black uppercase tracking-widest rounded-xl">Cancel</button></div>
    </div>
  {:else}
    <div class="space-y-2">
      {#each sortedPhaseDefs as phase, index}
        <div class="flex items-center justify-between p-3.5 bg-surface-elevated/30 border border-border-strong/50 rounded-2xl group transition-all hover:bg-surface-elevated/50">
          <div class="flex items-center gap-3"><div class="w-3 h-3 rounded-full {phase.color || 'bg-zinc-500'}"></div><div><p class="text-sm font-bold text-content">{phase.name}</p></div></div>
          <div class="flex items-center gap-0.5">
            <button onclick={() => movePhase(phase.id, 'up')} disabled={index === 0} class="p-1.5 text-content-subtle hover:text-content disabled:opacity-30 disabled:hover:text-content-subtle transition-colors" aria-label="Move Up"><Icon icon="ic:baseline-keyboard-arrow-up" class="text-lg" /></button>
            <button onclick={() => movePhase(phase.id, 'down')} disabled={index === sortedPhaseDefs.length - 1} class="p-1.5 text-content-subtle hover:text-content disabled:opacity-30 disabled:hover:text-content-subtle transition-colors" aria-label="Move Down"><Icon icon="ic:baseline-keyboard-arrow-down" class="text-lg" /></button>
            <button onclick={() => { editingPhase = { ...phase }; isAddingPhase = true; }} class="p-1.5 text-content-subtle hover:text-content transition-colors" aria-label="Edit Phase"><Icon icon="ic:baseline-edit" class="text-sm" /></button>
            <button onclick={() => deletePhase(phase.id)} class="p-1.5 text-content-subtle hover:text-danger transition-colors" aria-label="Delete Phase"><Icon icon="ic:baseline-delete" class="text-sm" /></button>
          </div>
        </div>
      {/each}
      <button onclick={startAddPhase} class="w-full py-3.5 border-2 border-dashed border-border hover:border-border-strong rounded-2xl flex items-center justify-center gap-2 text-content-subtle hover:text-content-muted transition-all"><Icon icon="ic:baseline-plus" /><span class="text-[10px] font-black uppercase tracking-widest">Add Phase</span></button>
    </div>
  {/if}
</div>
