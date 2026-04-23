import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { fal } from "@fal-ai/client";

import { getServerEnv } from "@/lib/env";
import { configureFalClient } from "@/lib/fal/client";
import { buildImageRequest, pickImageSlug } from "@/lib/fal/image";
import { loadLocalEnvFile } from "@/lib/load-local-env";

loadLocalEnvFile(process.cwd());

async function main() {
  const env = getServerEnv();
  configureFalClient();

  const input = buildImageRequest({
    modelBase: "fal-ai/nano-banana-2",
    prompt: "A hand-carved walnut raven totem on a cream background",
    aspectRatio: "1:1",
    resolution: "1K",
    referenceImages: [],
  });

  const slug = pickImageSlug("fal-ai/nano-banana-2", []);
  const result = await fal.subscribe(slug, { input });
  const image = result.data.images?.[0];

  if (!image?.url) {
    throw new Error("Smoke test did not receive an image URL from fal.");
  }

  const response = await fetch(image.url);
  if (!response.ok) {
    throw new Error(`Failed to fetch smoke output: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const outputDir = join(process.cwd(), env.ASSET_STORAGE_PATH, "smoke");

  await mkdir(outputDir, { recursive: true });

  const filePath = join(outputDir, `smoke-${Date.now()}.png`);
  await writeFile(filePath, buffer);

  const file = await stat(filePath);
  console.log(`Smoke image saved to ${filePath} (${file.size} bytes)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
