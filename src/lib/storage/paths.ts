import { join } from "node:path";

import { getServerEnv } from "@/lib/env";

export function getUploadsRoot() {
  return join(getServerEnv().ASSET_STORAGE_PATH, "uploads");
}

export function getGeneratedRoot() {
  return join(getServerEnv().ASSET_STORAGE_PATH, "generated");
}

export function buildAssetPath(kind: string, fileName: string) {
  const root = kind === "image-upload" ? getUploadsRoot() : getGeneratedRoot();
  return join(root, fileName);
}
