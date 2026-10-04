const RSA_ENCRYPTION_ALGORITHM = new Uint8Array([
  0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01,
  0x05, 0x00,
]);

function normalizePrivateKey(privateKey: string): string {
  const trimmed = privateKey.trim();
  if (trimmed.includes("\\n")) {
    return trimmed.replaceAll("\\n", "\n");
  }
  return trimmed;
}

export async function createGitHubAppJwt(
  appId: string,
  privateKeyPem: string,
  nowSeconds: number,
): Promise<string> {
  const header = base64Url(
    utf8Bytes(JSON.stringify({ alg: "RS256", typ: "JWT" })),
  );
  const payload = base64Url(
    utf8Bytes(
      JSON.stringify({
        iat: nowSeconds - 60,
        exp: nowSeconds + 9 * 60,
        iss: appId,
      }),
    ),
  );
  const signingInput = `${header}.${payload}`;
  const key = await importPrivateKey(normalizePrivateKey(privateKeyPem));
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    toArrayBuffer(utf8Bytes(signingInput)),
  );
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pkcs8 = pem.includes("BEGIN RSA PRIVATE KEY")
    ? pkcs1ToPkcs8(decodePem(pem))
    : decodePem(pem);
  return crypto.subtle.importKey(
    "pkcs8",
    toArrayBuffer(pkcs8),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function decodePem(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array {
  const version = new Uint8Array([0x02, 0x01, 0x00]);
  const wrappedKey = derWrap(0x04, pkcs1);
  return derWrap(
    0x30,
    concatBytes([version, RSA_ENCRYPTION_ALGORITHM, wrappedKey]),
  );
}

function derWrap(tag: number, content: Uint8Array): Uint8Array {
  return concatBytes([
    new Uint8Array([tag]),
    derLength(content.length),
    content,
  ]);
}

function derLength(length: number): Uint8Array {
  if (length < 128) {
    return new Uint8Array([length]);
  }
  const bytes: number[] = [];
  let remaining = length;
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining = Math.floor(remaining / 256);
  }
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
