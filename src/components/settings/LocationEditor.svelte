<script lang="ts">
  /**
   * One location field (home or trip) for `WeatherSettings.svelte`
   * (UI_PLAN.md §5.5). City search via `trainingState.geocodeCity` is the
   * convenient path; raw lat/lon entry is always available too (§10 open
   * question 3's stated default: "allow city search for convenience, but
   * also accept raw lat/lon entry so the feature is usable with no
   * geocoding call at all").
   */
  import { trainingState } from '../../lib/state.svelte';
  import type { WeatherLocation } from '../../lib/preferences/migrate';

  let { label, location, onSet, onClear }: {
    label: string;
    location: WeatherLocation | null;
    onSet: (location: WeatherLocation) => void;
    onClear: () => void;
  } = $props();

  let editing = $state(false);
  let showManual = $state(false);
  let query = $state('');
  let searching = $state(false);
  let results = $state<{ name: string; countryCode?: string; latitude: number; longitude: number }[]>([]);
  let manualLat = $state('');
  let manualLon = $state('');
  let manualName = $state('');

  async function search() {
    if (!query.trim()) {
      results = [];
      return;
    }
    searching = true;
    results = await trainingState.geocodeCity(query);
    searching = false;
  }

  function pick(r: (typeof results)[number]) {
    onSet({ name: r.countryCode ? `${r.name}, ${r.countryCode}` : r.name, latitude: r.latitude, longitude: r.longitude });
    closeEditor();
  }

  function applyManual() {
    const lat = parseFloat(manualLat);
    const lon = parseFloat(manualLon);
    if (Number.isNaN(lat) || Number.isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return;
    onSet({ name: manualName.trim() || `${lat.toFixed(4)}, ${lon.toFixed(4)}`, latitude: lat, longitude: lon });
    closeEditor();
  }

  function closeEditor() {
    editing = false;
    showManual = false;
    query = '';
    results = [];
    manualLat = '';
    manualLon = '';
    manualName = '';
  }
</script>

<div class="p-3.5 rounded-control border border-border-strong/50 bg-surface-elevated/30 space-y-3">
  <div class="flex items-center justify-between gap-3">
    <div class="min-w-0">
      <p class="text-label text-content-subtle">{label}</p>
      <p class="text-body text-content truncate">{location?.name ?? '— off —'}</p>
    </div>
    <div class="flex items-center gap-3 shrink-0">
      {#if location}
        <button onclick={onClear} class="text-label text-content-subtle hover:text-danger transition-colors">Remove</button>
      {/if}
      <button onclick={() => editing = !editing} class="text-label text-primary">{location ? 'Edit' : 'Add'}</button>
    </div>
  </div>

  {#if editing}
    <div class="space-y-2.5 pt-2 border-t border-border/50 animate-in fade-in">
      {#if !showManual}
        <div class="flex gap-2">
          <input
            type="text"
            bind:value={query}
            placeholder="Search city..."
            class="flex-1 bg-surface-elevated text-content p-2.5 rounded-control border border-border-strong outline-none text-sm"
            onkeydown={(e) => e.key === 'Enter' && search()}
          />
          <button onclick={search} disabled={searching} class="px-3 py-2 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-sm font-bold rounded-control">
            {searching ? '...' : 'Search'}
          </button>
        </div>
        {#if results.length > 0}
          <div class="space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
            {#each results as r}
              <button onclick={() => pick(r)} class="w-full text-left px-3 py-2 bg-surface-elevated hover:bg-surface-elevated-hover rounded-control text-body text-content transition-colors">
                {r.name}{r.countryCode ? `, ${r.countryCode}` : ''}
              </button>
            {/each}
          </div>
        {:else if query.trim() && !searching}
          <p class="text-caption text-content-subtle italic">No matches - try a different search, or enter coordinates directly.</p>
        {/if}
        <button onclick={() => showManual = true} class="text-label text-content-subtle hover:text-primary transition-colors">Enter coordinates instead</button>
      {:else}
        <div class="grid grid-cols-2 gap-2">
          <input type="number" step="0.0001" bind:value={manualLat} placeholder="Latitude" class="bg-surface-elevated text-content p-2.5 rounded-control border border-border-strong outline-none text-sm" />
          <input type="number" step="0.0001" bind:value={manualLon} placeholder="Longitude" class="bg-surface-elevated text-content p-2.5 rounded-control border border-border-strong outline-none text-sm" />
        </div>
        <input type="text" bind:value={manualName} placeholder="Label (optional)" class="w-full bg-surface-elevated text-content p-2.5 rounded-control border border-border-strong outline-none text-sm" />
        <div class="flex gap-2">
          <button onclick={applyManual} class="flex-1 py-2 bg-primary hover:bg-primary-hover text-white text-sm font-bold rounded-control">Set Location</button>
          <button onclick={() => showManual = false} class="px-3 py-2 bg-surface-elevated text-content-muted text-sm rounded-control">Back</button>
        </div>
      {/if}
    </div>
  {/if}
</div>
