import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { loadLocalEnvFile } from "@/lib/load-local-env";
import {
  createAnimationTask,
  createRiggingTask,
  downloadMeshyResultFiles,
  getRiggingTask,
} from "@/lib/meshy/native";

loadLocalEnvFile(process.cwd());

type CliOptions = {
  modelUrl?: string;
  rigTaskId?: string;
  actionId: number;
  outputDir: string;
  heightMeters: number;
  fps?: number;
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const apiKey = process.env.MESHY_API_KEY;
  if (!apiKey) {
    throw new Error("MESHY_API_KEY is required.");
  }

  await mkdir(options.outputDir, { recursive: true });

  const rigTask = options.rigTaskId
    ? await getRiggingTask(apiKey, options.rigTaskId)
    : await createRigTask(apiKey, options);

  const animationTask = await createAnimationTask({
    apiKey,
    rigTaskId: rigTask.id,
    actionId: options.actionId,
    fps: options.fps,
  });

  const downloads = await downloadMeshyResultFiles(animationTask, options.outputDir);
  const manifest = {
    modelUrl: options.modelUrl ?? null,
    actionId: options.actionId,
    heightMeters: options.heightMeters,
    fps: options.fps ?? null,
    rigTask,
    animationTask,
    downloads,
  };

  const manifestPath = join(options.outputDir, `animation-${options.actionId}.manifest.json`);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ rigTaskId: rigTask.id, animationTaskId: animationTask.id, outputDir: options.outputDir, downloads, manifestPath }, null, 2));
}

async function createRigTask(apiKey: string, options: CliOptions) {
  if (!options.modelUrl) {
    throw new Error("Either --model-url or --rig-task-id is required.");
  }

  return createRiggingTask({
    apiKey,
    modelUrl: options.modelUrl,
    heightMeters: options.heightMeters,
  });
}

function parseArgs(args: string[]): CliOptions {
  const modelUrl = readFlag(args, "--model-url");
  const rigTaskId = readFlag(args, "--rig-task-id");
  const actionId = Number(readFlag(args, "--action-id"));
  const outputDir = readFlag(args, "--output-dir") ?? `output/animations/action-${actionId}`;
  const heightMeters = Number(readFlag(args, "--height-meters") ?? "1.45");
  const fpsValue = readFlag(args, "--fps");

  if (!modelUrl && !rigTaskId) {
    throw new Error("Usage: pnpm exec tsx scripts/meshy-animate.ts (--model-url URL | --rig-task-id ID) --action-id ID [--output-dir DIR] [--height-meters 1.45] [--fps 30]");
  }
  if (!Number.isInteger(actionId)) {
    throw new Error("--action-id must be an integer.");
  }
  if (!Number.isFinite(heightMeters) || heightMeters <= 0) {
    throw new Error("--height-meters must be a positive number.");
  }

  return {
    modelUrl,
    rigTaskId,
    actionId,
    outputDir,
    heightMeters,
    fps: fpsValue ? Number(fpsValue) : undefined,
  };
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
