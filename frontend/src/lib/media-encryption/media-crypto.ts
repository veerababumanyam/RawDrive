const SCHEME = "rawdrive-e2ee-v1";
const ALGORITHM = "AES-256-GCM";
const KEY_LENGTH_BITS = 256;
const GCM_IV_BYTES = 12;
const ENCRYPTED_MEDIA_CONTENT_TYPE = "application/vnd.rawdrive.encrypted";
const SHARE_KEY_PARAM = "rd_key";

export type MediaEncryptionManifest = {
  scheme: typeof SCHEME;
  algorithm: typeof ALGORITHM;
  key_id: string;
  object_type: string;
  iv_b64: string;
  ciphertext_sha256: string;
  plaintext_size: number;
  ciphertext_size: number;
  content_type: string;
  aad: string;
};

export type EncryptBlobOptions = {
  key: CryptoKey;
  keyId: string;
  objectType: string;
  contentType?: string;
};

export type EncryptedBlobResult = {
  ciphertext: Blob;
  manifest: MediaEncryptionManifest;
};

export async function generateRawMediaKey(): Promise<CryptoKey> {
  return webCrypto().subtle.generateKey(
    { name: "AES-GCM", length: KEY_LENGTH_BITS },
    true,
    ["encrypt", "decrypt"],
  );
}

export async function exportRawMediaKey(key: CryptoKey): Promise<string> {
  const raw = await webCrypto().subtle.exportKey("raw", key);
  return base64urlEncode(new Uint8Array(raw));
}

export async function importRawMediaKey(rawKey: string): Promise<CryptoKey> {
  const raw = base64urlDecode(rawKey);
  return webCrypto().subtle.importKey(
    "raw",
    toArrayBuffer(raw),
    { name: "AES-GCM", length: KEY_LENGTH_BITS },
    true,
    ["encrypt", "decrypt"],
  );
}

export async function encryptBlob(blob: Blob, options: EncryptBlobOptions): Promise<EncryptedBlobResult> {
  const crypto = webCrypto();
  const plaintext = await blob.arrayBuffer();
  const contentType = options.contentType || blob.type || "application/octet-stream";
  const iv = crypto.getRandomValues(new Uint8Array(GCM_IV_BYTES));
  const aad = additionalData(options.keyId, options.objectType, contentType);
  const encodedAAD = new TextEncoder().encode(aad);

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encodedAAD },
    options.key,
    plaintext,
  );
  const ciphertextBytes = new Uint8Array(encrypted);

  return {
    ciphertext: new Blob([toArrayBuffer(ciphertextBytes)], { type: ENCRYPTED_MEDIA_CONTENT_TYPE }),
    manifest: {
      scheme: SCHEME,
      algorithm: ALGORITHM,
      key_id: options.keyId,
      object_type: options.objectType,
      iv_b64: base64urlEncode(iv),
      ciphertext_sha256: await sha256Hex(ciphertextBytes),
      plaintext_size: plaintext.byteLength,
      ciphertext_size: ciphertextBytes.byteLength,
      content_type: contentType,
      aad,
    },
  };
}

export async function decryptBlob(
  ciphertext: Blob,
  manifest: MediaEncryptionManifest,
  key: CryptoKey,
): Promise<Blob> {
  assertManifest(manifest);

  const crypto = webCrypto();
  const ciphertextBytes = new Uint8Array(await ciphertext.arrayBuffer());
  const actualHash = await sha256Hex(ciphertextBytes);
  if (actualHash !== manifest.ciphertext_sha256) {
    throw new Error("ENCRYPTED_MEDIA_HASH_MISMATCH");
  }
  if (ciphertextBytes.byteLength !== manifest.ciphertext_size) {
    throw new Error("ENCRYPTED_MEDIA_SIZE_MISMATCH");
  }

  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(base64urlDecode(manifest.iv_b64)),
      additionalData: toArrayBuffer(
        new TextEncoder().encode(manifest.aad || additionalData(
          manifest.key_id,
          manifest.object_type,
          manifest.content_type,
        )),
      ),
    },
    key,
    toArrayBuffer(ciphertextBytes),
  );

  return new Blob([plaintext], { type: manifest.content_type });
}

export function appendGalleryKeyFragment(url: string, exportedKey: string): string {
  const parsed = new URL(url);
  parsed.hash = `${SHARE_KEY_PARAM}=${encodeURIComponent(exportedKey)}`;
  return parsed.toString();
}

export function readGalleryKeyFromHash(hash: string | undefined | null): string | null {
  if (!hash) return null;
  const rawHash = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(rawHash);
  return params.get(SHARE_KEY_PARAM);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await webCrypto().subtle.digest("SHA-256", toArrayBuffer(bytes));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function assertManifest(manifest: MediaEncryptionManifest): void {
  if (manifest.scheme !== SCHEME) {
    throw new Error("UNSUPPORTED_MEDIA_ENCRYPTION_SCHEME");
  }
  if (manifest.algorithm !== ALGORITHM) {
    throw new Error("UNSUPPORTED_MEDIA_ENCRYPTION_ALGORITHM");
  }
}

function additionalData(keyId: string, objectType: string, contentType: string): string {
  return `${SCHEME}:${keyId}:${objectType}:${contentType}`;
}

function webCrypto(): Crypto {
  const crypto = globalThis.crypto;
  if (!crypto?.subtle) {
    throw new Error("Web Crypto API is required for media encryption");
  }
  return crypto;
}

function base64urlEncode(bytes: Uint8Array): string {
  const binary = bytesToBinary(bytes);
  const b64 = typeof btoa === "function"
    ? btoa(binary)
    : bufferFrom(binary, "binary").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64urlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = typeof atob === "function"
    ? atob(padded)
    : bufferFrom(padded, "base64").toString("binary");
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function bytesToBinary(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return binary;
}

function bufferFrom(value: string, encoding: BufferEncoding): Buffer {
  const bufferCtor = (globalThis as typeof globalThis & { Buffer?: typeof Buffer }).Buffer;
  if (!bufferCtor) {
    throw new Error("base64 codec unavailable");
  }
  return bufferCtor.from(value, encoding);
}
