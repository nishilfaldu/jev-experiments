/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as account from "../account.js";
import type * as analysis from "../analysis.js";
import type * as auth from "../auth.js";
import type * as compare from "../compare.js";
import type * as dashboard_overview from "../dashboard/overview.js";
import type * as dashboard_pullRequest from "../dashboard/pullRequest.js";
import type * as dashboard_repository from "../dashboard/repository.js";
import type * as dashboard_shared from "../dashboard/shared.js";
import type * as http from "../http.js";
import type * as model_account from "../model/account.js";
import type * as model_githubApi from "../model/githubApi.js";
import type * as model_githubApp from "../model/githubApp.js";
import type * as model_githubEvents from "../model/githubEvents.js";
import type * as model_githubSignature from "../model/githubSignature.js";
import type * as model_jev from "../model/jev.js";
import type * as model_probability from "../model/probability.js";
import type * as model_record from "../model/record.js";
import type * as model_rules from "../model/rules.js";
import type * as model_state from "../model/state.js";
import type * as model_verdict from "../model/verdict.js";
import type * as rules from "../rules.js";
import type * as webhooks from "../webhooks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  analysis: typeof analysis;
  auth: typeof auth;
  compare: typeof compare;
  "dashboard/overview": typeof dashboard_overview;
  "dashboard/pullRequest": typeof dashboard_pullRequest;
  "dashboard/repository": typeof dashboard_repository;
  "dashboard/shared": typeof dashboard_shared;
  http: typeof http;
  "model/account": typeof model_account;
  "model/githubApi": typeof model_githubApi;
  "model/githubApp": typeof model_githubApp;
  "model/githubEvents": typeof model_githubEvents;
  "model/githubSignature": typeof model_githubSignature;
  "model/jev": typeof model_jev;
  "model/probability": typeof model_probability;
  "model/record": typeof model_record;
  "model/rules": typeof model_rules;
  "model/state": typeof model_state;
  "model/verdict": typeof model_verdict;
  rules: typeof rules;
  webhooks: typeof webhooks;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
