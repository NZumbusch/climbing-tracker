import { storage } from '../storage';
import type { Workout, PeriodizationWeek, ExerciseTypeDef, PhaseDef } from '../types';
import { showAlert } from '../utils';
import { slotValues, slotTypeName } from '../exerciseSlot';

/**
 * Import/export/CSV.
 */
export class BackupStore {
  /**
   * Exports all training data to a JSON file.
   */
  async exportData() {
    try {
      await storage.exportData();
    } catch (err) {
      await showAlert('Export Error', err instanceof Error ? err.message : 'Export failed');
    }
  }

  /**
   * Imports training data from a file. Throws on failure - the caller
   * (the `trainingState` facade) is responsible for refreshing state and
   * surfacing success/error feedback, since a successful import needs
   * every other store reloaded, not just this one.
   */
  async importFile(file: File): Promise<void> {
    await storage.importData(file);
  }

  /**
   * Exports all training data to a CSV file for analysis in Excel or Python.
   */
  exportToCSV(workouts: Workout[], periodization: PeriodizationWeek[], exerciseTypes: ExerciseTypeDef[], phaseDefs: PhaseDef[]) {
    if (workouts.length === 0) {
      showAlert('Export Error', 'No data to export');
      return;
    }

    const rows = [];
    const headers = [
      'Date', 'WeekId', 'Phase', 'Day', 'Workout Notes', 'Workout Description', 'Workout Actual Load', 'Workout Planned Load',
      'Fingers Fatigue', 'Core Fatigue', 'Systemic Fatigue',
      'Exercise Type', 'Exercise Notes', 'Exercise Duration', 'Exercise Planned Load', 'Reps', 'Sets', 'Weight', 'Distance',
      'Hold Type', 'Hold Size', 'Time On', 'Time Off', 'Rest Time', 'Climbing Style', 'Board Type', 'Board Angle'
    ];
    rows.push(headers.join(','));

    workouts.forEach(w => {
      const phaseId = periodization.find(p => p.weekId === w.weekId)?.phaseId;
      const phase = (phaseId && phaseDefs.find(p => p.id === phaseId)?.name) || '';
      const baseInfo = [
        w.date || '',
        w.weekId,
        `"${phase}"`,
        w.dayOfWeek || '',
        `"${(w.notes || '').replace(/"/g, '""')}"`,
        `"${(w.description || '').replace(/"/g, '""')}"`,
        w.loadFactor || 0,
        w.plannedLoad || 0,
        w.fingers || 0,
        w.core || 0,
        w.systemic || 0
      ];

      if (!w.exercises || w.exercises.length === 0) {
        rows.push([...baseInfo, ...Array(16).fill('')].join(','));
      } else {
        w.exercises.forEach(slot => {
          const e = slotValues(slot);
          const exInfo = [
            `"${slotTypeName(slot, exerciseTypes)}"`,
            `"${(e.notes || '').replace(/"/g, '""')}"`,
            e.duration || 0,
            e.plannedLoad || 0,
            e.reps || 0,
            e.sets || 0,
            e.weight || 0,
            e.distance || 0,
            e.holdType || '',
            e.holdSize || 0,
            e.timeOn || 0,
            e.timeOff || 0,
            e.timeBetweenSets || 0,
            (Array.isArray(e.climbingStyle) ? e.climbingStyle.join(' + ') : e.climbingStyle) || '',
            e.boardType || '',
            e.boardAngle || ''
          ];
          rows.push([...baseInfo, ...exInfo].join(','));
        });
      }
    });

    const csvContent = rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `climbing-tracker-data-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
