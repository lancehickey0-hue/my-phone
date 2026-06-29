import { getAuthUserId } from "@convex-dev/auth/server";
import { internalMutation, mutation } from "./_generated/server";

export const deleteAccount = mutation({
  args: {},
  handler: async ctx => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const authAccounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", q => q.eq("userId", userId))
      .collect();
    for (const account of authAccounts) {
      await ctx.db.delete(account._id);
    }

    const authSessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", q => q.eq("userId", userId))
      .collect();
    for (const session of authSessions) {
      const refreshTokens = await ctx.db
        .query("authRefreshTokens")
        .withIndex("sessionId", q => q.eq("sessionId", session._id))
        .collect();
      for (const token of refreshTokens) {
        await ctx.db.delete(token._id);
      }
      await ctx.db.delete(session._id);
    }

    await ctx.db.delete(userId);

    return { success: true };
  },
});

// One-time cleanup: removes all auth records for users whose user document
// no longer exists (created when accounts are deleted via the dashboard
// without going through deleteAccount).
export const purgeOrphanedAuthData = internalMutation({
  args: {},
  handler: async ctx => {
    let deleted = 0;

    const sessions = await ctx.db.query("authSessions").collect();
    for (const session of sessions) {
      const user = await ctx.db.get(session.userId);
      if (user) continue;

      const refreshTokens = await ctx.db
        .query("authRefreshTokens")
        .withIndex("sessionId", q => q.eq("sessionId", session._id))
        .collect();
      for (const token of refreshTokens) {
        await ctx.db.delete(token._id);
        deleted++;
      }
      await ctx.db.delete(session._id);
      deleted++;
    }

    const accounts = await ctx.db.query("authAccounts").collect();
    for (const account of accounts) {
      const user = await ctx.db.get(account.userId);
      if (!user) {
        await ctx.db.delete(account._id);
        deleted++;
      }
    }

    return { deleted };
  },
});
