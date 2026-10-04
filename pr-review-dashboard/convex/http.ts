import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { env, httpAction } from "./_generated/server";
import { auth } from "./auth";
import {
  normalizedDeliveryEvent,
  parseGitHubEvent,
} from "./model/githubEvents";
import { verifyGitHubSignature } from "./model/githubSignature";

const http = httpRouter();

auth.addHttpRoutes(http);

http.route({
  path: "/github/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = env.GITHUB_WEBHOOK_SECRET;
    if (secret === undefined || secret.trim().length === 0) {
      return new Response("GITHUB_WEBHOOK_SECRET is not configured", {
        status: 500,
      });
    }
    const bytes = new Uint8Array(await request.arrayBuffer());
    const valid = await verifyGitHubSignature(
      bytes,
      request.headers.get("x-hub-signature-256"),
      secret,
    );
    if (!valid) {
      return new Response("invalid signature", { status: 401 });
    }
    const eventName = request.headers.get("x-github-event");
    const githubDeliveryId = request.headers.get("x-github-delivery");
    if (
      eventName === null ||
      githubDeliveryId === null ||
      eventName.length === 0 ||
      githubDeliveryId.length === 0
    ) {
      return new Response("missing GitHub event headers", { status: 400 });
    }
    const text = new TextDecoder().decode(bytes);
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return new Response("invalid JSON", { status: 400 });
    }
    const parsed = parseGitHubEvent(eventName, payload);
    if (!parsed.ok) return new Response(parsed.error, { status: 400 });
    const stored = await ctx.runMutation(internal.webhooks.ingest, {
      githubDeliveryId,
      event: normalizedDeliveryEvent(parsed.event),
    });
    if (stored.kind === "stored") {
      await ctx.scheduler.runAfter(0, internal.analysis.processDelivery, {
        deliveryId: stored.deliveryId,
      });
    }
    return Response.json({ status: stored.kind }, { status: 202 });
  }),
});

export default http;
