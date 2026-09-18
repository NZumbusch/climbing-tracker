import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Workout } from "../types";

// Mocked before importing the module under test, per vitest's hoisting
// convention - lets tests control `Capacitor.isNativePlatform()` and the
// `LocalNotifications` plugin without a real native runtime.
const isNativePlatform = vi.fn(() => true);
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => isNativePlatform() },
}));

const checkPermissions = vi.fn();
const requestPermissions = vi.fn();
const getPending = vi.fn();
const cancel = vi.fn();
const schedule = vi.fn();
vi.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: {
    checkPermissions: (...args: unknown[]) => checkPermissions(...args),
    requestPermissions: (...args: unknown[]) => requestPermissions(...args),
    getPending: (...args: unknown[]) => getPending(...args),
    cancel: (...args: unknown[]) => cancel(...args),
    schedule: (...args: unknown[]) => schedule(...args),
  },
}));

const { workoutReminderId, computeFatigueReminderTime, syncFatigueReminders } = await import("./fatigueReminder");
const { reminderId } = await import("./shared");

function makeWorkout(overrides: Partial<Workout>): Workout {
  return {
    id: "w1",
    status: "planned",
    date: null,
    weekId: "2026-W01", // Monday 2025-12-29
    loadFactor: 0,
    exercises: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  isNativePlatform.mockReturnValue(true);
  getPending.mockResolvedValue({ notifications: [] });
  checkPermissions.mockResolvedValue({ display: "granted" });
});

describe("workoutReminderId", () => {
  it("is deterministic for the same id", () => {
    expect(workoutReminderId("abc-123")).toBe(workoutReminderId("abc-123"));
  });

  it("differs for different ids (no trivial collisions on simple inputs)", () => {
    expect(workoutReminderId("abc-123")).not.toBe(workoutReminderId("abc-124"));
  });

  it("is always a non-negative 32-bit-safe integer", () => {
    for (const id of ["", "x", "a-very-long-uuid-like-string-1234567890"]) {
      const result = workoutReminderId(id);
      expect(Number.isInteger(result)).toBe(true);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(2147483647);
    }
  });
});

describe("computeFatigueReminderTime", () => {
  it("returns null when the workout has no weekId", () => {
    const workout = makeWorkout({ weekId: "" });
    expect(computeFatigueReminderTime(workout)).toBeNull();
  });

  it("combines weekId + dayOfWeek + startTime + duration + buffer", () => {
    const workout = makeWorkout({
      weekId: "2026-W01",
      dayOfWeek: "Monday",
      startTime: "18:00",
      exercises: [
        { id: "e1", typeId: "t1", prescribed: { duration: 40 } },
      ],
    });
    const result = computeFatigueReminderTime(workout);
    expect(result).not.toBeNull();
    // 18:00 start + 40 min duration + 20 min buffer = 18:60 -> 19:00
    expect(result!.getHours()).toBe(19);
    expect(result!.getMinutes()).toBe(0);
  });

  it("defaults to noon when startTime is missing", () => {
    const workout = makeWorkout({ weekId: "2026-W01", dayOfWeek: "Monday", startTime: undefined, exercises: [] });
    const result = computeFatigueReminderTime(workout);
    // No exercises -> ics.ts's calculateWorkoutDuration default of 60 min + 20 min buffer = 13:20
    expect(result!.getHours()).toBe(13);
    expect(result!.getMinutes()).toBe(20);
  });
});

describe("syncFatigueReminders", () => {
  it("no-ops on non-native platforms", async () => {
    isNativePlatform.mockReturnValue(false);
    await syncFatigueReminders([makeWorkout({})]);
    expect(checkPermissions).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });

  it("no-ops when permission isn't granted, without cancelling or scheduling", async () => {
    checkPermissions.mockResolvedValue({ display: "denied" });
    await syncFatigueReminders([makeWorkout({})]);
    expect(getPending).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });

  it("skips completed workouts and workouts whose reminder time has already passed", async () => {
    const past = makeWorkout({
      id: "past",
      status: "planned",
      weekId: "2020-W01",
      dayOfWeek: "Monday",
      startTime: "09:00",
    });
    const completed = makeWorkout({ id: "done", status: "completed" });
    await syncFatigueReminders([past, completed]);
    expect(schedule).not.toHaveBeenCalled();
  });

  it("cancels its own previously-pending notifications, then schedules one per future planned workout", async () => {
    const stalePendingId = workoutReminderId("stale-previous-sync");
    getPending.mockResolvedValue({ notifications: [{ id: stalePendingId }] });

    const farFuture = new Date();
    farFuture.setFullYear(farFuture.getFullYear() + 5);
    const weekId = `${farFuture.getFullYear()}-W01`;

    const upcoming = makeWorkout({
      id: "upcoming",
      status: "planned",
      weekId,
      dayOfWeek: "Monday",
      startTime: "08:00",
      notes: "Finger board session",
    });

    await syncFatigueReminders([upcoming]);

    expect(cancel).toHaveBeenCalledWith({ notifications: [{ id: stalePendingId }] });
    expect(schedule).toHaveBeenCalledTimes(1);
    const scheduled = schedule.mock.calls[0][0].notifications;
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]).toMatchObject({
      id: workoutReminderId("upcoming"),
      title: expect.any(String),
      body: expect.stringContaining("Finger board session"),
      isExactNotification: false,
    });
    expect(scheduled[0].schedule.at).toBeInstanceOf(Date);
  });

  it("never cancels a pending notification belonging to another reminder type (the regression this refactor exists to prevent)", async () => {
    const dailyMetricsPendingId = reminderId("dailyMetrics", "daily-metrics-reminder");
    getPending.mockResolvedValue({ notifications: [{ id: dailyMetricsPendingId }] });

    const farFuture = new Date();
    farFuture.setFullYear(farFuture.getFullYear() + 5);
    const weekId = `${farFuture.getFullYear()}-W01`;
    const upcoming = makeWorkout({
      id: "upcoming",
      status: "planned",
      weekId,
      dayOfWeek: "Monday",
      startTime: "08:00",
    });

    await syncFatigueReminders([upcoming]);

    // The pending daily-metrics reminder must never appear in a fatigue sync's cancel call.
    expect(cancel).not.toHaveBeenCalled();
    expect(schedule).toHaveBeenCalledTimes(1);
  });
});
