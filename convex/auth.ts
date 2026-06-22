import { Password } from "@convex-dev/auth/providers/Password";
import { Email } from "@convex-dev/auth/providers/Email";
import { convexAuth, getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";

declare const process: { env: Record<string, string | undefined> };

function decodePrivateKey(key: string | undefined): string | undefined {
  if (!key) return undefined;
  if (key.includes("\n")) return key;
  if (key.startsWith("-----BEGIN")) {
    return key
      .replace("-----BEGIN PRIVATE KEY----- ", "-----BEGIN PRIVATE KEY-----\n")
      .replace(" -----END PRIVATE KEY-----", "\n-----END PRIVATE KEY-----")
      .split(" ")
      .join("\n");
  }
  try {
    return atob(key);
  } catch {
    return key;
  }
}

const authPrivateKey = process.env.AUTH_PRIVATE_KEY;
if (authPrivateKey) {
  process.env.AUTH_PRIVATE_KEY = decodePrivateKey(authPrivateKey);
}

const jwtPrivateKey = process.env.JWT_PRIVATE_KEY;
if (jwtPrivateKey) {
  process.env.JWT_PRIVATE_KEY = decodePrivateKey(jwtPrivateKey);
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      verify: Email({
        from: "My-Phone <onboarding@resend.dev>",
        sendVerificationRequest: async ({ identifier: email, token }) => {
          const resendKey = process.env.RESEND_API_KEY;
          if (!resendKey) throw new Error("RESEND_API_KEY not set");
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + resendKey,
            },
            body: JSON.stringify({
              from: "My-Phone <onboarding@resend.dev>",
              to: [email],
              subject: "Your My-Phone verification code",
              html: "<div style=\"font-family:sans-serif;padding:20px\"><h2 style=\"color:#D4A843\">My-Phone</h2><p>Your verification code:</p><h1 style=\"letter-spacing:8px\">" + token + "</h1><p style=\"color:#666;font-size:12px\">Expires in 15 minutes.</p></div>",
            }),
          });
          if (!res.ok) {
            const error = await res.text();
            throw new Error("Failed to send email: " + error);
          }
        },
      }),
    }),
  ],
});

export const currentUser = query({
  args: {},
  handler: async ctx => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db.get(userId);
  },
});
