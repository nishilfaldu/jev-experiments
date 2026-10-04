import { expect, test } from "vitest";
import { signGitHubBody, verifyGitHubSignature } from "./githubSignature";

const secret = "webhook-secret";
const body = new TextEncoder().encode(
  JSON.stringify({ action: "opened", number: 7 }),
);

test("a matching signature verifies", async () => {
  const signature = await signGitHubBody(body, secret);
  expect(await verifyGitHubSignature(body, signature, secret)).toBe(true);
});

test("a tampered body is rejected", async () => {
  const signature = await signGitHubBody(body, secret);
  const tampered = new TextEncoder().encode(
    JSON.stringify({ action: "opened", number: 8 }),
  );
  expect(await verifyGitHubSignature(tampered, signature, secret)).toBe(false);
});

test("a wrong secret is rejected", async () => {
  const signature = await signGitHubBody(body, secret);
  expect(await verifyGitHubSignature(body, signature, "other-secret")).toBe(
    false,
  );
});

test("a missing or malformed header is rejected", async () => {
  expect(await verifyGitHubSignature(body, null, secret)).toBe(false);
  expect(await verifyGitHubSignature(body, "sha1=abcd", secret)).toBe(false);
  expect(await verifyGitHubSignature(body, "sha256=zzzz", secret)).toBe(false);
});
