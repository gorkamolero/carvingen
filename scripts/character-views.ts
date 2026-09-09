import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { fal } from "@fal-ai/client";
import { lookup } from "mime-types";

import { getServerEnv } from "@/lib/env";
import { loadLocalEnvFile } from "@/lib/load-local-env";

loadLocalEnvFile(process.cwd());

type ViewName = "front" | "back" | "left" | "right";

type Candidate = {
  id: string;
  name: string;
  crop: string;
  heightMeters?: number;
};

const views: ViewName[] = ["front", "back", "left", "right"];

async function main() {
  const candidatesPath = process.argv[2];
  if (!candidatesPath) {
    throw new Error("Usage: pnpm tsx scripts/character-views.ts <candidates.json> [--concurrency N]");
  }

  const concurrency = Number(readFlag(process.argv.slice(3), "--concurrency") ?? "4");
  const candidates = JSON.parse(await readFile(candidatesPath, "utf8")) as Candidate[];
  fal.config({ credentials: getServerEnv().FAL_KEY });

  const manifest = {
    concurrency: 3,
    falStorageInputs: true,
    makeViewer: true,
    animationFps: 30,
    animations: [
      { actionId: 669, name: "Slow_Orc_Walk_inplace", role: "locomotion_inplace" },
      { actionId: 54, name: "Squat_Stance", role: "squat" },
      { actionId: 172, name: "Electrocution_Reaction", role: "hazard_reaction" },
      { actionId: 181, name: "Electrocuted_Fall", role: "hazard_fall" },
      { actionId: 525, name: "Cautious_Crouch_Walk_Left", role: "crouch_locomotion" },
      { actionId: 258, name: "CrouchLookAroundBow", role: "crouch_idle" },
      { actionId: 549, name: "Crawl_Backward", role: "crawl" },
    ],
    mesh: {
      modelType: "lowpoly",
      topology: "triangle",
      targetPolycount: 3000,
      symmetryMode: "auto",
      poseMode: "t-pose",
      heightMeters: 1.45,
      enablePbr: false,
    },
    characters: [] as Array<{
      id: string;
      name: string;
      views: Record<ViewName, string>;
      heightMeters: number;
    }>,
  };

  await runPool(candidates, concurrency, async (candidate) => {
    const outputRoot = join("output", "characters", candidate.id);
    const viewsDir = join(outputRoot, "views");
    await mkdir(viewsDir, { recursive: true });
    await writeFile(join(outputRoot, "source-crop.txt"), `${candidate.crop}\n`);

    const referenceUrl = await uploadReference(candidate.crop);
    const generatedViews: Record<ViewName, string> = {
      front: "",
      back: "",
      left: "",
      right: "",
    };

    for (const view of views) {
      const outputPath = join(viewsDir, `${view}.png`);
      const imageUrl = await generateView(candidate, referenceUrl, view);
      await download(imageUrl, outputPath);
      generatedViews[view] = outputPath;
      console.log(JSON.stringify({ id: candidate.id, view, outputPath }));
    }

    manifest.characters.push({
      id: candidate.id,
      name: candidate.name,
      views: generatedViews,
      heightMeters: candidate.heightMeters ?? 1.45,
    });
  });

  manifest.characters.sort((a, b) => a.id.localeCompare(b.id));
  const manifestPath = join("output", "characters", "ref-prep", "character-batch.json");
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ manifestPath, characters: manifest.characters.length }, null, 2));
}

async function uploadReference(path: string) {
  const buffer = await readFile(path);
  const file = new File([buffer], basename(path), {
    type: lookup(path) || "application/octet-stream",
  });
  return fal.storage.upload(file);
}

async function generateView(candidate: Candidate, referenceUrl: string, view: ViewName) {
  const subscribe = fal.subscribe as (
    endpointId: string,
    options: { input: Record<string, unknown> },
  ) => ReturnType<typeof fal.subscribe>;
  const result = await subscribe("fal-ai/nano-banana-2", {
    input: {
      prompt: buildPrompt(candidate, view),
      image_urls: [referenceUrl],
      aspect_ratio: "3:4",
      num_images: 1,
    },
  });
  const url = (result.data as { images?: Array<{ url?: string }> }).images?.[0]?.url;
  if (!url) {
    throw new Error(`No generated image URL for ${candidate.id} ${view}.`);
  }
  return url;
}

function buildPrompt(candidate: Candidate, view: ViewName) {
  const viewText = {
    front: "direct front view",
    back: "direct back view",
    left: "direct left side profile view",
    right: "direct right side profile view",
  } satisfies Record<ViewName, string>;

  return [
    `Using the reference image, create a clean ${viewText[view]} of the same character: ${candidate.name}.`,
    "Full body from head to feet, single isolated character, neutral white studio background.",
    "Game character turnaround sheet style, orthographic camera, centered composition.",
    "Preserve the same face, body proportions, skin tone, clothing colors, fabric damage, hair, and distinctive accessories.",
    "Pose for 3D reconstruction: standing T-pose or relaxed A-pose with arms away from torso, legs visible and not crossed.",
    "No text, no labels, no props, no scenery, no floor shadows, no extra people, no cropped limbs.",
  ].join(" ");
}

async function download(url: string, outputPath: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
) {
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await worker(item);
    }
  });
  await Promise.all(workers);
}

function readFlag(args: string[], flag: string) {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
