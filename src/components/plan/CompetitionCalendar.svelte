<script lang="ts">
  /**
   * Competition/peaking calendar (PLAN.md Phase 4): list + add form for
   * `CompetitionEvent`s, plus a countdown to the next A-priority event.
   */
  import { trainingState } from '../../lib/state.svelte';
  import { generateId } from '../../lib/utils';
  import { formatDate } from '../../lib/dateUtils';
  import type { CompetitionEvent } from '../../lib/types';
  import Icon from "@iconify/svelte";

  const priorityColor: Record<CompetitionEvent['priority'], string> = {
    A: 'bg-danger text-white',
    B: 'bg-warning text-white',
    C: 'bg-surface-elevated-hover text-content-muted',
  };

  const upcomingEvents = $derived(
    [...trainingState.competitionEvents]
      .filter((e) => e.date >= new Date().toISOString().split('T')[0])
      .sort((a, b) => a.date.localeCompare(b.date)),
  );

  const nextAEvent = $derived(upcomingEvents.find((e) => e.priority === 'A'));

  const daysUntil = $derived.by(() => {
    if (!nextAEvent) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(nextAEvent.date);
    return Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  });

  let isAdding = $state(false);
  let draft = $state<CompetitionEvent>({ id: '', name: '', date: '', priority: 'A' });

  function startAdd() {
    draft = { id: generateId(), name: '', date: new Date().toISOString().split('T')[0], priority: 'A' };
    isAdding = true;
  }

  async function handleSave() {
    if (!draft.name.trim() || !draft.date) return;
    await trainingState.saveCompetitionEvent($state.snapshot(draft));
    isAdding = false;
  }

  async function handleDelete(id: string) {
    await trainingState.deleteCompetitionEvent(id);
  }
</script>

<div class="bg-surface/50 border border-border p-6 rounded-3xl backdrop-blur-sm space-y-4 shadow-xl">
  <div class="flex items-center justify-between">
    <div>
      <h3 class="text-xs font-bold text-content-muted uppercase tracking-widest">Competition Calendar</h3>
      {#if nextAEvent && daysUntil !== null}
        <p class="text-[10px] text-primary uppercase mt-0.5 font-black">{daysUntil} {daysUntil === 1 ? 'day' : 'days'} to {nextAEvent.name}</p>
      {:else}
        <p class="text-[9px] text-content-subtle uppercase mt-0.5">No upcoming A-priority events</p>
      {/if}
    </div>
    <button onclick={startAdd} class="bg-surface-elevated hover:bg-surface-elevated-hover text-content p-1.5 rounded-md transition-colors"><Icon icon="ic:baseline-plus" class="text-sm" /></button>
  </div>

  {#if isAdding}
    <div class="p-4 bg-surface-elevated/50 border border-primary/30 rounded-2xl space-y-3">
      <input bind:value={draft.name} placeholder="Event name" class="w-full bg-surface text-content p-3 rounded-xl border border-border-strong outline-none text-sm" />
      <div class="flex gap-3">
        <input type="date" bind:value={draft.date} class="flex-1 bg-surface text-content p-3 rounded-xl border border-border-strong outline-none text-sm" />
        <select bind:value={draft.priority} class="w-24 bg-surface text-content p-3 rounded-xl border border-border-strong outline-none text-sm appearance-none">
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
        </select>
      </div>
      <div class="flex gap-2">
        <button onclick={handleSave} class="flex-1 py-2.5 bg-primary text-white text-[10px] font-black uppercase tracking-widest rounded-xl">Save</button>
        <button onclick={() => isAdding = false} class="px-4 py-2.5 bg-surface-elevated text-content-muted text-[10px] font-black uppercase tracking-widest rounded-xl">Cancel</button>
      </div>
    </div>
  {/if}

  <div class="space-y-2">
    {#each upcomingEvents as event}
      <div class="flex items-center justify-between p-3 bg-surface-elevated/50 rounded-xl border border-border-strong/50">
        <div class="flex items-center gap-2.5 min-w-0 flex-1">
          <span class="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-black flex-shrink-0 {priorityColor[event.priority]}">{event.priority}</span>
          <div class="min-w-0 flex-1">
            <p class="text-xs font-bold text-content truncate">{event.name}</p>
            <p class="text-[9px] text-content-subtle mt-0.5">{formatDate(event.date)}</p>
          </div>
        </div>
        <button onclick={() => handleDelete(event.id)} class="p-1.5 text-content-subtle hover:text-danger transition-colors flex-shrink-0"><Icon icon="ic:baseline-delete" class="text-sm" /></button>
      </div>
    {:else}
      {#if !isAdding}
        <div class="p-4 bg-surface-elevated/20 rounded-xl border border-dashed border-border text-center"><p class="text-[10px] text-content-subtle italic uppercase tracking-widest">No events scheduled</p></div>
      {/if}
    {/each}
  </div>
</div>
