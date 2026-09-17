<script lang="ts">
  /**
   * Settings-tab wrapper hosting the health/outdoor log domain components
   * (PLAN.md Phase 6) - mirrors ExerciseSettings.svelte's
   * "domain component(s) + settings-tab wrapper" pattern.
   */
  import BodyweightLog from '../health/BodyweightLog.svelte';
  import OutdoorAscentImport from '../health/OutdoorAscentImport.svelte';
</script>

<div class="space-y-6">
  <BodyweightLog />
  <OutdoorAscentImport />
</div>
