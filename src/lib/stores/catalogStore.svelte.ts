import { storage } from '../storage';
import type { ExerciseTypeDef, AnalyticsCategory, BenchmarkTypeDef, PhaseDef } from '../types';

/**
 * The archivable definition/catalog registries (Phase 1 principle 4 -
 * "what can be tracked" is data): exercise types, analytics categories,
 * benchmark types, and (Phase 3) macrocycle phases. Distinct from
 * `benchmarkStore`, which holds the actual logged `Benchmark` records
 * ("what was tracked").
 */
export class CatalogStore {
  exerciseTypes = $state<ExerciseTypeDef[]>([]);
  analyticsCategories = $state<AnalyticsCategory[]>([]);
  benchmarkTypes = $state<BenchmarkTypeDef[]>([]);
  phaseDefs = $state<PhaseDef[]>([]);

  async load() {
    const [exerciseTypes, analyticsCategories, benchmarkTypes, phaseDefs] = await Promise.all([
      storage.getExerciseTypes(),
      storage.getAnalyticsCategories(),
      storage.getBenchmarkTypes(),
      storage.getPhaseDefs(),
    ]);
    this.exerciseTypes = exerciseTypes;
    this.analyticsCategories = analyticsCategories;
    this.benchmarkTypes = benchmarkTypes;
    this.phaseDefs = phaseDefs;
  }

  async updateExerciseTypes(types: ExerciseTypeDef[]) {
    await storage.saveExerciseTypes(types);
  }

  async updateAnalyticsCategories(categories: AnalyticsCategory[]) {
    await storage.saveAnalyticsCategories(categories);
  }

  async updateBenchmarkTypes(types: BenchmarkTypeDef[]) {
    await storage.saveBenchmarkTypes(types);
  }

  async updatePhaseDefs(defs: PhaseDef[]) {
    await storage.savePhaseDefs(defs);
  }
}
