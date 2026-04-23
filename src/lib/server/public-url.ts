import { getServerEnv } from "@/lib/env";

export function getPublicAssetUrl(assetId: string) {
  return new URL(`/api/assets/${assetId}`, getServerEnv().PUBLIC_URL).toString();
}
