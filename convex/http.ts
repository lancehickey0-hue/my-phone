import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();
auth.addHttpRoutes(http);

http.route({
  path: "/logDebug",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      await ctx.runMutation(api.debugLogs.log, {
        source: String(body.source ?? "unknown"),
        message: String(body.message ?? ""),
      });
    } catch (e) {
      // Never let a malformed debug log crash the endpoint
    }
    return new Response(null, { status: 200 });
  }),
});

export default http;
