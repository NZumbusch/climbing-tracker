import { describe, it, expect, vi, beforeEach } from "vitest";

const isNativePlatform = vi.fn(() => true);
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => isNativePlatform() },
}));

const checkPermissions = vi.fn();
const requestPermissions = vi.fn();
const getPending = vi.fn();
const cancel = vi.fn();
vi.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: {
    checkPermissions: (...args: unknown[]) => checkPermissions(...args),
    requestPermissions: (...args: unknown[]) => requestPermissions(...args),
    getPending: (...args: unknown[]) => getPending(...args),
    cancel: (...args: unknown[]) => cancel(...args),
  },
}));

const {
  reminderId,
  reminderTypeOf,
  checkNotificationPermission,
  requestNotificationPermission,
  cancelRemindersOfType,
  cancelAllReminders,
} = await import("./shared");

beforeEach(() => {
  vi.clearAllMocks();
  isNativePlatform.mockReturnValue(true);
  getPending.mockResolvedValue({ notifications: [] });
  checkPermissions.mockResolvedValue({ display: "granted" });
});

describe("reminderId / reminderTypeOf", () => {
  it("is deterministic for the same type+key", () => {
    expect(reminderId("fatigue", "abc-123")).toBe(reminderId("fatigue", "abc-123"));
  });

  it("differs for different keys within the same type", () => {
    expect(reminderId("fatigue", "abc-123")).not.toBe(reminderId("fatigue", "abc-124"));
  });

  it("never collides across types, even for the same key", () => {
    expect(reminderId("fatigue", "same-key")).not.toBe(reminderId("dailyMetrics", "same-key"));
  });

  it("is always a non-negative 32-bit-safe integer", () => {
    for (const id of [reminderId("fatigue", ""), reminderId("dailyMetrics", "x")]) {
      expect(Number.isInteger(id)).toBe(true);
      expect(id).toBeGreaterThanOrEqual(0);
      expect(id).toBeLessThanOrEqual(2147483647);
    }
  });

  it("reminderTypeOf recovers the type an id was built with", () => {
    expect(reminderTypeOf(reminderId("fatigue", "w1"))).toBe("fatigue");
    expect(reminderTypeOf(reminderId("dailyMetrics", "x"))).toBe("dailyMetrics");
  });

  it("reminderTypeOf returns undefined for an id outside any known type's range", () => {
    expect(reminderTypeOf(2147483646)).toBeUndefined();
  });
});

describe("checkNotificationPermission / requestNotificationPermission", () => {
  it("report 'denied' on non-native platforms without touching the plugin", async () => {
    isNativePlatform.mockReturnValue(false);
    await expect(checkNotificationPermission()).resolves.toBe("denied");
    await expect(requestNotificationPermission()).resolves.toBe("denied");
    expect(checkPermissions).not.toHaveBeenCalled();
    expect(requestPermissions).not.toHaveBeenCalled();
  });

  it("delegate to the plugin on native platforms", async () => {
    checkPermissions.mockResolvedValue({ display: "granted" });
    requestPermissions.mockResolvedValue({ display: "denied" });
    await expect(checkNotificationPermission()).resolves.toBe("granted");
    await expect(requestNotificationPermission()).resolves.toBe("denied");
  });
});

describe("cancelRemindersOfType", () => {
  it("no-ops on non-native platforms", async () => {
    isNativePlatform.mockReturnValue(false);
    await cancelRemindersOfType("fatigue");
    expect(getPending).not.toHaveBeenCalled();
  });

  it("no-ops when nothing of that type is pending", async () => {
    getPending.mockResolvedValue({ notifications: [] });
    await cancelRemindersOfType("fatigue");
    expect(cancel).not.toHaveBeenCalled();
  });

  it("cancels only pending notifications owned by the given type, leaving other types alone", async () => {
    const fatigueOnlyId = reminderId("fatigue", "some-workout");
    const dailyId = reminderId("dailyMetrics", "daily-metrics-reminder");
    getPending.mockResolvedValue({ notifications: [{ id: fatigueOnlyId }, { id: dailyId }] });

    await cancelRemindersOfType("fatigue");

    expect(cancel).toHaveBeenCalledWith({ notifications: [{ id: fatigueOnlyId }] });
  });
});

describe("cancelAllReminders", () => {
  it("no-ops on non-native platforms", async () => {
    isNativePlatform.mockReturnValue(false);
    await cancelAllReminders();
    expect(getPending).not.toHaveBeenCalled();
  });

  it("no-ops when nothing is pending", async () => {
    getPending.mockResolvedValue({ notifications: [] });
    await cancelAllReminders();
    expect(cancel).not.toHaveBeenCalled();
  });

  it("cancels every pending notification regardless of type", async () => {
    const fatigueId = reminderId("fatigue", "some-workout");
    const dailyId = reminderId("dailyMetrics", "daily-metrics-reminder");
    getPending.mockResolvedValue({ notifications: [{ id: fatigueId }, { id: dailyId }] });

    await cancelAllReminders();

    expect(cancel).toHaveBeenCalledWith({ notifications: [{ id: fatigueId }, { id: dailyId }] });
  });
});
