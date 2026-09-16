<script lang="ts">
  import { trainingState } from '../../lib/state.svelte';
  import { generateId, showAlert, showConfirm } from '../../lib/utils';
  import type { AnalyticsCategory, ExerciseSlot, WorkoutTemplate } from '../../lib/types';
  import Icon from "@iconify/svelte";

  let {
    analyticsCategories = $bindable(),
    templates,
  }: {
    analyticsCategories: AnalyticsCategory[];
    templates: Record<string, WorkoutTemplate[]>;
  } = $props();

  const predefinedColors = ['bg-success-hover', 'bg-tertiary-hover', 'bg-indigo-500', 'bg-rose-500', 'bg-amber-500', 'bg-sky-500', 'bg-zinc-500', 'bg-warning', 'bg-cyan-500', 'bg-fuchsia-500', 'bg-lime-500', 'bg-teal-500', 'bg-pink-500'];

  let editingAnalyticsCategory = $state<AnalyticsCategory | null>(null);
  let isAddingAnalyticsCategory = $state(false);

  /** Resolves a slot's effective category name: its override if set, else its type's default. */
  function resolveSlotCategory(e: ExerciseSlot): string | undefined {
    return e.categoryId
      ? analyticsCategories.find(c => c.id === e.categoryId)?.name
      : trainingState.exerciseTypes.find(t => t.id === e.typeId)?.category;
  }

  const missingCategories = $derived.by(() => {
    const existingCats = new Set(analyticsCategories.map((c) => c.name));
    const missing = new Set<string>();

    trainingState.exerciseTypes.forEach(t => {
      if (t.category && !existingCats.has(t.category)) missing.add(t.category);
    });

    trainingState.workouts.forEach(w => {
      w.exercises?.forEach(e => {
        const cat = resolveSlotCategory(e);
        if (cat && !existingCats.has(cat)) missing.add(cat);
      });
    });

    if (templates) {
      Object.values(templates).forEach(phaseTemplates => {
        phaseTemplates?.forEach(t => {
          t.exercises?.forEach(e => {
            const cat = resolveSlotCategory(e);
            if (cat && !existingCats.has(cat)) missing.add(cat);
          });
        });
      });
    }

    return Array.from(missing);
  });

  function startAddAnalyticsCategory() {
    editingAnalyticsCategory = {
      id: generateId(),
      name: 'New Category',
      color: predefinedColors[0]
    };
    isAddingAnalyticsCategory = true;
  }

  function saveAnalyticsCategory() {
    if (!editingAnalyticsCategory) return;

    const name = editingAnalyticsCategory.name.trim();
    if (!name) {
      showAlert('Input Error', 'Category name cannot be empty.');
      return;
    }

    const isDuplicate = analyticsCategories.some(c =>
      c.id !== editingAnalyticsCategory?.id &&
      c.name.toLowerCase() === name.toLowerCase()
    );

    if (isDuplicate) {
      showAlert('Input Error', 'A category with this name already exists.');
      return;
    }

    const index = analyticsCategories.findIndex(c => c.id === editingAnalyticsCategory?.id);
    if (index !== -1) {
      analyticsCategories[index] = { ...editingAnalyticsCategory, name };
    } else {
      analyticsCategories.push({ ...editingAnalyticsCategory, name });
    }
    isAddingAnalyticsCategory = false;
    editingAnalyticsCategory = null;
  }

  async function deleteAnalyticsCategory(id: string) {
    const catToDelete = analyticsCategories.find(c => c.id === id);
    if (!catToDelete) return;

    let inUseCount = 0;
    let inUseModalities = 0;

    trainingState.workouts.forEach(w => {
      w.exercises?.forEach(e => {
        if (resolveSlotCategory(e) === catToDelete.name) inUseCount++;
      });
    });

    if (templates) {
      Object.values(templates).forEach(phaseTemplates => {
        phaseTemplates?.forEach(t => {
          t.exercises?.forEach(e => {
            if (resolveSlotCategory(e) === catToDelete.name) inUseCount++;
          });
        });
      });
    }

    trainingState.exerciseTypes.forEach(t => {
      if (t.category === catToDelete.name) inUseModalities++;
    });

    const msg = inUseCount > 0 || inUseModalities > 0
      ? `Delete "${catToDelete.name}"? This will leave ${inUseCount} exercises and ${inUseModalities} modalities using a missing category (you can restore it later).`
      : 'Delete this category?';

    const confirmed = await showConfirm('Delete Category', msg);
    if (!confirmed) return;
    analyticsCategories = analyticsCategories.filter(c => c.id !== id);
  }

  function moveAnalyticsCategoryUp(index: number) {
    if (index === 0) return;
    const temp = analyticsCategories[index - 1];
    analyticsCategories[index - 1] = analyticsCategories[index];
    analyticsCategories[index] = temp;
  }

  function moveAnalyticsCategoryDown(index: number) {
    if (index === analyticsCategories.length - 1) return;
    const temp = analyticsCategories[index + 1];
    analyticsCategories[index + 1] = analyticsCategories[index];
    analyticsCategories[index] = temp;
  }
</script>

{#if isAddingAnalyticsCategory && editingAnalyticsCategory}
    <div class="p-5 bg-surface-elevated/50 border border-tertiary/30 rounded-2xl space-y-4 animate-in zoom-in-95 shadow-inner">
      <div class="space-y-3">
        <div class="space-y-1"><label for="ac-name" class="text-[8px] font-black text-content-subtle uppercase tracking-widest ml-1">Category Name</label><input id="ac-name" bind:value={editingAnalyticsCategory.name} class="w-full bg-surface text-content p-3 rounded-xl border border-border-strong focus:ring-1 focus:ring-purple-500 outline-none text-sm" placeholder="e.g., Flexibility" /></div>
        <div class="space-y-1"><p class="text-[8px] font-black text-content-subtle uppercase tracking-widest ml-1">Color</p>
          <div class="flex flex-wrap gap-2">
            {#each predefinedColors as color}
              <button type="button" aria-label="Select color {color}" onclick={() => editingAnalyticsCategory!.color = color} class="w-6 h-6 rounded-full {color} {editingAnalyticsCategory!.color === color ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-900' : 'opacity-70 hover:opacity-100'} transition-all"></button>
            {/each}
          </div>
        </div>
      </div>
      <div class="flex gap-2 pt-2"><button onclick={saveAnalyticsCategory} class="flex-1 py-3 bg-tertiary text-white text-[10px] font-black uppercase tracking-widest rounded-xl">Save</button><button onclick={() => { isAddingAnalyticsCategory = false; editingAnalyticsCategory = null; }} class="px-5 py-3 bg-surface-elevated text-content-muted text-[10px] font-black uppercase tracking-widest rounded-xl">Cancel</button></div>
    </div>
  {:else}
    <div class="space-y-2">
      {#each analyticsCategories as cat, index}
        <div class="flex items-center justify-between p-3.5 bg-surface-elevated/30 border border-border-strong/50 rounded-2xl group transition-all hover:bg-surface-elevated/50">
          <div class="flex items-center gap-3"><div class="w-3 h-3 rounded-full {cat.color}"></div><div><p class="text-sm font-bold text-content">{cat.name}</p></div></div>
          <div class="flex items-center gap-0.5">
            <button onclick={() => moveAnalyticsCategoryUp(index)} disabled={index === 0} class="p-1.5 text-content-subtle hover:text-content disabled:opacity-30 disabled:hover:text-content-subtle transition-colors" aria-label="Move Up"><Icon icon="ic:baseline-keyboard-arrow-up" class="text-lg" /></button>
            <button onclick={() => moveAnalyticsCategoryDown(index)} disabled={index === analyticsCategories.length - 1} class="p-1.5 text-content-subtle hover:text-content disabled:opacity-30 disabled:hover:text-content-subtle transition-colors" aria-label="Move Down"><Icon icon="ic:baseline-keyboard-arrow-down" class="text-lg" /></button>
            <button onclick={() => { editingAnalyticsCategory = { ...cat }; isAddingAnalyticsCategory = true; }} class="p-1.5 text-content-subtle hover:text-content transition-colors" aria-label="Edit Category"><Icon icon="ic:baseline-edit" class="text-sm" /></button>
            <button onclick={() => deleteAnalyticsCategory(cat.id)} class="p-1.5 text-content-subtle hover:text-danger transition-colors" aria-label="Delete Category"><Icon icon="ic:baseline-delete" class="text-sm" /></button>
          </div>
        </div>
      {/each}
      <button onclick={startAddAnalyticsCategory} class="w-full py-3.5 border-2 border-dashed border-border hover:border-border-strong rounded-2xl flex items-center justify-center gap-2 text-content-subtle hover:text-content-muted transition-all"><Icon icon="ic:baseline-plus" /><span class="text-[10px] font-black uppercase tracking-widest">Add Category</span></button>
    </div>
  {/if}

  {#if missingCategories.length > 0}
    <div class="mt-6 p-4 bg-warning/10 border border-warning/30 rounded-2xl space-y-3 animate-in fade-in">
      <div class="flex items-center gap-2 text-warning">
        <Icon icon="ic:baseline-warning" class="text-lg" />
        <span class="text-[10px] font-bold uppercase tracking-widest">Missing Categories Found</span>
      </div>
      <p class="text-[9px] text-content-muted leading-relaxed">The following categories are referenced by existing exercises or modalities but don't exist. Add them back to track them in Analytics.</p>
      <div class="space-y-2">
        {#each missingCategories as mCat}
          <div class="flex items-center justify-between p-2.5 bg-surface/50 rounded-xl border border-warning/20">
            <span class="text-[10px] font-bold text-content">{mCat}</span>
            <button
              onclick={() => {
                analyticsCategories = [...analyticsCategories, {
                  id: generateId(),
                  name: mCat,
                  color: 'bg-zinc-500'
                }];
              }}
              class="px-3 py-1.5 bg-warning hover:bg-warning-hover text-white text-[9px] font-black uppercase tracking-widest rounded-lg transition-colors"
            >
              Restore
            </button>
          </div>
        {/each}
      </div>
    </div>
  {/if}
