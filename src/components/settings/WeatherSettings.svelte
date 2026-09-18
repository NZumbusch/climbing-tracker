<script lang="ts">
  /**
   * Weather (UI_PLAN.md §4.7/§5.5, Stage 8) - the Settings UI over the
   * store/preferences already wired in Stage 8 part 3. The whole feature
   * is off by default (both locations `null`) until set here.
   */
  import { trainingState } from '../../lib/state.svelte';
  import type { WeatherLocation } from '../../lib/preferences/migrate';
  import LocationEditor from './LocationEditor.svelte';
  import Icon from "@iconify/svelte";
</script>

<div class="bg-surface border border-border rounded-card p-5 space-y-4 backdrop-blur-sm shadow-card animate-in fade-in">
  <div class="space-y-2">
    <h3 class="text-section uppercase text-content-muted px-1">Weather</h3>
    <p class="text-caption text-content-subtle px-1 leading-relaxed">
      Open-Meteo, no account needed. A home location shows current conditions on Home; an optional trip location adds a 7-day forecast card for planning outdoor trips.
    </p>
  </div>

  <div class="space-y-3">
    <LocationEditor
      label="Home location"
      location={trainingState.homeLocation}
      onSet={(loc: WeatherLocation) => trainingState.setHomeLocation(loc)}
      onClear={() => trainingState.setHomeLocation(null)}
    />
    <LocationEditor
      label="Trip location"
      location={trainingState.tripLocation}
      onSet={(loc: WeatherLocation) => trainingState.setTripLocation(loc)}
      onClear={() => trainingState.setTripLocation(null)}
    />
  </div>
</div>
