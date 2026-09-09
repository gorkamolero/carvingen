/**
 * Karma Train asset pipeline — text prompt → image → 3D mesh → GLB on disk.
 *
 * Built-in prompt templates per kind enforce a consistent low-poly,
 * Synty-style aesthetic so the generated meshes blend with the existing
 * `SM_Veh_*` / `SM_Bld_*` props in `/public/models/`.
 *
 * Uses fal.subscribe (which the smoke tests confirm works on the current
 * FAL_KEY) instead of the workflow runner's queue.submit path which has
 * been returning 401 on the same model/key — that's a carvingen bug.
 *
 * Usage:
 *   pnpm tsx scripts/karma-train-gen.ts <kind> [--prompt "..."] [--out path.glb]
 *
 * Examples:
 *   pnpm tsx scripts/karma-train-gen.ts shrine
 *   pnpm tsx scripts/karma-train-gen.ts cremation_pile --out ./test.glb
 *   pnpm tsx scripts/karma-train-gen.ts peacock_spot --prompt "..."
 */

import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { fal } from "@fal-ai/client";

import { buildMeshRequest } from "@/lib/fal/mesh";
import { loadLocalEnvFile } from "@/lib/load-local-env";

loadLocalEnvFile(process.cwd());

// ---------------------------------------------------------------------------
// Low-poly aesthetic enforcement
//
//   - 1200 target tris keeps GLBs around 2-3 MB and matches Synty Simple
//     density. Meshy's preview mode at this count produces clean, readable
//     silhouettes without high-frequency detail.
//   - The prompt prefix is appended to every subject description so the
//     image-gen model is biased toward flat-shaded low-poly *concept art*
//     rather than photoreal — which Meshy then re-meshes to ~1200 tris.
// ---------------------------------------------------------------------------

const TARGET_POLYCOUNT = 1200;
const STYLE_PREFIX =
  "low-poly stylized 3D-game-ready asset in the Synty Simple Polygon art style, " +
  "flat saturated colors with soft toon shading and clean facets, " +
  "single isolated object, neutral plain background, three-quarter view, " +
  "no people, no clutter, no text, no UI, no shadows under the object";

/** Kind-specific subject descriptions; STYLE_PREFIX is prepended to each. */
const KIND_PROMPTS: Record<string, string> = {
  shrine:
    "A small ornate Hindu wayside shrine, slightly weathered cream stone with " +
    "saffron and brass-gold accents, simple geometric forms, clean silhouette",
  cremation_pile:
    "A small smoldering Hindu cremation pyre, dark ash heap with charred logs " +
    "and a few faint ember sparks, muted grey-brown palette, simple geometric forms",
  peacock_spot:
    "A single ornate Indian peacock displaying its tail feathers in a fan, " +
    "vivid teal body and emerald-green tail with gold eye-markings, simple geometric forms",
  lotus_pond:
    "A small circular lotus pond with five pink lotus flowers on green lily pads, " +
    "calm blue water surface, simple geometric forms, top-down three-quarter view",
};

interface ImageResult {
  images?: Array<{ url?: string }>;
}

interface MeshResult {
  model_glb?: string | { url?: string };
  model_urls?: { glb?: string };
}

async function generateImage(prompt: string): Promise<string> {
  const result = await fal.subscribe("fal-ai/nano-banana-2", {
    input: { prompt, aspect_ratio: "1:1", num_images: 1 },
  });
  const url = (result.data as ImageResult).images?.[0]?.url;
  if (!url) throw new Error("Image generation returned no URL");
  return url;
}

async function generateMesh(imageUrl: string): Promise<string> {
  const input = buildMeshRequest({
    imageUrls: [imageUrl],
    mode: "preview",
    meshyPolyMode: "low",
    meshyTargetPolycount: TARGET_POLYCOUNT,
    // Keep Meshy's baked texture — the carved/painted detail can't be
    // reproduced by runtime flat shading. Trades ~5 MB per GLB for
    // recognizable shrine carvings / peacock plumage / lotus painting.
    meshyShouldTexture: true,
  });
  const slug = String("fal-ai/meshy/v6/image-to-3d");
  const result = await fal.subscribe(slug, {
    input,
  });
  const data = result.data as MeshResult;
  const url =
    typeof data.model_glb === "string"
      ? data.model_glb
      : (data.model_glb?.url ?? data.model_urls?.glb);
  if (!url) {
    throw new Error(
      `Mesh generation returned no GLB URL. Keys: ${Object.keys(result.data ?? {}).join(", ")}`,
    );
  }
  return url;
}

async function downloadTo(url: string, outPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }
  const buf = Buffer.from(await response.arrayBuffer());
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, buf);
}

interface CliArgs {
  kind: string;
  prompt: string;
  outPath: string;
}

function parseArgs(argv: string[]): CliArgs {
  const positional: string[] = [];
  let customPrompt: string | undefined;
  let customOut: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--prompt") {
      customPrompt = argv[++i];
    } else if (arg === "--out") {
      customOut = argv[++i];
    } else {
      positional.push(arg);
    }
  }

  const [kind] = positional;
  if (!kind) {
    throw new Error(
      "Usage: tsx karma-train-gen.ts <kind> [--prompt '...'] [--out path.glb]",
    );
  }

  const subject = customPrompt ?? KIND_PROMPTS[kind];
  if (!subject) {
    throw new Error(
      `No built-in prompt for kind '${kind}'. Known kinds: ${Object.keys(
        KIND_PROMPTS,
      ).join(", ")}. Pass --prompt to override.`,
    );
  }

  const prompt = `${subject}, ${STYLE_PREFIX}`;
  const outPath =
    customOut ??
    `/Users/gorkolas/www/train/public/models/spawn/${kind}.glb`;

  return { kind, prompt, outPath };
}

async function main() {
  const { kind, prompt, outPath } = parseArgs(process.argv.slice(2));

  console.log(`[${kind}] target_polycount=${TARGET_POLYCOUNT}`);
  console.log(`[${kind}] generating image…`);
  const imageUrl = await generateImage(prompt);
  console.log(`[${kind}] image ready: ${imageUrl}`);

  console.log(`[${kind}] generating mesh…`);
  const meshUrl = await generateMesh(imageUrl);
  console.log(`[${kind}] mesh ready: ${meshUrl}`);

  console.log(`[${kind}] downloading → ${outPath}`);
  await downloadTo(meshUrl, outPath);
  console.log(`[${kind}] done.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
