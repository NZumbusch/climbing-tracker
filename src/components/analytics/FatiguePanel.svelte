<script lang="ts">
  /**
   * Analytics' Fatigue panel (UI_PLAN.md §4.6/§5.4, Stage 5). Home already
   * shows fatigue "as of now" (its own bars) - per §2's "Home = now,
   * Analytics = history, no duplicated panels" rule, this panel instead
   * samples the same shared `computeFatigueDecay` model at each displayed
   * week's end date (mirroring the sampling pattern `calculateRollingAcwrSeries`
   * already established in Stage 2), so it shows a genuine trend rather
   * than repeating Home's single snapshot.
   */
  import Icon from "@iconify/svelte";

  export interface FatigueWeekSample {
    weekId: string;
    fingers?: number;
    arms?: number;
    core?: number;
    systemic?: number;
  }
  export interface FatigueCoverage {
    total: number;
    fingers: number;
    arms: number;
    core: number;
    systemic: number;
  }

  let { samples, weekLabels, coverage }: {
    samples: FatigueWeekSample[];
    weekLabels: Record<string, string>;
    coverage: FatigueCoverage;
  } = $props();

  const AXES: { key: 'fingers' | 'arms' | 'core' | 'systemic'; label: string }[] = [
    { key: 'fingers', label: 'Fingers' },
    { key: 'arms', label: 'Arms' },
    { key: 'core', label: 'Core' },
    { key: 'systemic', label: 'Systemic' },
  ];

  // Values are on a fixed 1-10 RPE-like scale (same as FatigueModal's
  // sliders), so the y-axis is a fixed 0-10 range, not a per-axis min/max -
  // this keeps the four rows visually comparable to each other.
  function toPoints(values: (number | undefined)[]): ({ x: number; y: number } | null)[] {
    const n = values.length;
    return values.map((v, i) => v === undefined ? null : { x: (i / Math.max(n - 1, 1)) * 100, y: 100 - (v / 10) * 100 });
  }

  /** Splits a point series into connected runs, breaking at gaps (undefined values) - same approach AcwrPanel/the merged Rolling Load chart use for `!sufficient`/undefined ACWR weeks. */
  function toSegments(points: ({ x: number; y: number } | null)[]): { x: number; y: number }[][] {
    const segments: { x: number; y: number }[][] = [];
    let current: { x: number; y: number }[] = [];
    for (const p of points) {
      if (p === null) {
        if (current.length > 1) segments.push(current);
        current = [];
      } else {
        current.push(p);
      }
    }
    if (current.length > 1) segments.push(current);
    return segments;
  }

  function latestValue(values: (number | undefined)[]): number | undefined {
    for (let i = values.length - 1; i >= 0; i--) {
      if (values[i] !== undefined) return values[i];
    }
    return undefined;
  }
</script>

<div class="bg-surface/50 border border-border rounded-card p-5 space-y-4 backdrop-blur-sm shadow-card">
  <div class="flex items-center justify-between px-1">
    <div>
      <h3 class="text-section uppercase text-content-muted">Fatigue</h3>
      <p class="text-caption text-content-subtle mt-0.5">Decayed load per axis, across the displayed weeks</p>
    </div>
    <div class="p-2 bg-primary-hover/10 rounded-control text-primary">
      <Icon icon="ic:baseline-bolt" class="text-lg" />
    </div>
  </div>

  <div class="space-y-4">
    {#each AXES as axis}
      {@const values = samples.map((s) => s[axis.key])}
      {@const points = toPoints(values)}
      {@const segments = toSegments(points)}
      {@const current = latestValue(values)}
      <div class="space-y-1">
        <div class="flex items-center justify-between">
          <span class="text-label text-content-subtle">{axis.label}</span>
          <span class="text-caption text-content tabular-nums">{current !== undefined ? current.toFixed(1) : '—'}</span>
        </div>
        <div class="h-8 relative">
          <svg class="absolute inset-0 w-full h-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
            {#each segments as seg}
              <path
                d="M {seg.map((p) => `${p.x} ${p.y}`).join(' L ')}"
                fill="none"
                stroke="var(--color-primary)"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                vector-effect="non-scaling-stroke"
              />
            {/each}
          </svg>
        </div>
      </div>
    {/each}

    {#if coverage.total > 0}
      <p class="text-caption text-content-subtle pt-1">Arms: {coverage.arms} of {coverage.total} sessions in window</p>
    {:else}
      <p class="text-caption text-content-subtle italic text-center py-2">No completed sessions in this window</p>
    {/if}
  </div>
</div>
