import { fal } from "@fal-ai/client";

import { configureFalClient } from "@/lib/fal/client";
import { buildMeshRequest, pickMeshSlug } from "@/lib/fal/mesh";
import { loadLocalEnvFile } from "@/lib/load-local-env";

loadLocalEnvFile(process.cwd());

async function main() {
  const imageUrl = process.env.SMOKE_IMAGE_URL;

  if (!imageUrl) {
    throw new Error("SMOKE_IMAGE_URL is required. Provide a publicly reachable image URL.");
  }

  configureFalClient();

  const slug = pickMeshSlug("preview");
  const input = buildMeshRequest({
    imageUrl,
    mode: "preview",
  });

  const result = await fal.subscribe(slug, { input });
  const data = result.data as Record<string, unknown>;
  const glb = data.glb;

  if (typeof glb !== "string") {
    throw new Error("Mesh smoke test did not receive a GLB URL.");
  }

  console.log(glb);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
