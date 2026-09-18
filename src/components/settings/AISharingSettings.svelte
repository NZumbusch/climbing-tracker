<script lang="ts">
  /**
   * What gets included in an AI prompt's condensed training profile
   * (UI_PLAN.md §5.8, Stage 10) - a separate privacy decision from "does the
   * AI have enough context", since these prompts are copy/pasted into an
   * external AI chat by the user themselves (`AIPromptModal.svelte`), not
   * sent anywhere by this app directly. Each category is independently
   * togglable; a disabled one is simply omitted from the generated prompt,
   * never sent-but-redacted (`src/lib/ai/context.ts`).
   *
   * Placed under Settings' "Data & Exports" tab, next to backups/calendar
   * export - the app's other "what leaves this device" surface - rather
   * than a new top-level tab, same reasoning Stage 8 used to nest
   * Notifications into Appearance & Behaviour instead of promoting it.
   */
  import { trainingState } from '../../lib/state.svelte';
  import type { AISharingPreferences } from '../../lib/preferences/migrate';
  import Icon from "@iconify/svelte";

  const CATEGORIES: { id: keyof AISharingPreferences; label: string; description: string }[] = [
    { id: 'trainingBlocks', label: 'Training Blocks', description: 'Active/upcoming phase blocks covering or near the prompt\'s target weeks.' },
    { id: 'competitions', label: 'Competitions', description: 'Upcoming events and their priority - what you\'re peaking for.' },
    { id: 'readinessMetrics', label: 'Readiness & Daily Metrics', description: 'Current readiness score plus sleep/HRV/RHR/bodyweight trends. Health data - off by default.' },
    { id: 'painLogs', label: 'Pain Logs', description: 'Recent pain/discomfort entries. Health data - off by default.' },
    { id: 'outdoorAscents', label: 'Outdoor Ascents', description: 'Recent outdoor grade history.' },
  ];
</script>

<div class="bg-surface border border-border rounded-card p-5 space-y-4 backdrop-blur-sm shadow-card animate-in fade-in">
  <div class="space-y-2">
    <h3 class="text-section uppercase text-content-muted px-1">AI Sharing</h3>
    <p class="text-caption text-content-subtle px-1 leading-relaxed">
      Controls what the "AI Coach Prompt" (Training Plan screen) includes when you copy it. Nothing here leaves this device automatically - the prompt is only ever sent when you paste it into an AI yourself.
    </p>
  </div>

  <div class="space-y-1.5">
    {#each CATEGORIES as category}
      <label class="flex items-center justify-between gap-3 p-3.5 rounded-control border border-border-strong/50 bg-surface-elevated/30 cursor-pointer">
        <div class="min-w-0">
          <p class="text-body text-content">{category.label}</p>
          <p class="text-caption text-content-subtle mt-0.5">{category.description}</p>
        </div>
        <input
          type="checkbox"
          checked={trainingState.aiSharing[category.id]}
          onchange={(e) => trainingState.setAiSharing(category.id, e.currentTarget.checked)}
          class="w-5 h-5 rounded accent-primary shrink-0"
        />
      </label>
    {/each}
  </div>

  <div class="flex items-start gap-2 p-3 rounded-control bg-primary/5 border border-primary/20">
    <Icon icon="ic:baseline-info" class="text-primary text-lg shrink-0 mt-0.5" />
    <p class="text-caption text-content-muted leading-relaxed">Exercise catalog, recent workouts, phases and benchmarks are always included - these toggles only cover the categories above.</p>
  </div>
</div>
