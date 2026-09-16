import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { assertMigrationInvariants, runDataMigrations } from "./storage";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): any {
  const raw = readFileSync(
    path.join(__dirname, "__fixtures__", name),
    "utf-8",
  );
  return JSON.parse(raw);
}

// Phase 0's post-migration safety net: assertMigrationInvariants is the
// function runStartupMigrations relies on to decide whether to restore the
// pre-migration backup instead of persisting migrated data. Tested directly
// (rather than through runStartupMigrations) because that method also
// touches localforage/Capacitor/showAlert, which aren't meaningful to
// exercise under vitest's node environment - see PROGRESS.md, Phase 0 entry.
describe("assertMigrationInvariants", () => {
  const baseline = {
    workouts: [
      { id: "w1", exercises: [{ id: "e1", type: "Free Bouldering" }] },
    ],
    benchmarks: [{ id: "b1" }],
    exerciseTypes: [{ id: "free-bouldering", name: "Free Bouldering" }],
  };

  it("does not throw when workout/benchmark counts and exercise types are preserved", () => {
    const after = JSON.parse(JSON.stringify(baseline));
    expect(() => assertMigrationInvariants(baseline, after)).not.toThrow();
  });

  it("throws when the workout count changes", () => {
    const after = JSON.parse(JSON.stringify(baseline));
    after.workouts.push({ id: "w2", exercises: [] });
    expect(() => assertMigrationInvariants(baseline, after)).toThrow(
      /workout count changed/,
    );
  });

  it("throws when the benchmark count changes", () => {
    const after = JSON.parse(JSON.stringify(baseline));
    after.benchmarks = [];
    expect(() => assertMigrationInvariants(baseline, after)).toThrow(
      /benchmark count changed/,
    );
  });

  it("throws when an exercise's type no longer resolves against exerciseTypes", () => {
    const after = JSON.parse(JSON.stringify(baseline));
    after.exerciseTypes = []; // simulates a bad migration dropping the type definition
    expect(() => assertMigrationInvariants(baseline, after)).toThrow(
      /unresolvable type/,
    );
  });

  it("reports every problem found, not just the first", () => {
    const after = JSON.parse(JSON.stringify(baseline));
    after.workouts = [];
    after.benchmarks = [];
    expect(() => assertMigrationInvariants(baseline, after)).toThrow(
      /workout count changed.*benchmark count changed/s,
    );
  });

  it("passes for the real old_backup.json fixture run through the full migration chain", () => {
    const before = loadFixture("backup-2.1.json");
    const after = JSON.parse(JSON.stringify(before));
    runDataMigrations(after);
    expect(() => assertMigrationInvariants(before, after)).not.toThrow();
  });
});
