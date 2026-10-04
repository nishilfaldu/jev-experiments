// @vitest-environment node
import { generateKeyPairSync, verify } from "node:crypto";
import { expect, test } from "vitest";
import { createGitHubAppJwt } from "./githubApp";

test("the app JWT is an RS256 token with GitHub's iat, exp, and iss claims", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs1", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  const nowSeconds = 1_700_000_000;
  const jwt = await createGitHubAppJwt("12345", privateKey, nowSeconds);
  const [header, payload, signature] = jwt.split(".");
  expect(header).toBeDefined();
  expect(payload).toBeDefined();
  expect(signature).toBeDefined();
  if (
    header === undefined ||
    payload === undefined ||
    signature === undefined
  ) {
    return;
  }
  const verified = verify(
    "RSA-SHA256",
    Buffer.from(`${header}.${payload}`),
    publicKey,
    Buffer.from(signature, "base64url"),
  );
  expect(verified).toBe(true);
  expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({
    alg: "RS256",
    typ: "JWT",
  });
  expect(JSON.parse(Buffer.from(payload, "base64url").toString())).toEqual({
    iat: nowSeconds - 60,
    exp: nowSeconds + 9 * 60,
    iss: "12345",
  });
});
