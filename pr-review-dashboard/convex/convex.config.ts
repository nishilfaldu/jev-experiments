import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    GITHUB_APP_ID: v.optional(v.string()),
    GITHUB_PRIVATE_KEY: v.optional(v.string()),
    GITHUB_WEBHOOK_SECRET: v.optional(v.string()),
    TYPESAFE_API_KEY: v.optional(v.string()),
  },
});

export default app;
