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
    const body = await request.json();
    await ctx.runMutation(internal.debugLogs.add, {
      source: body.source ?? "unknown",
      message: body.message ?? "",
    });
    return new Response(null, { status: 200 });
  }),
});

export default http;