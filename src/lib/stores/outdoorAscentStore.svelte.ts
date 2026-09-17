import { storage } from '../storage';
import type { OutdoorAscent } from '../types';

/**
 * Outdoor ascents (Phase 6) - a lightweight log, optionally bulk-imported
 * from an 8a.nu CSV export (`src/lib/importers/outdoorAscentCsvImport.ts`),
 * for correlating outdoor performance against training blocks/load. Follows
 * the same "actual logged records" shape as `benchmarkStore`.
 */
export class OutdoorAscentStore {
  outdoorAscents = $state<OutdoorAscent[]>([]);

  async load() {
    this.outdoorAscents = await storage.getOutdoorAscents();
  }

  async saveOutdoorAscent(ascent: OutdoorAscent) {
    await storage.saveOutdoorAscent(ascent);
  }

  async addOutdoorAscents(ascents: OutdoorAscent[]) {
    await storage.addOutdoorAscents(ascents);
  }

  async deleteOutdoorAscent(id: string) {
    await storage.deleteOutdoorAscent(id);
  }
}
