import { storage } from '../storage';
import type { PeriodizationWeek, WorkoutTemplate } from '../types';

/**
 * Periodization, templates, and phase assignment.
 */
export class PlanningStore {
  periodization = $state<PeriodizationWeek[]>([]);
  templates = $state<Record<string, WorkoutTemplate[]>>({});

  async load() {
    const [periodization, templates] = await Promise.all([
      storage.getPeriodization(),
      storage.getTemplates(),
    ]);
    this.periodization = periodization;
    this.templates = templates;
  }

  getPeriodizationForWeek(weekId: string) {
    return this.periodization.find(p => p.weekId === weekId);
  }

  /**
   * Assigns a training phase to a specific week.
   */
  async assignPhase(weekId: string, phaseId: string) {
    await storage.assignPhaseToWeek(weekId, phaseId);
  }

  async updateTemplates(templates: Record<string, WorkoutTemplate[]>) {
    await storage.saveTemplates(templates);
  }

  async resetTemplates() {
    await storage.resetTemplates();
  }

  /**
   * Clears all data (periodization, workouts, benchmarks) for a week.
   */
  async clearWeek(weekId: string) {
    await storage.clearWeekData(weekId);
  }
}
