import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { VerifyAuth } from "./auth";

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await VerifyAuth(ctx);
    const project = await ctx.db.get("projects", args.projectId);

    if (!project) throw new Error("Project not found");
    if (project.ownerId !== identity.subject)
      throw new Error("Not authorized access");

    const conversationId = await ctx.db.insert("conversations", {
      projectId: args.projectId,
      title: args.title,
      updatedAt: Date.now(),
    });

    return conversationId;
  },
});

export const getById = query({
  args: {
    id: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const identity = await VerifyAuth(ctx);
    const conversation = await ctx.db.get("conversations", args.id);

    if (!conversation) throw new Error("Conversation not found");

    const project = await ctx.db.get("projects", conversation.projectId);

    if (!project) throw new Error("Project not found");
    if (project.ownerId !== identity.subject)
      throw new Error("Not authorized access");

    return conversation;
  },
});

export const getByProject = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const identity = await VerifyAuth(ctx);
    const project = await ctx.db.get("projects", args.projectId);

    if (!project) throw new Error("Project not found");
    if (project.ownerId !== identity.subject)
      throw new Error("Not authorized access");

    return await ctx.db
      .query("conversations")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();
  },
});

export const getMessages = query({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const identity = await VerifyAuth(ctx);
    const conversation = await ctx.db.get("conversations", args.conversationId);

    if (!conversation) throw new Error("Conversation not found");

    const project = await ctx.db.get("projects", conversation.projectId);

    if (!project) throw new Error("Project not found");
    if (project.ownerId !== identity.subject)
      throw new Error("Not authorized access");

    return await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .order("asc")
      .collect();
  },
});
