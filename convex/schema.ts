import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const schema = defineSchema({
  ...authTables,

  // Devices tracked by users
  devices: defineTable({
    userId: v.id("users"),
    name: v.string(), // e.g. "My iPhone 15", "Work Laptop"
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
    // Per-device wake phrase (auto-set by type, user can customize)
    wakePhrase: v.string(), // e.g. "Hey, My-Phone, where are you?"
    customWakePhrase: v.optional(v.string()), // user override — if set, replaces default
    voiceEnrolled: v.boolean(), // whether voice training is complete for this device
    lastLatitude: v.optional(v.number()),
    lastLongitude: v.optional(v.number()),
    lastLocationName: v.optional(v.string()),
    lastSeenAt: v.optional(v.number()),
    batteryLevel: v.optional(v.number()),
    isAlarmActive: v.boolean(),
    isLocked: v.boolean(),
    expoPushToken: v.optional(v.string()),
    physicalDeviceId: v.optional(v.string()),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_type", ["userId", "type"])
    .index("by_physicalDeviceId", ["physicalDeviceId"]),

  // User profiles with roles
  profiles: defineTable({
    userId: v.id("users"),
    role: v.union(
      v.literal("owner"),
      v.literal("admin"),
      v.literal("user"),
    ),
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    subscriptionStatus: v.union(
      v.literal("trial"),
      v.literal("active"),
      v.literal("expired"),
      v.literal("cancelled"),
    ),
    trialEndsAt: v.optional(v.number()),
    maxDevices: v.number(),
    biometricSetupComplete: v.optional(v.boolean()),
    // Stripe billing fields
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    stripePriceId: v.optional(v.string()),
    currentPeriodEnd: v.optional(v.number()),
    paymentMethod: v.optional(v.union(
      v.literal("stripe"),
      v.literal("paypal"),
    )),
  })
    .index("by_userId", ["userId"])
    .index("by_role", ["role"])
    .index("by_stripeCustomerId", ["stripeCustomerId"]),

  // Voice enrollment — now PER DEVICE, not per user
  voiceEnrollment: defineTable({
    userId: v.id("users"),
    deviceId: v.id("devices"),
    isEnrolled: v.boolean(),
    enrolledAt: v.optional(v.number()),
    sampleCount: v.number(), // 3 samples required
    wakePhrase: v.string(), // the phrase trained for this specific device
  })
    .index("by_userId", ["userId"])
    .index("by_deviceId", ["deviceId"])
    .index("by_userId_deviceId", ["userId", "deviceId"]),

  // Biometric credentials (WebAuthn / Face ID / Fingerprint)
  biometricCredentials: defineTable({
    userId: v.id("users"),
    credentialId: v.string(),
    credentialLabel: v.string(),
    registeredAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_credentialId", ["credentialId"]),

  // Activity log
  activityLog: defineTable({
    userId: v.id("users"),
    deviceId: v.optional(v.id("devices")),
    action: v.string(),
    details: v.optional(v.string()),
    timestamp: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_deviceId", ["deviceId"]),

 // Diagnostic logs from native code (wake word debugging, etc.)
   debugLogs: defineTable({
     source: v.string(), // e.g. "WakeWordService"
     message: v.string(),
     level: v.optional(v.string()), // "info" | "warn" | "error" | "debug" — defaults to "info" if omitted
     timestamp: v.number(),
   })
     .index("by_timestamp", ["timestamp"]),
});

export default schema;
