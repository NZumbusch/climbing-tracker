<script lang="ts">
  /**
   * Inline prescribed-target hint for a numeric `ExerciseForm` field
   * (UI_PLAN.md §4.4: "each field shows the corresponding prescribed value
   * as a hint with a divergence cue (at target / above / below)"). Display
   * only - never writes to `prescribed`, that invariant stays Phase 1's.
   */
  import Icon from '@iconify/svelte';

  let { prescribed, current, unit = '' }: {
    prescribed: number | undefined;
    current: number | undefined;
    unit?: string;
  } = $props();

  type Status = 'at' | 'above' | 'below';
  const status = $derived.by((): Status | undefined => {
    if (prescribed === undefined || current === undefined) return undefined;
    if (current === prescribed) return 'at';
    return current > prescribed ? 'above' : 'below';
  });

  const ICONS: Record<Status, string> = {
    at: 'ic:baseline-check',
    above: 'ic:baseline-arrow-upward',
    below: 'ic:baseline-arrow-downward',
  };
</script>

{#if status}
  <span class="inline-flex items-center gap-0.5 text-caption font-mono tabular-nums {status === 'at' ? 'text-status-good' : 'text-content-subtle'}">
    <Icon icon={ICONS[status]} class="text-[10px]" />
    Target: {prescribed}{unit}
  </span>
{/if}
