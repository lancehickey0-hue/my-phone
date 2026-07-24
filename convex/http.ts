import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { auth } from "./auth";

const http = httpRouter();
auth.addHttpRoutes(http);

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
      const physicalDeviceId = String(body.physicalDeviceId ?? "");
      if (physicalDeviceId) {
        await ctx.runMutation(internal.devices.triggerAlarmByPhysicalId, {
          physicalDeviceId,
        });
      }
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
      const physicalDeviceId = String(body.physicalDeviceId ?? "");
      if (!physicalDeviceId) return json({ isLocked: false, isAlarmActive: false });
      const state = await ctx.runQuery(internal.devices.getLockStateByPhysicalId, {
        physicalDeviceId,
      });
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
      const physicalDeviceId = String(body.physicalDeviceId ?? "");
      const latitude = Number(body.latitude);
      const longitude = Number(body.longitude);
      if (physicalDeviceId && Number.isFinite(latitude) && Number.isFinite(longitude)) {
        await ctx.runMutation(internal.devices.updateLocationByPhysicalId, {
          physicalDeviceId,
          latitude,
          longitude,
        });
      }
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
