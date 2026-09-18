import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DailyMetricEntry } from "../types";

const isNativePlatform = vi.fn(() => true);
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => isNativePlatform() },
}));

const checkPermissions = vi.fn();
const getPending = vi.fn();
const cancel = vi.fn();
const schedule = vi.fn();
vi.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: {
    checkPermissions: (...args: unknown[]) => checkPermissions(...args),
    requestPermissions: vi.fn(),
    getPending: (...args: unknown[]) => getPending(...args),
    cancel: (...args: unknown[]) => cancel(...args),
    schedule: (...args: unknown[]) => schedule(...args),
  },
}));

const {
  dailyMetricsReminderId,
  isDailyMetricsEntryMissing,
  computeDailyMetricsReminderTime,
  syncDailyMetricsReminder,
} = await import("./dailyMetricsReminder");
const { reminderId } = await import("./shared");

function metric(metricId: string, date: string): DailyMetricEntry {
  return { id: `${metricId}-${date}`, metricId, date, value: 1 };
}

beforeEach(() => {
  vi.clearAllMocks();
  isNativePlatform.mockReturnValue(true);
  getPending.mockResolvedValue({ notifications: [] });
  checkPermissions.mockResolvedValue({ display: "granted" });
});

describe("dailyMetricsReminderId", () => {
  it("is a fixed, stable value - one recurring reminder, not per-workout", () => {
    expect(dailyMetricsReminderId()).toBe(dailyMetricsReminderId());
  });

  it("is tagged as the 'dailyMetrics' type, distinct from a fatigue id", () => {
    expect(dailyMetricsReminderId()).not.toBe(reminderId("fatigue", "daily-metrics-reminder"));
  });
});

describe("isDailyMetricsEntryMissing", () => {
  it("is true when none of sleep/HRV/RHR are logged for today", () => {
    expect(isDailyMetricsEntryMissing([], "2026-09-18")).toBe(true);
  });

  it("is true when only some of the three are logged", () => {
    const entries = [metric("sleep-score", "2026-09-18"), metric("hrv", "2026-09-18")];
    expect(isDailyMetricsEntryMissing(entries, "2026-09-18")).toBe(true);
  });

  it("is false once all three are logged for today", () => {
    const entries = [
      metric("sleep-score", "2026-09-18"),
      metric("hrv", "2026-09-18"),
      metric("rhr", "2026-09-18"),
    ];
    expect(isDailyMetricsEntryMissing(entries, "2026-09-18")).toBe(false);
  });

  it("ignores entries logged on a different day", () => {
    const entries = [
      metric("sleep-score", "2026-09-17"),
      metric("hrv", "2026-09-17"),
      metric("rhr", "2026-09-17"),
    ];
    expect(isDailyMetricsEntryMissing(entries, "2026-09-18")).toBe(true);
  });
});

describe("computeDailyMetricsReminderTime", () => {
  it("resolves an HH:mm time against asOf's calendar day, in local time", () => {
    const asOf = new Date(2026, 8, 18, 10, 0, 0); // Sep 18, 10:00 local
    const result = computeDailyMetricsReminderTime(asOf, "20:00");
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(8);
    expect(result.getDate()).toBe(18);
    expect(result.getHours()).toBe(20);
    expect(result.getMinutes()).toBe(0);
  });
});

describe("syncDailyMetricsReminder", () => {
  const morning = new Date(2026, 8, 18, 9, 0, 0); // 09:00 local, well before a 20:00 reminder

  it("no-ops on non-native platforms", async () => {
    isNativePlatform.mockReturnValue(false);
    await syncDailyMetricsReminder([], "20:00", morning);
    expect(checkPermissions).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });

  it("no-ops when permission isn't granted, without cancelling or scheduling", async () => {
    checkPermissions.mockResolvedValue({ display: "denied" });
    await syncDailyMetricsReminder([], "20:00", morning);
    expect(getPending).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });

  it("cancels any previously-pending reminder, then does not reschedule once today's entries are all logged", async () => {
    getPending.mockResolvedValue({ notifications: [{ id: dailyMetricsReminderId() }] });
    const todayIso = "2026-09-18";
    const entries = [metric("sleep-score", todayIso), metric("hrv", todayIso), metric("rhr", todayIso)];

    await syncDailyMetricsReminder(entries, "20:00", morning);

    expect(cancel).toHaveBeenCalledWith({ notifications: [{ id: dailyMetricsReminderId() }] });
    expect(schedule).not.toHaveBeenCalled();
  });

  it("schedules a reminder for today's configured time when an entry is still missing and that time hasn't passed", async () => {
    await syncDailyMetricsReminder([], "20:00", morning);

    expect(schedule).toHaveBeenCalledTimes(1);
    const scheduled = schedule.mock.calls[0][0].notifications;
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]).toMatchObject({ id: dailyMetricsReminderId(), isExactNotification: false });
    expect(scheduled[0].schedule.at.getHours()).toBe(20);
  });

  it("does not schedule when the configured time has already passed today", async () => {
    const lateNight = new Date(2026, 8, 18, 23, 0, 0); // 23:00, past a 20:00 reminder
    await syncDailyMetricsReminder([], "20:00", lateNight);
    expect(schedule).not.toHaveBeenCalled();
  });

  it("never cancels a pending notification belonging to another reminder type (the regression this refactor exists to prevent)", async () => {
    const fatiguePendingId = reminderId("fatigue", "some-workout");
    getPending.mockResolvedValue({ notifications: [{ id: fatiguePendingId }] });

    await syncDailyMetricsReminder([], "20:00", morning);

    expect(cancel).not.toHaveBeenCalled();
    expect(schedule).toHaveBeenCalledTimes(1);
  });
});
