import { storage } from '../storage';
import { calculatePlannedLoad, type Workout } from '../types';
import { generateId } from '../utils';

/**
 * Workout CRUD and the load calc calls that go with it.
 */
export class WorkoutStore {
  workouts = $state<Workout[]>([]);

  /**
   * Reloads workouts from storage.
   */
  async load() {
    const workouts = await storage.getWorkouts();

    // Data Cleanup: Fix workouts with 0 plannedLoad that have exercises (Legacy bug)
    let changed = false;
    workouts.forEach(workout => {
      if ((!workout.plannedLoad || workout.plannedLoad === 0) && workout.exercises.length > 0) {
        workout.plannedLoad = workout.exercises.reduce((acc, ex) => acc + calculatePlannedLoad(ex.prescribed ?? {}), 0);
        changed = true;
      }
    });
    if (changed) {
      // Save back the fixed workouts silently
      await storage._saveWorkouts(workouts);
    }

    this.workouts = workouts;
  }

  get completedWorkouts() {
    return this.workouts.filter(w => w.status === 'completed');
  }

  getPlannedWorkoutsForWeek(weekId: string) {
    return this.workouts.filter(w => w.weekId === weekId && w.status === 'planned');
  }

  /**
   * Saves a workout to storage. Recalculates the aggregate planned load
   * from its exercises before persisting.
   */
  async saveWorkout(workout: Workout) {
    const data = $state.snapshot(workout);

    data.plannedLoad = data.exercises.reduce((acc, e) => acc + calculatePlannedLoad(e.prescribed ?? {}), 0);

    await storage.saveWorkout(data);
  }

  async deleteWorkout(id: string) {
    await storage.deleteWorkout(id);
  }

  /**
   * Duplicates an existing workout, regenerating the workout's id and every
   * exercise slot's id so the duplicate never collides with the original.
   */
  async duplicateWorkout(workout: Workout) {
    const data = $state.snapshot(workout);
    const duplicated: Workout = {
      ...data,
      id: generateId(),
      status: 'planned',
      date: null,
      exercises: data.exercises.map(e => ({ ...e, id: generateId() }))
    };
    await storage.saveWorkout(duplicated);
  }
}
