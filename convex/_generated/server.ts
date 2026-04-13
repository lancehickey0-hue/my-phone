/* eslint-disable */
/**
 * Generated utilities for implementing server-side Convex query and mutation functions.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import {
  actionGeneric,
  httpActionGeneric,
  queryGeneric,
  mutationGeneric,
  internalActionGeneric,
  internalMutationGeneric,
  internalQueryGeneric,
} from "convex/server";
import type { DataModel } from "./dataModel.js";

/**
 * Define a query in this Convex app's public API.
 */
export const query = queryGeneric as typeof queryGeneric;

/**
 * Define a query that is only accessible from other Convex functions (but not from the client).
 */
export const internalQuery = internalQueryGeneric as typeof internalQueryGeneric;

/**
 * Define a mutation in this Convex app's public API.
 */
export const mutation = mutationGeneric as typeof mutationGeneric;

/**
 * Define a mutation that is only accessible from other Convex functions (but not from the client).
 */
export const internalMutation = internalMutationGeneric as typeof internalMutationGeneric;

/**
 * Define an action in this Convex app's public API.
 */
export const action = actionGeneric as typeof actionGeneric;

/**
 * Define an action that is only accessible from other Convex functions (but not from the client).
 */
export const internalAction = internalActionGeneric as typeof internalActionGeneric;

/**
 * Define an HTTP action.
 */
export const httpAction = httpActionGeneric as typeof httpActionGeneric;
