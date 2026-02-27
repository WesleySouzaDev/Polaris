import { MutationCtx, QueryCtx } from "./_generated/server";

export const VerifyAuth = async (ctx: QueryCtx | MutationCtx) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized");
  }

  return identity;
};
