<script lang="ts">
  /**
   * Fatigue radar/spider chart (UI_PLAN.md §2/§3.3 decision table: "Fatigue
   * visualisation: Both bars and radar, switchable in Appearance... Bars
   * are the default"). Shared by Home's fatigue section and Analytics'
   * `FatiguePanel.svelte` - same four values `computeFatigueDecay` already
   * produces, this is presentation only.
   *
   * The stash's own radar chart was explicitly rejected in the Stage 0/1
   * stash audit for imputing missing axes with `|| 5` - a radar polygon
   * structurally can't represent "no data" honestly at one vertex without
   * either implying zero fatigue (plotting at centre) or max fatigue
   * (plotting at the rim), and a partial polygon that skips a vertex still
   * draws a line across where that axis *would* be, implying a value that
   * was never measured. Rather than accept either kind of misrepresentation,
   * this component only renders the shape once all four axes have a real
   * value; otherwise it shows a plain "not enough data" message - the same
   * "skip the claim, don't guess" discipline `readiness.ts`'s `sufficient`
   * gate and `AcwrPanel`'s gap-rendering already use elsewhere in this app.
   */
  let { fingers, arms, core, systemic }: {
    fingers?: number;
    arms?: number;
    core?: number;
    systemic?: number;
  } = $props();

  const AXES = [
    { key: 'fingers', label: 'Fingers', angle: -90 },
    { key: 'arms', label: 'Arms', angle: 0 },
    { key: 'core', label: 'Core', angle: 90 },
    { key: 'systemic', label: 'Systemic', angle: 180 },
  ] as const;

  const values = $derived({ fingers, arms, core, systemic });
  const complete = $derived(AXES.every((a) => values[a.key] !== undefined));

  const CENTER = 50;
  const RADIUS = 24;
  const LABEL_RADIUS = RADIUS + 11;
  const GRID_RINGS = [0.25, 0.5, 0.75, 1];

  function valuePoint(angleDeg: number, value: number): { x: number; y: number } {
    const rad = (angleDeg * Math.PI) / 180;
    const r = (value / 10) * RADIUS;
    return { x: CENTER + r * Math.cos(rad), y: CENTER + r * Math.sin(rad) };
  }

  function radiusPoint(angleDeg: number, radiusPx: number): { x: number; y: number } {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: CENTER + radiusPx * Math.cos(rad), y: CENTER + radiusPx * Math.sin(rad) };
  }

  function ringPolygon(fraction: number): string {
    return AXES.map((a) => {
      const p = valuePoint(a.angle, fraction * 10);
      return `${p.x},${p.y}`;
    }).join(' ');
  }

  const dataPolygon = $derived.by(() => {
    if (!complete) return '';
    return AXES.map((a) => {
      const p = valuePoint(a.angle, values[a.key]!);
      return `${p.x},${p.y}`;
    }).join(' ');
  });
</script>

{#if complete}
  <div class="w-full flex justify-center">
    <svg viewBox="0 0 100 100" class="w-full max-w-[190px] aspect-square">
      {#each GRID_RINGS as ring}
        <polygon points={ringPolygon(ring)} fill="none" class="stroke-border" stroke-width="0.5" />
      {/each}
      {#each AXES as a}
        {@const p = valuePoint(a.angle, 10)}
        <line x1={CENTER} y1={CENTER} x2={p.x} y2={p.y} class="stroke-border" stroke-width="0.5" />
      {/each}
      <polygon
        points={dataPolygon}
        class="fill-primary/25 stroke-primary"
        stroke-width="1.5"
        stroke-linejoin="round"
      />
      {#each AXES as a}
        {@const p = radiusPoint(a.angle, LABEL_RADIUS)}
        <text x={p.x} y={p.y} text-anchor="middle" dominant-baseline="middle" class="text-content-subtle" fill="currentColor" style="font-size: 7px;">{a.label}</text>
      {/each}
    </svg>
  </div>
{:else}
  <p class="text-caption text-content-subtle italic text-center py-6">Not enough data for a radar view yet - showing bars instead once every axis has a value.</p>
{/if}
