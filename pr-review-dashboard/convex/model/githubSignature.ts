const SHA256_PREFIX = "sha256=";

export async function signGitHubBody(
  body: Uint8Array,
  secret: string,
): Promise<string> {
  const mac = await hmacSha256(body, secret);
  return `${SHA256_PREFIX}${toHex(mac)}`;
}

export async function verifyGitHubSignature(
  body: Uint8Array,
  signatureHeader: string | null,
  secret: string,
): Promise<boolean> {
  if (secret.length === 0 || signatureHeader === null) {
    return false;
  }
  if (!signatureHeader.startsWith(SHA256_PREFIX)) {
    return false;
  }
  const provided = signatureHeader.slice(SHA256_PREFIX.length);
  if (!/^[0-9a-f]{64}$/.test(provided)) {
    return false;
  }
  const expected = toHex(await hmacSha256(body, secret));
  return timingSafeEqualHex(expected, provided);
}

async function hmacSha256(
  body: Uint8Array,
  secret: string,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(new TextEncoder().encode(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, toArrayBuffer(body));
  return new Uint8Array(mac);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

function timingSafeEqualHex(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}
