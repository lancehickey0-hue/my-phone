import { getAuthUserId } from "@convex-dev/auth/server";
import { internalQuery, mutation, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

// ── Device identity & headless-call authentication ─────────────────────────
//
// Each install generates a random secret once (src/lib/deviceIdentity.ts)
// and hands it to the server when it links itself to a device record. The
// server keeps only its SHA-256 hash in `deviceSecrets`. Every headless HTTP
// call the device makes (background location, native wake-word alarm, lock
// poll) must present { physicalDeviceId, deviceSecret }; knowing a
// physicalDeviceId alone is no longer enough to spoof or control a device.

const DEFAULT_WAKE_PHRASE = "Hey, My-Phone, where are you?";
const MIN_SECRET_LENGTH = 32;

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// One install = one active secret. Replaces any secret previously tied to
// this device record OR to this physical install (e.g. the phone was signed
// into a different account before), so stale records stop accepting calls.
export async function setDeviceSecret(
  ctx: MutationCtx,
  deviceId: Id<"devices">,
  physicalDeviceId: string,
  deviceSecret: string,
): Promise<void> {
  if (deviceSecret.length < MIN_SECRET_LENGTH) {
    throw new Error("Invalid device secret");
  }

  const byDevice = await ctx.db
    .query("deviceSecrets")
    .withIndex("by_deviceId", (q) => q.eq("deviceId", deviceId))
    .take(20);
  const byInstall = await ctx.db
    .query("deviceSecrets")
    .withIndex("by_physicalDeviceId", (q) => q.eq("physicalDeviceId", physicalDeviceId))
    .take(20);
  const stale = new Set([...byDevice, ...byInstall].map((row) => row._id));
  for (const id of stale) {
    await ctx.db.delete(id);
  }

  await ctx.db.insert("deviceSecrets", {
    deviceId,
    physicalDeviceId,
    secretHash: await sha256Hex(deviceSecret),
    createdAt: Date.now(),
  });
}

export async function deleteDeviceSecrets(ctx: MutationCtx, deviceId: Id<"devices">) {
  const rows = await ctx.db
    .query("deviceSecrets")
    .withIndex("by_deviceId", (q) => q.eq("deviceId", deviceId))
    .take(20);
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
}

// Used by http.ts. Returns the device only if both the install ID and the
// secret match an active registration.
export const resolveDevice = internalQuery({
  args: { physicalDeviceId: v.string(), secretHash: v.string() },
  returns: v.union(v.id("devices"), v.null()),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("deviceSecrets")
      .withIndex("by_physicalDeviceId", (q) => q.eq("physicalDeviceId", args.physicalDeviceId))
      .take(20);
    const match = rows.find((row) => row.secretHash === args.secretHash);
    if (!match) return null;
    const device = await ctx.db.get(match.deviceId);
    return device ? device._id : null;
  },
});

// Called automatically on every sign-in (app/_layout.tsx). Links this
// install to the signed-in user's device record so tracking, heartbeat,
// remote lock and the wake word all work without the manual "Mine" tap.
//
// Resolution order:
//   1. A device of this user already linked to this install → reuse it.
//   2. Exactly one phone of this user not linked to any install → link it.
//   3. Otherwise create a new phone record (if under the plan's limit).
// Returns null only when the device limit is reached; the user can still
// link manually from the Devices tab in that case.
export const claimThisDevice = mutation({
  args: {
    physicalDeviceId: v.string(),
    deviceSecret: v.string(),
    defaultName: v.string(),
  },
  returns: v.union(v.id("devices"), v.null()),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    if (!args.physicalDeviceId) throw new Error("Missing physicalDeviceId");

    const devices = await ctx.db
      .query("devices")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(100);

    let device = devices.find((d) => d.physicalDeviceId === args.physicalDeviceId);
    let action: "relinked" | "linked" | "created" = "relinked";

    if (!device) {
      const unlinkedPhones = devices.filter((d) => d.type === "phone" && !d.physicalDeviceId);
      if (unlinkedPhones.length === 1) {
        device = unlinkedPhones[0];
        action = "linked";
      }
    }

    if (!device) {
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .unique();
      const maxDevices = profile?.maxDevices ?? 5;
      if (devices.length >= maxDevices) return null;

      const newId = await ctx.db.insert("devices", {
        userId,
        name: args.defaultName.trim() || "My Phone",
        type: "phone",
        status: "connected",
        wakePhrase: DEFAULT_WAKE_PHRASE,
        voiceEnrolled: false,
        isAlarmActive: false,
        isLocked: false,
        physicalDeviceId: args.physicalDeviceId,
        lastSeenAt: Date.now(),
      });
      device = (await ctx.db.get(newId))!;
      action = "created";
    }

    await ctx.db.patch(device._id, {
      physicalDeviceId: args.physicalDeviceId,
      lastSeenAt: Date.now(),
      // Don't clobber an active alarm/lock state on re-launch.
      ...(device.isAlarmActive || device.isLocked ? {} : { status: "connected" as const }),
    });

    await setDeviceSecret(ctx, device._id, args.physicalDeviceId, args.deviceSecret);

    if (action !== "relinked") {
      await ctx.db.insert("activityLog", {
        userId,
        deviceId: device._id,
        action: action === "created" ? "device_added" : "device_linked",
        details:
          action === "created"
            ? `Added phone: ${device.name} (this device)`
            : `Linked ${device.name} to this device`,
        timestamp: Date.now(),
      });
    }

    return device._id;
  },
});
