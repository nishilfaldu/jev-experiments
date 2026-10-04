import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { githubUserId } from "./model/account";

export const check = internalQuery({
  args: {},
  returns: v.union(v.number(), v.null()),
  handler: githubUserId,
});
