import { getAuthUserId } from "@convex-dev/auth/server";
import type { QueryCtx, MutationCtx } from "../_generated/server";
/** Resolve the signed-in GitHub account without trusting client-supplied IDs. */
export async function githubUserId(
  ctx: QueryCtx | MutationCtx,
): Promise<number | null> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return null;
  const account = await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) =>
      q.eq("userId", userId).eq("provider", "github"),
    )
    .unique();
  const id = Number(account?.providerAccountId);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
