import { storage } from '../storage';
import type { TrainingBlock, WeekOverride, CompetitionEvent, WorkoutTemplate } from '../types';
import { getBlocksForWeek, getDominantBlockForWeek } from '../planning/trainingBlocks';

/**
 * Training blocks (concurrent phase assignments), week overrides, the
 * competition/peaking calendar, and workout templates (Phase 4 replaces the
 * old one-phase-per-week `periodization` with `TrainingBlock[]` - see
 * PLAN.md Phase 4 / PROGRESS.md).
 */
export class PlanningStore {
  trainingBlocks = $state<TrainingBlock[]>([]);
  weekOverrides = $state<WeekOverride[]>([]);
  competitionEvents = $state<CompetitionEvent[]>([]);
  templates = $state<Record<string, WorkoutTemplate[]>>({});

  async load() {
    const [trainingBlocks, weekOverrides, competitionEvents, templates] = await Promise.all([
      storage.getTrainingBlocks(),
      storage.getWeekOverrides(),
      storage.getCompetitionEvents(),
      storage.getTemplates(),
    ]);
    this.trainingBlocks = trainingBlocks;
    this.weekOverrides = weekOverrides;
    this.competitionEvents = competitionEvents;
    this.templates = templates;
  }

  getBlocksForWeek(weekId: string) {
    return getBlocksForWeek(this.trainingBlocks, weekId);
  }

  getDominantBlockForWeek(weekId: string) {
    return getDominantBlockForWeek(this.trainingBlocks, weekId);
  }

  isWeekCustomized(weekId: string) {
    return !!this.weekOverrides.find((o) => o.weekId === weekId)?.customized;
  }

  /**
   * "Quick assign" a phase to a single week (see `storage.assignPhaseToWeek`).
   */
  async assignPhase(weekId: string, phaseId: string) {
    await storage.assignPhaseToWeek(weekId, phaseId);
  }

  /**
   * Creates or updates a (possibly multi-week) training block directly -
   * the concurrent-block / overlapping-emphasis editing path, distinct from
   * the single-week `assignPhase` quick-assign.
   */
  async saveTrainingBlock(block: TrainingBlock) {
    await storage.saveTrainingBlock(block);
  }

  async deleteTrainingBlock(id: string) {
    await storage.deleteTrainingBlock(id);
  }

  async saveCompetitionEvent(event: CompetitionEvent) {
    await storage.saveCompetitionEvent(event);
  }

  async deleteCompetitionEvent(id: string) {
    await storage.deleteCompetitionEvent(id);
  }

  async updateTemplates(templates: Record<string, WorkoutTemplate[]>) {
    await storage.saveTemplates(templates);
  }

  async resetTemplates() {
    await storage.resetTemplates();
  }

  /**
   * Clears all data (this week's own block, workouts, benchmarks) for a week.
   */
  async clearWeek(weekId: string) {
    await storage.clearWeekData(weekId);
  }
}
