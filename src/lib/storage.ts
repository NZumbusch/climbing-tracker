import localforage from 'localforage';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { Workout, PeriodizationWeek, ExerciseTypeDef, PhaseType } from './types';
import { DEFAULT_TEMPLATES, DEFAULT_EXERCISE_TYPES } from './constants';

localforage.config({
  name: 'boulder-tracker',
  storeName: 'training_data_v2'
});

/**
 * Storage singleton providing a clean interface for data persistence.
 * We've removed the complex queue to prevent deadlocks.
 */
export const storage = {
  // --- Private Helpers ---

  async _getWorkouts(): Promise<Workout[]> {
    return (await localforage.getItem<Workout[]>('workouts')) || [];
  },

  async _getPeriodization(): Promise<PeriodizationWeek[]> {
    return (await localforage.getItem<PeriodizationWeek[]>('periodization')) || [];
  },

  async _saveWorkouts(workouts: Workout[]): Promise<void> {
    await localforage.setItem('workouts', workouts);
  },

  async _savePeriodization(periodization: PeriodizationWeek[]): Promise<void> {
    await localforage.setItem('periodization', periodization);
  },

  // --- Public Interface ---

  async getWorkouts(): Promise<Workout[]> {
    return this._getWorkouts();
  },

  async saveWorkout(workout: Workout): Promise<void> {
    const workouts = await this._getWorkouts();
    const index = workouts.findIndex(w => w.id === workout.id);
    
    // Auto-mark week as customized
    if (workout.weekId) {
      await this.markWeekAsCustomized(workout.weekId);
    }

    if (index !== -1) {
      workouts[index] = workout;
    } else {
      workouts.push(workout);
    }
    await this._saveWorkouts(workouts);
  },

  async deleteWorkout(id: number): Promise<void> {
    const workouts = await this._getWorkouts();
    const workout = workouts.find(w => w.id === id);
    if (workout?.weekId) {
      await this.markWeekAsCustomized(workout.weekId);
    }
    const filtered = workouts.filter(w => w.id !== id);
    await this._saveWorkouts(filtered);
  },

  async getPeriodization(): Promise<PeriodizationWeek[]> {
    return this._getPeriodization();
  },

  async markWeekAsCustomized(weekId: string): Promise<void> {
    const periodization = await this._getPeriodization();
    const week = periodization.find(p => p.weekId === weekId);
    if (week && !week.customized) {
      week.customized = true;
      await this._savePeriodization(periodization);
    }
  },

  async savePeriodizationWeek(week: PeriodizationWeek): Promise<void> {
    const periodization = await this._getPeriodization();
    const index = periodization.findIndex(p => p.weekId === week.weekId);
    if (index !== -1) {
      periodization[index] = week;
    } else {
      periodization.push(week);
    }
    await this._savePeriodization(periodization);
  },

  async getTemplates(): Promise<Record<PhaseType, Partial<Workout>[]>> {
    return (await localforage.getItem<Record<PhaseType, Partial<Workout>[]>>('templates')) || DEFAULT_TEMPLATES;
  },

  async saveTemplates(templates: Record<PhaseType, Partial<Workout>[]>): Promise<void> {
    await localforage.setItem('templates', templates);
  },

  async resetTemplates(): Promise<void> {
    await localforage.setItem('templates', DEFAULT_TEMPLATES);
  },

  async getExerciseTypes(): Promise<ExerciseTypeDef[]> {
    return (await localforage.getItem<ExerciseTypeDef[]>('exerciseTypes')) || DEFAULT_EXERCISE_TYPES;
  },

  async saveExerciseTypes(types: ExerciseTypeDef[]): Promise<void> {
    const oldTypes = await this.getExerciseTypes();
    
    // Prevent duplicate names
    const names = types.map(t => t.name.trim().toLowerCase());
    if (new Set(names).size !== names.length) {
      throw new Error('Duplicate modality names are not allowed.');
    }

    const renames = new Map<string, string>();
    types.forEach(newType => {
      const oldType = oldTypes.find(t => t.id === newType.id);
      if (oldType && oldType.name !== newType.name) {
        renames.set(oldType.name, newType.name);
      }
    });

    await localforage.setItem('exerciseTypes', types);

    if (renames.size > 0) {
      const workouts = await this._getWorkouts();
      let workoutsChanged = false;
      workouts.forEach(w => {
        w.exercises.forEach(e => {
          if (renames.has(e.type)) {
            e.type = renames.get(e.type)!;
            workoutsChanged = true;
          }
        });
      });
      if (workoutsChanged) await this._saveWorkouts(workouts);

      const templates = await this.getTemplates();
      let templatesChanged = false;
      Object.values(templates).forEach(phaseTemplates => {
        phaseTemplates.forEach(t => {
          t.exercises?.forEach(e => {
            if (renames.has(e.type)) {
              e.type = renames.get(e.type)!;
              templatesChanged = true;
            }
          });
        });
      });
      if (templatesChanged) await this.saveTemplates(templates);
    }
  },

  async assignPhaseToWeek(weekId: string, phase: PhaseType): Promise<void> {
    const periodization = await this._getPeriodization();
    const existingIndex = periodization.findIndex(p => p.weekId === weekId);
    
    let isCustomized = false;
    if (existingIndex !== -1) {
      isCustomized = !!periodization[existingIndex].customized;
      periodization[existingIndex].phase = phase;
    } else {
      periodization.push({ weekId, phase });
    }
    await this._savePeriodization(periodization);

    if (!isCustomized) {
      const workouts = await this._getWorkouts();
      const filteredWorkouts = workouts.filter(w => !(w.weekId === weekId && w.status === 'planned'));
      const templates = await this.getTemplates();
      const phaseTemplates = templates[phase];
      
      const newWorkouts: Workout[] = phaseTemplates.map((t, i) => ({
        id: Date.now() + i,
        status: 'planned',
        date: null,
        weekId,
        notes: t.notes || '',
        loadFactor: 0,
        exercises: t.exercises || []
      }));
      
      await this._saveWorkouts([...filteredWorkouts, ...newWorkouts]);
    }
  },

  async exportData(): Promise<void> {
    const data = {
      workouts: await this.getWorkouts(),
      periodization: await this.getPeriodization(),
      templates: await this.getTemplates(),
      exerciseTypes: await this.getExerciseTypes(),
      exportVersion: '2.1'
    };
    
    const fileName = `boulder-tracker-backup-${new Date().toISOString().split('T')[0]}.json`;
    const jsonString = JSON.stringify(data, null, 2);

    if (Capacitor.isNativePlatform()) {
      try {
        const result = await Filesystem.writeFile({
          path: fileName,
          data: jsonString,
          directory: Directory.Cache,
          encoding: 'utf8'
        });

        await Share.share({
          title: 'Export Training Data',
          text: 'Backup of your boulder tracker data',
          url: result.uri,
          dialogTitle: 'Save or Share Data'
        });
      } catch (err) {
        console.error('Native export failed:', err);
        throw new Error('Failed to export data to device storage.');
      }
    } else {
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    }
  },

  async importData(file: File): Promise<void> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const content = e.target?.result as string;
          const data = JSON.parse(content);
          
          if (!data.workouts || !Array.isArray(data.workouts)) {
            throw new Error('Invalid backup format: workouts missing.');
          }

          if (data.workouts) await localforage.setItem('workouts', data.workouts);
          if (data.periodization) await localforage.setItem('periodization', data.periodization);
          if (data.templates) await localforage.setItem('templates', data.templates);
          if (data.exerciseTypes) await localforage.setItem('exerciseTypes', data.exerciseTypes);
          resolve();
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsText(file);
    });
  }
};
