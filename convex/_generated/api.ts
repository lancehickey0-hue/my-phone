/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { ApiFromModules, FilterApi, FunctionReference } from "convex/server";
import { anyApi } from "convex/server";
import type * as activityLog from "../activityLog.js";
import type * as auth from "../auth.js";
import type * as billing from "../billing.js";
import type * as biometric from "../biometric.js";
import type * as constants from "../constants.js";
import type * as devices from "../devices.js";
import type * as http from "../http.js";
import type * as profiles from "../profiles.js";
import type * as users from "../users.js";
import type * as voiceEnrollment from "../voiceEnrollment.js";
import type * as ViktorSpacesEmail from "../ViktorSpacesEmail.js";

const fullApi: ApiFromModules<{
  activityLog: typeof activityLog,
  auth: typeof auth,
  billing: typeof billing,
  biometric: typeof biometric,
  constants: typeof constants,
  devices: typeof devices,
  http: typeof http,
  profiles: typeof profiles,
  users: typeof users,
  voiceEnrollment: typeof voiceEnrollment,
  ViktorSpacesEmail: typeof ViktorSpacesEmail,
}> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export const api: FilterApi<typeof fullApi, FunctionReference<any, "public">> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">> = anyApi as any;
