import { storage } from '../storage';
import type { MetricDef, DailyMetricEntry, PainLog } from '../types';

/**
 * `metricDefs`/`dailyMetrics`/`painLogs` from Phase 1. No UI reads or
 * writes this data yet (entry UI is Phase 4/6's job) - this store exists
 * so the data has a home consistent with every other domain store, with
 * working load/save wired to the storage accessors added in Phase 2.
 */
export class MetricsStore {
  metricDefs = $state<MetricDef[]>([]);
  dailyMetrics = $state<DailyMetricEntry[]>([]);
  painLogs = $state<PainLog[]>([]);

  async load() {
    const [metricDefs, dailyMetrics, painLogs] = await Promise.all([
      storage.getMetricDefs(),
      storage.getDailyMetrics(),
      storage.getPainLogs(),
    ]);
    this.metricDefs = metricDefs;
    this.dailyMetrics = dailyMetrics;
    this.painLogs = painLogs;
  }

  async updateMetricDefs(defs: MetricDef[]) {
    await storage.saveMetricDefs(defs);
  }

  async updateDailyMetrics(entries: DailyMetricEntry[]) {
    await storage.saveDailyMetrics(entries);
  }

  async updatePainLogs(logs: PainLog[]) {
    await storage.savePainLogs(logs);
  }

  async savePainLog(log: PainLog) {
    await storage.savePainLog(log);
  }

  async deletePainLog(id: string) {
    await storage.deletePainLog(id);
  }
}
