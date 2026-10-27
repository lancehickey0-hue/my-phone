import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { auth } from "./auth";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { sha256Hex } from "./deviceAuth";

const http = httpRouter();
auth.addHttpRoutes(http);

// Every device-originated call must carry { physicalDeviceId, deviceSecret }.
// The secret is issued when the install links itself (deviceAuth.claimThisDevice)
// and only its hash is stored server-side. Returns null when either is missing
// or they don't match an active registration.
async function authenticateDevice(
  ctx: ActionCtx,
  body: any,
  source: string,
): Promise<Id<"devices"> | null> {
  const physicalDeviceId = String(body?.physicalDeviceId ?? "");
  const deviceSecret = String(body?.deviceSecret ?? "");
  if (!physicalDeviceId || !deviceSecret) return null;
  const deviceId = await ctx.runQuery(internal.deviceAuth.resolveDevice, {
    physicalDeviceId,
    secretHash: await sha256Hex(deviceSecret),
  });
  if (!deviceId) {
    await ctx.runMutation(internal.debugLogs.add, {
      source,
      message: "rejected device call: unknown install or bad secret, physicalDeviceId=" + physicalDeviceId,
      level: "warn",
    });
  }
  return deviceId;
}

const unauthorized = () => new Response(null, { status: 401 });

http.route({
  path: "/logDebug",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      await ctx.runMutation(internal.debugLogs.add, {
        source: String(body.source ?? "unknown"),
        message: String(body.message ?? ""),
        level: body.level ? String(body.level) : undefined,
      });
    } catch (e) {
      // Never let a malformed debug log crash the endpoint
    }
    return new Response(null, { status: 200 });
  }),
});

http.route({
  path: "/triggerAlarmDevice",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const deviceId = await authenticateDevice(ctx, body, "triggerAlarmDevice");
      if (!deviceId) return unauthorized();
      await ctx.runMutation(internal.devices.triggerAlarmByDeviceId, { deviceId });
    } catch (e) {
      // Never let a malformed request crash the endpoint
    }
    return new Response(null, { status: 200 });
  }),
});

http.route({
  path: "/deviceLockState",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const json = (obj: unknown) =>
      new Response(JSON.stringify(obj), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    try {
      const body = await request.json();
      const deviceId = await authenticateDevice(ctx, body, "deviceLockState");
      if (!deviceId) return unauthorized();
      const state = await ctx.runQuery(internal.devices.getLockStateByDeviceId, { deviceId });
      return json(state);
    } catch (e) {
      return json({ isLocked: false, isAlarmActive: false });
    }
  }),
});

// Called from the native background location task (src/lib/BackgroundLocation.ts)
// -- fire-and-forget, no response body needed, same style as /triggerAlarmDevice.
http.route({
  path: "/updateDeviceLocation",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const latitude = Number(body.latitude);
      const longitude = Number(body.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return new Response(null, { status: 400 });
      }
      const deviceId = await authenticateDevice(ctx, body, "BackgroundLocation");
      if (!deviceId) return unauthorized();
      await ctx.runMutation(internal.devices.updateLocationByDeviceId, {
        deviceId,
        latitude,
        longitude,
      });
    } catch (e) {
      // Never let a malformed background location update crash the endpoint
    }
    return new Response(null, { status: 200 });
  }),
});

http.route({
  path: "/debugLogs",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const key = url.searchParams.get("projectKey");

    if (!key || key !== process.env.DASHBOARD_KEY) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const logs = await ctx.runQuery(api.debugLogs.recent, {});

    const shaped = logs.map((log) => ({
      timestamp: log.timestamp,
      level: log.level ?? "info",
      source: log.source,
      message: log.message,
      metadata: undefined,
    }));

    return new Response(JSON.stringify({ logs: shaped }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }),
});

http.route({
  path: "/debugLogs",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }),
});

http.route({
  path: "/debugSources",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const key = url.searchParams.get("projectKey");

    if (!key || key !== process.env.DASHBOARD_KEY) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const logs = await ctx.runQuery(api.debugLogs.recent, {});
    const sources = Array.from(new Set(logs.map((l) => l.source)));

    return new Response(JSON.stringify({ sources }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }),
});

http.route({
  path: "/debugSources",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }),
});

export default http;
