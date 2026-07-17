import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
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
      if (!physicalDeviceId) return json({ isLocked: false });
      const state = await ctx.runQuery(internal.devices.getLockStateByPhysicalId, {
        physicalDeviceId,
      });
      return json(state);
    } catch (e) {
      return json({ isLocked: false });
    }
  }),
});

export default http;
