import { storage } from '../storage';
import type { Benchmark } from '../types';

/**
 * The actual logged `Benchmark` test records (Phase 1 principle 4 -
 * "what was tracked" is a record). Definitions of *what* can be
 * benchmarked (`BenchmarkTypeDef`) live in `catalogStore`.
 */
export class BenchmarkStore {
  benchmarks = $state<Benchmark[]>([]);

  async load() {
    this.benchmarks = await storage.getBenchmarks();
  }

  getBenchmarksForWeek(weekId: string) {
    return this.benchmarks.filter(b => b.weekId === weekId);
  }

  async saveBenchmark(benchmark: Benchmark) {
    await storage.saveBenchmark(benchmark);
  }

  async deleteBenchmark(id: string) {
    await storage.deleteBenchmark(id);
  }
}
