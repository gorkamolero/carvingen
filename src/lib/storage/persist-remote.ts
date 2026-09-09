import { isIP } from "node:net";

import { extension } from "mime-types";
import { nanoid } from "nanoid";

import { createAssetRecord, getAssetBySha } from "@/lib/db/repositories/assets";
import { getServerEnv } from "@/lib/env";
import { buildAssetPath } from "@/lib/storage/paths";
import { sha256 } from "@/lib/storage/hash";
import { writeFileIfMissing } from "@/lib/storage/files";

const BASE_PERSISTED_KINDS = [
  "image",
  "thumbnail",
  "glb",
  "fbx",
  "usdz",
  "obj",
  "stl",
  "video",
  "animation-glb",
  "animation-fbx",
  "rigged-character-glb",
  "rigged-character-fbx",
] as const;

const BASE_PERSISTED_KIND_SET = new Set<string>(BASE_PERSISTED_KINDS);

export type PersistedAssetKind = (typeof BASE_PERSISTED_KINDS)[number] | `texture-${number}-${string}`;

export async function persistRemoteAsset(input: {
  sourceUrl: string;
  kind: string;
  jobId?: string | null;
}) {
  validateRemoteAssetInput(input);
  const response = await fetch(input.sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch remote asset: ${response.status}`);
  }

  const env = getServerEnv();
  validateContentLength(response, env.MAX_REMOTE_ASSET_BYTES);

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const mimeType = response.headers.get("content-type") ?? "application/octet-stream";
  validateBufferedSize(buffer, env.MAX_REMOTE_ASSET_BYTES);
  validateContentType(input.kind, mimeType);

  const hash = sha256(buffer);
  const ext = extension(mimeType) || input.kind;
  const existing = await getAssetBySha(hash, buffer.byteLength);

  if (existing) {
    return existing;
  }

  const localPath = buildAssetPath(input.kind, `${hash}.${ext}`);
  await writeFileIfMissing(localPath, buffer);

  return createAssetRecord({
    id: nanoid(),
    jobId: input.jobId ?? null,
    kind: input.kind,
    mimeType,
    localPath,
    sourceUrl: input.sourceUrl,
    sha256: hash,
    bytes: buffer.byteLength,
    width: null,
    height: null,
    originalFileName: null,
  });
}

export function isAllowedPersistedKind(kind: string): kind is PersistedAssetKind {
  return BASE_PERSISTED_KIND_SET.has(kind) || /^texture-\d+-[a-z0-9-]+$/i.test(kind);
}

export function validateRemoteAssetInput(input: {
  sourceUrl: string;
  kind: string;
  jobId?: string | null;
}): asserts input is { sourceUrl: string; kind: PersistedAssetKind; jobId?: string | null } {
  if (!isAllowedPersistedKind(input.kind)) {
    throw new Error(`Unsupported remote asset kind: ${input.kind}`);
  }

  const url = new URL(input.sourceUrl);
  if (url.protocol !== "https:") {
    throw new Error("Remote asset URLs must use https.");
  }

  if (isPrivateOrLocalHost(url.hostname)) {
    throw new Error("Remote asset URL host is private or local.");
  }

  if (!isAllowedRemoteAssetHost(url.hostname, getServerEnv().REMOTE_ASSET_ALLOWED_HOSTS)) {
    throw new Error("Remote asset URL host is not allowed.");
  }
}

export function isAllowedRemoteAssetHost(hostname: string, allowlist: string) {
  const normalizedHost = hostname.toLowerCase();
  return allowlist
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
    .some((allowedHost) => normalizedHost === allowedHost || normalizedHost.endsWith(`.${allowedHost}`));
}

function validateContentLength(response: Response, maxBytes: number) {
  const contentLength = response.headers.get("content-length");
  if (!contentLength) {
    return;
  }

  const bytes = Number(contentLength);
  if (Number.isFinite(bytes) && bytes > maxBytes) {
    throw new Error(`Remote asset exceeds ${maxBytes} bytes.`);
  }
}

function validateBufferedSize(buffer: Buffer, maxBytes: number) {
  if (buffer.byteLength > maxBytes) {
    throw new Error(`Remote asset exceeds ${maxBytes} bytes.`);
  }
}

function validateContentType(kind: PersistedAssetKind, mimeType: string) {
  const normalizedMime = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";

  if (kind === "image" || kind === "thumbnail" || kind.startsWith("texture-")) {
    if (normalizedMime.startsWith("image/")) {
      return;
    }
    throw new Error(`Remote asset content type ${mimeType} does not match ${kind}.`);
  }

  if (kind === "video") {
    if (normalizedMime.startsWith("video/")) {
      return;
    }
    throw new Error(`Remote asset content type ${mimeType} does not match video.`);
  }

  if (
    [
      "glb",
      "fbx",
      "usdz",
      "obj",
      "stl",
      "animation-glb",
      "animation-fbx",
      "rigged-character-glb",
      "rigged-character-fbx",
    ].includes(kind)
  ) {
    if (
      normalizedMime.startsWith("model/") ||
      normalizedMime === "application/octet-stream" ||
      normalizedMime === "application/x-tgif"
    ) {
      return;
    }
    throw new Error(`Remote asset content type ${mimeType} does not match ${kind}.`);
  }
}

function isPrivateOrLocalHost(hostname: string) {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    return true;
  }

  const ipVersion = isIP(host);
  if (ipVersion === 4) {
    return isPrivateIpv4(host);
  }
  if (ipVersion === 6) {
    return host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:");
  }

  return false;
}

function isPrivateIpv4(host: string) {
  const [a = 0, b = 0] = host.split(".").map(Number);
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    a === 0
  );
}
