import { describe, it, expect } from "vitest";
import { sha256Hex, sha256HexOfBlob, bytesToHex } from "../hash";

// Known SHA-256 test vectors (FIPS 180-4 / NIST CAVS):
//   "" → e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
//   "abc" → ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad

describe("sha256Hex", () => {
  it("hashes empty input to the well-known empty-SHA256 digest", async () => {
    const hex = await sha256Hex(new Uint8Array(0));
    expect(hex).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
  });

  it("hashes 'abc' to the well-known NIST CAVS vector", async () => {
    const hex = await sha256Hex(new TextEncoder().encode("abc"));
    expect(hex).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  it("produces a 64-character lowercase hex string", async () => {
    const hex = await sha256Hex(new TextEncoder().encode("rawdrive"));
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("sha256HexOfBlob", () => {
  it("hashes a Blob consistently with raw bytes", async () => {
    const data = new TextEncoder().encode("upload-screening/2026-04-10");
    const fromBytes = await sha256Hex(data);
    // Cast to BlobPart to satisfy TypeScript's strict Blob constructor typing
    // under the jsdom test environment.
    const fromBlob = await sha256HexOfBlob(new Blob([data.buffer as ArrayBuffer]));
    expect(fromBlob).toBe(fromBytes);
  });
});

describe("bytesToHex", () => {
  it("encodes a single byte with the leading zero", () => {
    expect(bytesToHex(new Uint8Array([0x0a]))).toBe("0a");
  });
  it("encodes multi-byte sequences in order", () => {
    expect(bytesToHex(new Uint8Array([0xde, 0xad, 0xbe, 0xef]))).toBe(
      "deadbeef"
    );
  });
});
