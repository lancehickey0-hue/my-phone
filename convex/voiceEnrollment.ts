import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Default wake phrases per device type
export const DEFAULT_WAKE_PHRASES: Record<string, string> = {
  phone: "Hey, My-Phone, where are you?",
  tablet: "Hey, My-Tablet, where are you?",
  laptop: "Hey, My-Laptop, where are you?",
  earbuds: "Hey, My-Earbuds, where are you?",
  watch: "Hey, My-Watch, where are you?",
};

// Get all voice enrollments for the current user (across all devices)
export const listEnrollments = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("voiceEnrollment"),
      _creationTime: v.number(),
      userId: v.id("users"),
      deviceId: v.id("devices"),
      isEnrolled: v.boolean(),
      enrolledAt: v.optional(v.number()),
      sampleCount: v.number(),
      wakePhrase: v.string(),
      sampleVectors: v.optional(v.array(v.array(v.number()))),
      referenceVector: v.optional(v.array(v.number())),
    }),
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("voiceEnrollment")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
  },
});

// Get voice enrollment for a specific device
export const getDeviceEnrollment = query({
  args: { deviceId: v.id("devices") },
  returns: v.union(
    v.object({
      _id: v.id("voiceEnrollment"),
      _creationTime: v.number(),
      userId: v.id("users"),
      deviceId: v.id("devices"),
      isEnrolled: v.boolean(),
      enrolledAt: v.optional(v.number()),
      sampleCount: v.number(),
      wakePhrase: v.string(),
      sampleVectors: v.optional(v.array(v.array(v.number()))),
      referenceVector: v.optional(v.array(v.number())),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db
      .query("voiceEnrollment")
      .withIndex("by_userId_deviceId", (q) =>
        q.eq("userId", userId).eq("deviceId", args.deviceId),
      )
      .unique();
  },
});

// Start voice enrollment for a specific device
export const startEnrollment = mutation({
  args: { deviceId: v.id("devices") },
  returns: v.id("voiceEnrollment"),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const device = await ctx.db.get(args.deviceId);
    if (!device || device.userId !== userId) throw new Error("Device not found");

    // Use custom wake phrase if set, otherwise default for device type
    const wakePhrase =
      device.customWakePhrase || device.wakePhrase;

    // Check if enrollment already exists for this device
    const existing = await ctx.db
      .query("voiceEnrollment")
      .withIndex("by_userId_deviceId", (q) =>
        q.eq("userId", userId).eq("deviceId", args.deviceId),
      )
      .unique();

    if (existing) {
      // Reset for re-enrollment
      await ctx.db.patch(existing._id, {
        isEnrolled: false,
        sampleCount: 0,
        wakePhrase,
        sampleVectors: [],
        referenceVector: undefined,
      });
      return existing._id;
    }

    return await ctx.db.insert("voiceEnrollment", {
      userId,
      deviceId: args.deviceId,
      isEnrolled: false,
      sampleCount: 0,
      wakePhrase,
      sampleVectors: [],
    });
  },
});

const SAMPLES_REQUIRED = 5;

// Element-wise average of several equal-length vectors -- combines the 5
// enrollment samples into one reference voiceprint. Averaging smooths out
// per-utterance noise/variation rather than relying on any single sample.
function averageVectors(vectors: number[][]): number[] {
  const dim = vectors[0].length;
  const sums = new Array(dim).fill(0);
  for (const vec of vectors) {
    for (let i = 0; i < dim; i++) sums[i] += vec[i];
  }
  return sums.map((s) => s / vectors.length);
}

// Record a voice sample for a specific device. `vector` is the real x-vector
// (voice fingerprint) extracted natively by Vosk's speaker-identification
// model for this one utterance -- see WakeWordModule.recordVoiceSample().
export const recordSample = mutation({
  args: { enrollmentId: v.id("voiceEnrollment"), vector: v.array(v.number()) },
  returns: v.object({ sampleCount: v.number(), isComplete: v.boolean() }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const enrollment = await ctx.db.get(args.enrollmentId);
    if (!enrollment || enrollment.userId !== userId) {
      throw new Error("Enrollment not found");
    }

    const updatedVectors = [...(enrollment.sampleVectors ?? []), args.vector];
    const newCount = updatedVectors.length;
    const isComplete = newCount >= SAMPLES_REQUIRED;
    const referenceVector = isComplete ? averageVectors(updatedVectors) : undefined;

    await ctx.db.patch(args.enrollmentId, {
      sampleCount: newCount,
      sampleVectors: updatedVectors,
      isEnrolled: isComplete,
      enrolledAt: isComplete ? Date.now() : undefined,
      referenceVector,
    });

    // Mark device as voice-enrolled if complete
    if (isComplete) {
      await ctx.db.patch(enrollment.deviceId, {
        voiceEnrolled: true,
      });

      const device = await ctx.db.get(enrollment.deviceId);
      await ctx.db.insert("activityLog", {
        userId,
        deviceId: enrollment.deviceId,
        action: "voice_enrolled",
        details: `Voice training completed for ${device?.name ?? "device"} — "${enrollment.wakePhrase}"`,
        timestamp: Date.now(),
      });
    }

    return { sampleCount: newCount, isComplete };
  },
});

// Voice-activate a specific device (called when wake phrase is detected)
export const voiceActivate = mutation({
  args: { deviceId: v.id("devices") },
  returns: v.object({ activated: v.boolean(), deviceName: v.string() }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const device = await ctx.db.get(args.deviceId);
    if (!device || device.userId !== userId) throw new Error("Device not found");

    // Check voice enrollment for this specific device
    const enrollment = await ctx.db
      .query("voiceEnrollment")
      .withIndex("by_userId_deviceId", (q) =>
        q.eq("userId", userId).eq("deviceId", args.deviceId),
      )
      .unique();

    if (!enrollment?.isEnrolled) {
      throw new Error(
        `Voice training not complete for ${device.name}. Please train the wake phrase first.`,
      );
    }

    // Trigger alarm + lock on THIS device only
    if (!device.isAlarmActive) {
      await ctx.db.patch(device._id, {
        isAlarmActive: true,
        isLocked: true,
        status: "alarm",
      });

      await ctx.db.insert("activityLog", {
        userId,
        deviceId: device._id,
        action: "voice_locate",
        details: `Voice-activated locator on ${device.name} — "${enrollment.wakePhrase}"`,
        timestamp: Date.now(),
      });

      return { activated: true, deviceName: device.name };
    }

    return { activated: false, deviceName: device.name };
  },
});

// Update the wake phrase for a specific device (customization)
export const updateWakePhrase = mutation({
  args: {
    deviceId: v.id("devices"),
    customWakePhrase: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const device = await ctx.db.get(args.deviceId);
    if (!device || device.userId !== userId) throw new Error("Device not found");

    // Update the custom wake phrase on the device
    await ctx.db.patch(args.deviceId, {
      customWakePhrase: args.customWakePhrase,
    });

    // Reset voice enrollment since the phrase changed — needs re-training
    const enrollment = await ctx.db
      .query("voiceEnrollment")
      .withIndex("by_userId_deviceId", (q) =>
        q.eq("userId", userId).eq("deviceId", args.deviceId),
      )
      .unique();

    if (enrollment) {
      await ctx.db.patch(enrollment._id, {
        isEnrolled: false,
        sampleCount: 0,
        wakePhrase: args.customWakePhrase,
      });
      await ctx.db.patch(args.deviceId, { voiceEnrolled: false });
    }

    await ctx.db.insert("activityLog", {
      userId,
      deviceId: args.deviceId,
      action: "wake_phrase_updated",
      details: `Wake phrase changed for ${device.name} to "${args.customWakePhrase}"`,
      timestamp: Date.now(),
    });

    return null;
  },
});

// Reset wake phrase back to default for device type
export const resetWakePhrase = mutation({
  args: { deviceId: v.id("devices") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const device = await ctx.db.get(args.deviceId);
    if (!device || device.userId !== userId) throw new Error("Device not found");

    const defaultPhrase = DEFAULT_WAKE_PHRASES[device.type] ?? "Hey, My-Phone, where are you?";

    await ctx.db.patch(args.deviceId, {
      customWakePhrase: undefined,
      wakePhrase: defaultPhrase,
    });

    // Reset enrollment — needs re-training with the default phrase
    const enrollment = await ctx.db
      .query("voiceEnrollment")
      .withIndex("by_userId_deviceId", (q) =>
        q.eq("userId", userId).eq("deviceId", args.deviceId),
      )
      .unique();

    if (enrollment) {
      await ctx.db.patch(enrollment._id, {
        isEnrolled: false,
        sampleCount: 0,
        wakePhrase: defaultPhrase,
      });
      await ctx.db.patch(args.deviceId, { voiceEnrolled: false });
    }

    return null;
  },
});
