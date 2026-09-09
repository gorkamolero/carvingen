import { readFile, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";

export type MeshyTask = {
  id: string;
  status: "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "CANCELED";
  progress?: number;
  task_error?: { message?: string };
  result?: Record<string, string | Record<string, string>>;
  model_urls?: Record<string, string>;
  thumbnail_url?: string;
  video_url?: string;
};

export type DownloadedMeshyFile = {
  key: string;
  url: string;
  path: string;
  bytes: number;
};

export async function createRiggingTask(input: {
  apiKey: string;
  modelUrl: string;
  heightMeters: number;
}) {
  const rigTaskId = await createMeshyTask(input.apiKey, "/openapi/v1/rigging", {
    model_url: input.modelUrl,
    height_meters: input.heightMeters,
  });
  return waitForMeshyTask(input.apiKey, `/openapi/v1/rigging/${rigTaskId}`, "rigging");
}

export async function createAnimationTask(input: {
  apiKey: string;
  rigTaskId: string;
  actionId: number;
  fps?: number;
}) {
  const animationTaskId = await createMeshyTask(input.apiKey, "/openapi/v1/animations", {
    rig_task_id: input.rigTaskId,
    action_id: input.actionId,
    ...(input.fps
      ? {
          post_process: {
            operation_type: "change_fps",
            fps: input.fps,
          },
        }
      : {}),
  });
  return waitForMeshyTask(input.apiKey, `/openapi/v1/animations/${animationTaskId}`, "animation");
}

export async function createMultiImageTo3DTask(input: {
  apiKey: string;
  imagePaths: string[];
  modelType: "standard" | "lowpoly";
  shouldTexture: boolean;
  enablePbr: boolean;
  topology: "triangle" | "quad";
  targetPolycount: number;
  symmetryMode: "off" | "auto" | "on";
  poseMode: "" | "a-pose" | "t-pose";
  texturePrompt?: string;
}) {
  const imageUrls = await Promise.all(input.imagePaths.map(localImageToDataUri));
  const taskId = await createMeshyTask(input.apiKey, "/openapi/v1/multi-image-to-3d", {
    image_urls: imageUrls,
    model_type: input.modelType,
    ai_model: "latest",
    should_texture: input.shouldTexture,
    enable_pbr: input.shouldTexture ? input.enablePbr : false,
    should_remesh: true,
    decimation_mode: input.modelType === "lowpoly" ? 4 : undefined,
    topology: input.topology,
    target_polycount: input.targetPolycount,
    symmetry_mode: input.symmetryMode,
    pose_mode: input.poseMode,
    target_formats: ["glb"],
    ...(input.texturePrompt ? { texture_prompt: input.texturePrompt } : {}),
  });
  return waitForMeshyTask(input.apiKey, `/openapi/v1/multi-image-to-3d/${taskId}`, "multi-image-to-3d");
}

export async function getRiggingTask(apiKey: string, rigTaskId: string) {
  return waitForMeshyTask(apiKey, `/openapi/v1/rigging/${rigTaskId}`, "rigging");
}

export async function createMeshyTask(apiKey: string, path: string, body: Record<string, unknown>) {
  const response = await fetch(`https://api.meshy.ai${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await response.json()) as { result?: string; message?: string };
  if (!response.ok || !json.result) {
    throw new Error(`Meshy ${path} failed: ${response.status} ${JSON.stringify(json)}`);
  }
  return json.result;
}

export async function waitForMeshyTask(apiKey: string, path: string, label: string) {
  for (;;) {
    const response = await fetch(`https://api.meshy.ai${path}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const task = (await response.json()) as MeshyTask;
    if (!response.ok) {
      throw new Error(`Meshy ${label} status failed: ${response.status} ${JSON.stringify(task)}`);
    }
    console.error(`${label}: ${task.status}${typeof task.progress === "number" ? ` ${task.progress}%` : ""}`);
    if (task.status === "SUCCEEDED") {
      return task;
    }
    if (task.status === "FAILED" || task.status === "CANCELED") {
      throw new Error(`Meshy ${label} ${task.status}: ${task.task_error?.message ?? "unknown error"}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
}

export async function downloadMeshyResultFiles(task: MeshyTask, outputDir: string) {
  const downloads: DownloadedMeshyFile[] = [];
  for (const [key, rawValue] of Object.entries(task.model_urls ?? {})) {
    if (typeof rawValue === "string" && rawValue.startsWith("http")) {
      downloads.push(await downloadMeshyUrl(`${key}_url`, rawValue, outputDir));
    }
  }
  if (task.thumbnail_url?.startsWith("http")) {
    downloads.push(await downloadMeshyUrl("thumbnail_url", task.thumbnail_url, outputDir));
  }
  if (task.video_url?.startsWith("http")) {
    downloads.push(await downloadMeshyUrl("video_url", task.video_url, outputDir));
  }
  for (const [key, rawValue] of Object.entries(task.result ?? {})) {
    if (typeof rawValue !== "string" || !rawValue.startsWith("http")) {
      continue;
    }
    downloads.push(await downloadMeshyUrl(key, rawValue, outputDir));
  }
  return downloads;
}

export function getMeshyModelUrl(task: MeshyTask, format = "glb") {
  const direct = task.model_urls?.[format];
  if (direct) {
    return direct;
  }
  const resultValue = task.result?.[`${format}_url`] ?? task.result?.[`model_${format}`];
  if (typeof resultValue === "string") {
    return resultValue;
  }
  return null;
}

async function downloadMeshyUrl(key: string, url: string, outputDir: string) {
  const extension = getUrlExtension(url) ?? ".bin";
  const outputPath = join(outputDir, `${key}${extension}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed for ${key}: ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(outputPath, bytes);
  return { key, url, path: outputPath, bytes: bytes.byteLength } satisfies DownloadedMeshyFile;
}

function getUrlExtension(url: string) {
  const path = new URL(url).pathname;
  const fileName = basename(path);
  const index = fileName.lastIndexOf(".");
  return index === -1 ? null : fileName.slice(index);
}

async function localImageToDataUri(path: string) {
  const extension = extname(path).toLowerCase();
  const mime =
    extension === ".jpg" || extension === ".jpeg"
      ? "image/jpeg"
      : extension === ".webp"
        ? "image/webp"
        : "image/png";
  const bytes = await readFile(path);
  return `data:${mime};base64,${bytes.toString("base64")}`;
}
