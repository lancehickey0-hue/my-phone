import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Default wake phrases per device type
const DEFAULT_WAKE_PHRASES: Record<string, string> = {
  phone: "Hey, My-Phone, where are you?",
  tablet: "Hey, My-Tablet, where are you?",
  laptop: "Hey, My-Laptop, where are you?",
  earbuds: "Hey, My-Earbuds, where are you?",
  watch: "Hey, My-Watch, where are you?",
};

// Shared device validator for return types
const deviceValidator = v.object({
  _id: v.id("devices"),
  _creationTime: v.number(),
  userId: v.id("users"),
  name: v.string(),
  type: v.union(
    v.literal("phone"),
    v.literal("tablet"),
    v.literal("laptop"),
    v.literal("earbuds"),
    v.literal("watch"),
  ),
  status: v.union(
    v.literal("connected"),
    v.literal("disconnected"),
    v.literal("alarm"),
    v.literal("locked"),
  ),
  wakePhrase: v.string(),
  customWakePhrase: v.optional(v.string()),
  voiceEnrolled: v.boolean(),
  lastLatitude: v.optional(v.number()),
  lastLongitude: v.optional(v.number()),
  lastLocationName: v.optional(v.string()),
  lastSeenAt: v.optional(v.number()),
  batteryLevel: v.optional(v.number()),
  isAlarmActive: v.boolean(),
  isLocked: v.boolean(),
  expoPushToken: v.optional(v.string()),
  physicalDeviceId: v.optional(v.string()),
});

// List all devices for the current user
export const list = query({
  args: {},
  returns: v.array(deviceValidator),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("devices")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
  },
});

// Get a single device
export const get = query({
  args: { deviceId: v.id("devices") },
  returns: v.union(deviceValidator, v.null()),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const device = await ctx.db.get(args.deviceId);
    if (!device || device.userId !== userId) return null;
    return device;
  },
});

// Add a new device
export const add = mutation({
  args: {
    name: v.string(),
    type: v.union(
      v.literal("phone"),
      v.literal("tablet"),
      v.literal("laptop"),
      v.literal("earbuds"),
      v.literal("watch"),
    ),
  },
  returns: v.id("devices"),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Check device limit from profile
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    
    const devices = await ctx.db
      .query("devices")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    const maxDevices = profile?.maxDevices ?? 5;
    if (devices.length >= maxDevices) {
      throw new Error(`Device limit reached (${maxDevices}). Upgrade your plan to add more devices.`);
    }

    // Auto-assign default wake phrase based on device type
    const wakePhrase = DEFAULT_WAKE_PHRASES[args.type] ?? "Hey, My-Phone, where are you?";

    const deviceId = await ctx.db.insert("devices", {
      userId,
      name: args.name,
      type: args.type,
      status: "disconnected",
      wakePhrase,
      voiceEnrolled: false,
      isAlarmActive: false,
      isLocked: false,
      lastSeenAt: Date.now(),
    });

    // Log activity
    await ctx.db.insert("activityLog", {
      userId,
      deviceId,
      action: "device_added",
      details: `Added ${args.type}: ${args.name}`,
      timestamp: Date.now(),
    });

    return deviceId;
  },
});

// Update device name
export const update = mutation({
  args: {
    deviceId: v.id("devices"),
    name: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const device = await ctx.db.get(args.deviceId);
    if (!device || device.userId !== userId) throw new Error("Device not found");

    await ctx.db.patch(args.deviceId, { name: args.name });
    return null;
  },
});

// Remove a device
export const remove = mutation({
  args: { deviceId: v.id("devices") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const device = await ctx.db.get(args.deviceId);
    if (!device || device.userId !== userId) throw new Error("Device not found");

    await ctx.db.insert("activityLog", {
      userId,
      deviceId: args.deviceId,
      action: "device_removed",
      details: `Removed ${device.type}: ${device.name}`,
      timestamp: Date.now(),
    });

    await ctx.db.delete(args.deviceId);
    return null;
  },
});

// Trigger alarm on a device
export const triggerAlarm = mutation({
  args: { deviceId: v.id("devices") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const device = await ctx.db.get(args.deviceId);
    if (!device || device.userId !== userId) throw new Error("Device not found");

    await ctx.db.patch(args.deviceId, {
      isAlarmActive: true,
      isLocked: true,
      status: "alarm",
    });

    await ctx.db.insert("activityLog", {
      userId,
      deviceId: args.deviceId,
      action: "alarm_triggered",
      details: `Alarm triggered on ${device.name}`,
      timestamp: Date.now(),
    });

    return null;
  },
});

// Stop alarm and unlock
export const stopAlarm = mutation({
  args: { deviceId: v.id("devices") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const device = await ctx.db.get(args.deviceId);
    if (!device || device.userId !== userId) throw new Error("Device not found");

    await ctx.db.patch(args.deviceId, {
      isAlarmActive: false,
      isLocked: false,
      status: "connected",
    });

    await ctx.db.insert("activityLog", {
      userId,
      deviceId: args.deviceId,
      action: "alarm_stopped",
      details: `Alarm stopped on ${device.name}`,
      timestamp: Date.now(),
    });

    return null;
  },
});

// Lock a device remotely
export const lockDevice = mutation({
  args: { deviceId: v.id("devices") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const device = await ctx.db.get(args.deviceId);
    if (!device || device.userId !== userId) throw new Error("Device not found");

    await ctx.db.patch(args.deviceId, {
      isLocked: true,
      status: "locked",
    });

    await ctx.db.insert("activityLog", {
      userId,
      deviceId: args.deviceId,
      action: "device_locked",
      details: `Remotely locked ${device.name}`,
      timestamp: Date.now(),
    });

    return null;
  },
});

// Unlock a device
export const unlockDevice = mutation({
  args: { deviceId: v.id("devices") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const device = await ctx.db.get(args.deviceId);
    if (!device || device.userId !== userId) throw new Error("Device not found");

    await ctx.db.patch(args.deviceId, {
      isLocked: false,
      status: "connected",
    });

    await ctx.db.insert("activityLog", {
      userId,
      deviceId: args.deviceId,
      action: "device_unlocked",
      details: `Unlocked ${device.name}`,
      timestamp: Date.now(),
    });

    return null;
  },
});

// Simulate updating device location (for demo/testing)
export const updateLocation = mutation({
  args: {
    deviceId: v.id("devices"),
    latitude: v.number(),
    longitude: v.number(),
    locationName: v.optional(v.string()),
    batteryLevel: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const device = await ctx.db.get(args.deviceId);
    if (!device || device.userId !== userId) throw new Error("Device not found");

    await ctx.db.patch(args.deviceId, {
      lastLatitude: args.latitude,
      lastLongitude: args.longitude,
      lastLocationName: args.locationName,
      lastSeenAt: Date.now(),
      batteryLevel: args.batteryLevel,
      status: "connected",
    });

    return null;
  },
});

export const registerPhysicalDevice = mutation({
  args: {
    deviceId: v.id("devices"),
    physicalDeviceId: v.string(),
    expoPushToken: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const device = await ctx.db.get(args.deviceId);
    if (!device || device.userId !== userId) throw new Error("Device not found");
    await ctx.db.patch(args.deviceId, {
      physicalDeviceId: args.physicalDeviceId,
      expoPushToken: args.expoPushToken,
      status: "connected",
      lastSeenAt: Date.now(),
    });
    return null;
  },
});
