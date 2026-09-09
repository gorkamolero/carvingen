import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { z } from "zod";

import { loadLocalEnvFile } from "@/lib/load-local-env";
import {
  createAnimationTask,
  createMultiImageTo3DTask,
  createRiggingTask,
  downloadMeshyResultFiles,
  getMeshyModelUrl,
  getRiggingTask,
  type DownloadedMeshyFile,
  type MeshyTask,
} from "@/lib/meshy/native";

loadLocalEnvFile(process.cwd());

import type { getAssetById as getAssetByIdType } from "@/lib/db/repositories/assets";
import type { runWorkflow as runWorkflowType, WorkflowDefinition, WorkflowSummary } from "@/lib/workflow/runner";

type RuntimeImports = {
  getAssetById: typeof getAssetByIdType;
  runWorkflow: typeof runWorkflowType;
};

const viewSchema = z.object({
  front: z.string().min(1),
  back: z.string().min(1),
  left: z.string().min(1),
  right: z.string().min(1),
});

const animationSchema = z.object({
  actionId: z.number().int().positive(),
  name: z.string().min(1),
  role: z.string().min(1).optional(),
});

const characterSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  views: viewSchema.optional(),
  modelUrl: z.url().optional(),
  modelPath: z.string().min(1).optional(),
  rigTaskId: z.string().min(1).optional(),
  heightMeters: z.number().positive().optional(),
  targetPolycount: z.number().int().positive().optional(),
  outputDir: z.string().min(1).optional(),
  animations: z.array(animationSchema).optional(),
});

const defaultAnimations = [
  { actionId: 669, name: "Slow_Orc_Walk_inplace", role: "locomotion_inplace" },
  { actionId: 54, name: "Squat_Stance", role: "squat" },
  { actionId: 172, name: "Electrocution_Reaction", role: "hazard_reaction" },
  { actionId: 181, name: "Electrocuted_Fall", role: "hazard_fall" },
  { actionId: 525, name: "Cautious_Crouch_Walk_Left", role: "crouch_locomotion" },
  { actionId: 258, name: "CrouchLookAroundBow", role: "crouch_idle" },
  { actionId: 549, name: "Crawl_Backward", role: "crawl" },
  { actionId: 441, name: "Climb_Stairs", role: "stairs_up" },
  { actionId: 60, name: "Walk_to_Sit", role: "sit_down" },
  { actionId: 33, name: "Chair_Sit_Idle_M", role: "sit_idle" },
] satisfies z.infer<typeof animationSchema>[];

const manifestSchema = z.object({
  concurrency: z.number().int().positive().default(1),
  falStorageInputs: z.boolean().default(true),
  makeViewer: z.boolean().default(true),
  animationFps: z.number().int().positive().default(30),
  animations: z.array(animationSchema).default(defaultAnimations),
  mesh: z
    .object({
      modelType: z.enum(["standard", "lowpoly"]).default("lowpoly"),
      topology: z.enum(["triangle", "quad"]).default("triangle"),
      targetPolycount: z.number().int().positive().default(3000),
      symmetryMode: z.enum(["off", "auto", "on"]).default("auto"),
      poseMode: z.enum(["", "a-pose", "t-pose"]).default("t-pose"),
      heightMeters: z.number().positive().default(1.45),
      enablePbr: z.boolean().default(false),
    })
    .default({
      modelType: "lowpoly",
      topology: "triangle",
      targetPolycount: 3000,
      symmetryMode: "auto",
      poseMode: "t-pose",
      heightMeters: 1.45,
      enablePbr: false,
    }),
  characters: z.array(characterSchema).min(1),
});

type CharacterManifest = z.infer<typeof manifestSchema>;
type CharacterConfig = z.infer<typeof characterSchema>;
type AnimationConfig = z.infer<typeof animationSchema>;

type CharacterResult =
  | {
      ok: true;
      characterId: string;
      projectId: string | null;
      modelUrl: string;
      modelPath: string | null;
      rigTaskId: string;
      animations: AnimationResult[];
      viewerPath: string | null;
      summaryPath: string;
    }
  | {
      ok: false;
      characterId: string;
      error: string;
    };

type AnimationResult = {
  actionId: number;
  name: string;
  role: string | null;
  outputDir: string;
  animationTaskId: string;
  downloads: DownloadedMeshyFile[];
  manifestPath: string;
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifestPath = options.manifestPath;
  if (!manifestPath) {
    throw new Error("Usage: pnpm characters <characters.json> [--plan] [--concurrency N]");
  }

  const manifest = manifestSchema.parse(await importJson(manifestPath));
  const runtime = await loadRuntimeImports();
  if (options.concurrency) {
    manifest.concurrency = options.concurrency;
  }

  if (options.plan) {
    console.log(JSON.stringify(planBatch(manifest), null, 2));
    return;
  }

  const results = await runPool(manifest.characters, manifest.concurrency, async (character) => {
    try {
      return await runCharacter(character, manifest, runtime);
    } catch (error) {
      return {
        ok: false,
        characterId: character.id,
        error: error instanceof Error ? error.message : String(error),
      } satisfies CharacterResult;
    }
  });

  const batchOutputDir = join("output", "characters", "batch");
  await mkdir(batchOutputDir, { recursive: true });
  const batchSummaryPath = join(batchOutputDir, `batch-${Date.now()}.json`);
  await writeFile(batchSummaryPath, `${JSON.stringify(results, null, 2)}\n`);
  await writeBatchIndex(results, join(batchOutputDir, "index.html"));

  console.log(JSON.stringify({ batchSummaryPath, results }, null, 2));
}

async function loadRuntimeImports(): Promise<RuntimeImports> {
  const [{ getAssetById }, { runWorkflow }] = await Promise.all([
    import("@/lib/db/repositories/assets"),
    import("@/lib/workflow/runner"),
  ]);
  return { getAssetById, runWorkflow };
}

function parseArgs(args: string[]) {
  const manifestPath = args.find((arg) => !arg.startsWith("-"));
  const concurrencyValue = readFlag(args, "--concurrency");
  return {
    manifestPath,
    plan: args.includes("--plan"),
    concurrency: concurrencyValue ? Number(concurrencyValue) : undefined,
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

function planBatch(manifest: CharacterManifest) {
  const characters = manifest.characters.map((character) => {
    const animations = character.animations?.length ? character.animations : manifest.animations;
    const meshCredits = character.modelUrl ? 0 : 30;
    const rigCredits = character.rigTaskId ? 0 : 5;
    const animationCredits = animations.length * 3;
    return {
      id: character.id,
      name: character.name ?? character.id,
      steps: {
        mesh: character.modelUrl ? "reuse-model-url" : "low-poly-textured-multiview",
        rig: character.rigTaskId ? "reuse-rig-task" : "native-meshy-rig",
        animations: animations.map((animation) => animation.actionId),
      },
      estimatedCredits: meshCredits + rigCredits + animationCredits,
    };
  });

  return {
    concurrency: manifest.concurrency,
    characterCount: manifest.characters.length,
    estimatedCredits: characters.reduce((total, character) => total + character.estimatedCredits, 0),
    characters,
  };
}

async function importJson(path: string) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function runCharacter(
  character: CharacterConfig,
  manifest: CharacterManifest,
  runtime: RuntimeImports,
): Promise<CharacterResult> {
  const apiKey = process.env.MESHY_API_KEY;
  if (!apiKey) {
    throw new Error("MESHY_API_KEY is required.");
  }

  const outputRoot = character.outputDir ?? join("output", "characters", character.id);
  const modelsDir = join(outputRoot, "models");
  const animationsDir = join(outputRoot, "animations");
  const manifestsDir = join(outputRoot, "manifests");
  await mkdir(modelsDir, { recursive: true });
  await mkdir(animationsDir, { recursive: true });
  await mkdir(manifestsDir, { recursive: true });

  const meshResult = character.modelUrl
    ? {
        projectId: null,
        summary: null,
        modelUrl: character.modelUrl,
        modelPath: character.modelPath ?? null,
      }
    : await generateLowPolyModel(character, manifest, modelsDir, manifestsDir, runtime);

  const localModelPath = meshResult.modelPath
    ? await copyModelToCharacterDir(meshResult.modelPath, join(modelsDir, `${character.id}-low-poly${getExtension(meshResult.modelPath)}`))
    : null;

  const rigTask = character.rigTaskId
    ? await getRiggingTask(apiKey, character.rigTaskId)
    : await createRiggingTask({
        apiKey,
        modelUrl: meshResult.modelUrl,
        heightMeters: character.heightMeters ?? manifest.mesh.heightMeters,
      });

  const animationConfigs = character.animations?.length ? character.animations : manifest.animations;
  const animations: AnimationResult[] = [];
  for (const animation of animationConfigs) {
    animations.push(
      await runAnimation({
        apiKey,
        character,
        animation,
        rigTask,
        animationsDir,
        fps: manifest.animationFps,
        heightMeters: character.heightMeters ?? manifest.mesh.heightMeters,
        modelUrl: meshResult.modelUrl,
      }),
    );
  }

  const viewerPath = manifest.makeViewer
    ? await writeCharacterViewer({
        character,
        outputRoot,
        modelPath: localModelPath,
        animations,
      })
    : null;

  const summaryPath = join(manifestsDir, "character-summary.json");
  const result = {
    ok: true,
    characterId: character.id,
    projectId: meshResult.projectId,
    modelUrl: meshResult.modelUrl,
    modelPath: localModelPath,
    rigTaskId: rigTask.id,
    animations,
    viewerPath,
    summaryPath,
  } satisfies CharacterResult;
  await writeFile(summaryPath, `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

async function generateLowPolyModel(
  character: CharacterConfig,
  manifest: CharacterManifest,
  modelsDir: string,
  manifestsDir: string,
  runtime: RuntimeImports,
) {
  if (!character.views) {
    throw new Error(`${character.id} requires either views or modelUrl.`);
  }

  const nativeMesh = await generateNativeMeshyLowPolyModel(character, manifest, modelsDir, manifestsDir);
  if (nativeMesh) {
    return nativeMesh;
  }

  const workflow = buildCharacterWorkflow(character, manifest);
  const summary = await runtime.runWorkflow(workflow, {
    falStorageInputs: manifest.falStorageInputs,
  });
  const workflowSummaryPath = join(manifestsDir, "workflow-summary.json");
  await writeFile(workflowSummaryPath, `${JSON.stringify(summary, null, 2)}\n`);

  const glbAssetId = getMeshOutputAssetId(summary);
  const asset = await runtime.getAssetById(glbAssetId);
  if (!asset?.sourceUrl) {
    throw new Error(`Could not resolve source URL for GLB asset ${glbAssetId}.`);
  }

  const modelPath = await copyModelToCharacterDir(asset.localPath, join(modelsDir, `${character.id}-low-poly.glb`));
  return {
    projectId: summary.projectId,
    summary,
    modelUrl: asset.sourceUrl,
    modelPath,
  };
}

async function generateNativeMeshyLowPolyModel(
  character: CharacterConfig,
  manifest: CharacterManifest,
  modelsDir: string,
  manifestsDir: string,
) {
  if (!character.views) {
    return null;
  }
  const apiKey = process.env.MESHY_API_KEY;
  if (!apiKey) {
    return null;
  }

  const mesh = manifest.mesh;
  const task = await createMultiImageTo3DTask({
    apiKey,
    imagePaths: [character.views.front, character.views.back, character.views.left, character.views.right],
    modelType: mesh.modelType,
    shouldTexture: true,
    enablePbr: mesh.enablePbr,
    topology: mesh.topology,
    targetPolycount: character.targetPolycount ?? mesh.targetPolycount,
    symmetryMode: mesh.symmetryMode,
    poseMode: mesh.poseMode,
    texturePrompt: `${character.name ?? character.id}. Stylized low-poly game character, preserve the four-view costume colors and proportions.`,
  });
  const downloads = await downloadMeshyResultFiles(task, modelsDir);
  const glbDownload = findDownload(downloads, "glb_url") ?? downloads.find((download) => download.path.endsWith(".glb"));
  const modelUrl = getMeshyModelUrl(task, "glb") ?? glbDownload?.url;
  if (!modelUrl) {
    throw new Error(`Meshy multi-image task ${task.id} did not return a GLB model URL.`);
  }
  const modelPath = glbDownload
    ? await copyModelToCharacterDir(glbDownload.path, join(modelsDir, `${character.id}-low-poly.glb`))
    : null;
  const summaryPath = join(manifestsDir, "native-meshy-summary.json");
  await writeFile(
    summaryPath,
    `${JSON.stringify(
      {
        provider: "meshy-native",
        task,
        downloads,
        modelUrl,
        modelPath,
      },
      null,
      2,
    )}\n`,
  );
  return {
    projectId: task.id,
    summary: null,
    modelUrl,
    modelPath,
  };
}

function buildCharacterWorkflow(character: CharacterConfig, manifest: CharacterManifest): WorkflowDefinition {
  if (!character.views) {
    throw new Error(`${character.id} requires views to build a workflow.`);
  }

  const mesh = manifest.mesh;
  const name = character.name ?? character.id;

  return {
    project: {
      name: `${name} Low Poly Textured`,
      mode: "create",
    },
    assets: [
      { id: "front", path: character.views.front, kind: "image" },
      { id: "back", path: character.views.back, kind: "image" },
      { id: "left", path: character.views.left, kind: "image" },
      { id: "right", path: character.views.right, kind: "image" },
    ],
    nodes: [
      { id: "image_front", type: "image", asset: "front", position: { x: 0, y: 0 }, data: {}, run: false },
      { id: "image_back", type: "image", asset: "back", position: { x: 0, y: 180 }, data: {}, run: false },
      { id: "image_left", type: "image", asset: "left", position: { x: 0, y: 360 }, data: {}, run: false },
      { id: "image_right", type: "image", asset: "right", position: { x: 0, y: 540 }, data: {}, run: false },
      {
        id: "mesh_character",
        type: "mesh",
        run: true,
        position: { x: 420, y: 220 },
        data: {
          provider: "meshy",
          mode: "preview",
          meshyUseMultiview: true,
          meshyPolyMode: "low",
          meshyTopology: mesh.topology,
          meshyTargetPolycount: character.targetPolycount ?? mesh.targetPolycount,
          meshySymmetryMode: mesh.symmetryMode,
          meshyShouldRemesh: true,
          meshyShouldTexture: true,
          meshyEnablePbr: mesh.enablePbr,
          meshyPoseMode: mesh.poseMode,
          meshyEnableRigging: false,
          meshyRiggingHeightMeters: character.heightMeters ?? mesh.heightMeters,
          meshyEnableAnimation: false,
          meshyAnimationActionId: 1001,
        },
      },
    ],
    edges: ["front", "back", "left", "right"].map((view) => ({
      source: `image_${view}`,
      sourceHandle: "image-out",
      target: "mesh_character",
      targetHandle: "image-in",
    })),
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

function getMeshOutputAssetId(summary: WorkflowSummary) {
  for (const node of summary.graph.nodes) {
    if (node.type !== "mesh") {
      continue;
    }
    const glb = node.data.artifactAssetIds.glb ?? node.data.outputAssetId;
    if (glb) {
      return glb;
    }
  }
  throw new Error("Workflow did not produce a GLB asset.");
}

async function runAnimation(input: {
  apiKey: string;
  character: CharacterConfig;
  animation: AnimationConfig;
  rigTask: MeshyTask;
  animationsDir: string;
  fps: number;
  heightMeters: number;
  modelUrl: string;
}) {
  const outputDir = join(
    input.animationsDir,
    `${input.animation.actionId}-${slugify(input.animation.name)}`,
  );
  await mkdir(outputDir, { recursive: true });

  const animationTask = await createAnimationTask({
    apiKey: input.apiKey,
    rigTaskId: input.rigTask.id,
    actionId: input.animation.actionId,
    fps: input.fps,
  });
  const downloads = await downloadMeshyResultFiles(animationTask, outputDir);
  const manifest = {
    modelUrl: input.modelUrl,
    actionId: input.animation.actionId,
    name: input.animation.name,
    role: input.animation.role ?? null,
    heightMeters: input.heightMeters,
    fps: input.fps,
    rigTask: input.rigTask,
    animationTask,
    downloads,
  };
  const manifestPath = join(outputDir, `animation-${input.animation.actionId}.manifest.json`);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    actionId: input.animation.actionId,
    name: input.animation.name,
    role: input.animation.role ?? null,
    outputDir,
    animationTaskId: animationTask.id,
    downloads,
    manifestPath,
  } satisfies AnimationResult;
}

async function copyModelToCharacterDir(sourcePath: string, targetPath: string) {
  await mkdir(dirname(targetPath), { recursive: true });
  if (sourcePath !== targetPath) {
    await copyFile(sourcePath, targetPath);
  }
  return targetPath;
}

async function writeCharacterViewer(input: {
  character: CharacterConfig;
  outputRoot: string;
  modelPath: string | null;
  animations: AnimationResult[];
}) {
  const viewerPath = join(input.outputRoot, "viewer.html");
  const title = input.character.name ?? input.character.id;
  const clips = [
    ...(input.modelPath
      ? [
          {
            id: "base",
            name: "Low Poly Textured",
            role: "static",
            glb: relativeFrom(input.outputRoot, input.modelPath),
            fbx: null,
          },
        ]
      : []),
    ...input.animations.map((animation) => ({
      id: animation.actionId,
      name: animation.name,
      role: animation.role,
      glb: relativeFrom(input.outputRoot, findDownload(animation.downloads, "animation_glb_url")?.path),
      fbx: relativeFrom(input.outputRoot, findDownload(animation.downloads, "processed_animation_fps_fbx_url")?.path),
    })),
  ];

  await writeFile(viewerPath, buildViewerHtml(title, clips), "utf8");
  return viewerPath;
}

async function writeBatchIndex(results: CharacterResult[], outputPath: string) {
  const links = results
    .map((result) => {
      if (!result.ok || !result.viewerPath) {
        return `<li><span>${escapeHtml(result.characterId)}</span> <strong>failed</strong></li>`;
      }
      const href = `../${result.characterId}/viewer.html`;
      return `<li><a href="${href}">${escapeHtml(result.characterId)}</a></li>`;
    })
    .join("\n");
  await writeFile(
    outputPath,
    `<!doctype html><html lang="en"><meta charset="utf-8"><title>Character Batch</title><body><h1>Character Batch</h1><ul>${links}</ul></body></html>\n`,
  );
}

function buildViewerHtml(
  title: string,
  clips: Array<{ id: string | number; name: string; role: string | null; glb: string | null; fbx: string | null }>,
) {
  const initial = clips.find((clip) => clip.id !== "base") ?? clips[0];
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} Animation Viewer</title>
  <script type="module" src="https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js"></script>
  <style>
    :root { color-scheme: dark; --bg:#111; --panel:#1b1b1b; --panel2:#242424; --line:#3a3a3a; --text:#f2f2f2; --muted:#aaa; --accent:#f0762b; --gold:#ffd166; }
    * { box-sizing: border-box; }
    body { margin:0; min-height:100vh; background:var(--bg); color:var(--text); font-family:Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { display:grid; grid-template-columns:minmax(280px,360px) minmax(0,1fr); min-height:100vh; }
    aside { border-right:1px solid var(--line); background:var(--panel); padding:16px; overflow:auto; }
    h1 { margin:0 0 4px; font-size:20px; line-height:1.2; letter-spacing:0; }
    .meta { margin:0 0 16px; color:var(--muted); font-size:13px; line-height:1.4; }
    .clip-list { display:grid; gap:8px; }
    .clip { width:100%; min-height:52px; display:grid; grid-template-columns:56px minmax(0,1fr) auto; align-items:center; gap:10px; padding:8px; border:1px solid var(--line); border-radius:8px; background:var(--panel2); color:var(--text); text-align:left; cursor:pointer; }
    .clip[aria-pressed="true"] { border-color:var(--accent); box-shadow:inset 3px 0 0 var(--accent); }
    .id { display:grid; place-items:center; height:36px; border-radius:6px; background:#121212; color:var(--gold); font-size:13px; font-variant-numeric:tabular-nums; }
    .name { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:14px; line-height:1.2; }
    .role { display:block; margin-top:3px; color:var(--muted); font-size:12px; line-height:1.2; }
    .stage { min-height:100vh; display:grid; grid-template-rows:minmax(0,1fr) auto; background:linear-gradient(#252525 1px,transparent 1px),linear-gradient(90deg,#252525 1px,transparent 1px),#151515; background-size:48px 48px; }
    model-viewer { width:100%; height:100%; min-height:520px; background:transparent; }
    .controls { display:flex; flex-wrap:wrap; align-items:center; gap:10px; min-height:72px; padding:12px 16px; border-top:1px solid var(--line); background:rgba(17,17,17,.92); }
    .controls button,.controls a,.controls label { min-height:40px; border:1px solid var(--line); border-radius:8px; background:var(--panel2); color:var(--text); font-size:14px; }
    .controls button,.controls a { display:inline-flex; align-items:center; justify-content:center; padding:0 14px; text-decoration:none; cursor:pointer; }
    .controls label { display:inline-flex; align-items:center; gap:8px; padding:0 10px; }
    input[type="range"] { width:140px; accent-color:var(--accent); }
    .now { margin-left:auto; color:var(--muted); font-size:13px; }
    @media (max-width:800px) { main { grid-template-columns:1fr; } aside { max-height:42vh; border-right:0; border-bottom:1px solid var(--line); } .stage { min-height:58vh; } model-viewer { min-height:420px; } .now { width:100%; margin-left:0; } }
  </style>
</head>
<body>
  <main>
    <aside><h1>${escapeHtml(title)}</h1><p class="meta">Low-poly character animation viewer.</p><div id="clipList" class="clip-list"></div></aside>
    <section class="stage">
      <model-viewer id="viewer" src="${escapeHtml(initial?.glb ?? "")}" camera-controls autoplay animation-crossfade-duration="250" shadow-intensity="0.7" exposure="0.95" camera-orbit="20deg 74deg 5.6m" field-of-view="32deg"></model-viewer>
      <div class="controls">
        <button id="playButton" type="button">Pause</button>
        <button id="resetButton" type="button">Reset Camera</button>
        <label>Speed <input id="speedInput" type="range" min="0.25" max="1.5" value="1" step="0.05" /></label>
        <a id="glbLink" href="${escapeHtml(initial?.glb ?? "")}">GLB</a>
        <a id="fbxLink" href="${escapeHtml(initial?.fbx ?? "#")}">FBX 30fps</a>
        <span id="now" class="now"></span>
      </div>
    </section>
  </main>
  <script>
    const clips = ${JSON.stringify(clips)};
    const viewer = document.querySelector("#viewer");
    const list = document.querySelector("#clipList");
    const playButton = document.querySelector("#playButton");
    const resetButton = document.querySelector("#resetButton");
    const speedInput = document.querySelector("#speedInput");
    const glbLink = document.querySelector("#glbLink");
    const fbxLink = document.querySelector("#fbxLink");
    const now = document.querySelector("#now");
    let activeId = clips.find((clip) => clip.id !== "base")?.id ?? clips[0]?.id;
    function renderList() {
      list.innerHTML = "";
      for (const clip of clips) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "clip";
        button.setAttribute("aria-pressed", String(clip.id === activeId));
        button.innerHTML = '<span class="id">' + clip.id + '</span><span><span class="name">' + clip.name + '</span><span class="role">' + (clip.role || "") + '</span></span><span>›</span>';
        button.addEventListener("click", () => selectClip(clip.id));
        list.appendChild(button);
      }
    }
    function selectClip(id) {
      const clip = clips.find((candidate) => candidate.id === id);
      if (!clip || !clip.glb) return;
      activeId = id;
      viewer.src = clip.glb;
      viewer.timeScale = Number(speedInput.value);
      viewer.autoplay = id !== "base";
      playButton.textContent = id === "base" ? "Play" : "Pause";
      glbLink.href = clip.glb;
      fbxLink.href = clip.fbx || "#";
      fbxLink.style.display = clip.fbx ? "inline-flex" : "none";
      now.textContent = clip.id + " " + clip.name;
      renderList();
    }
    playButton.addEventListener("click", () => {
      if (viewer.paused) { viewer.play(); playButton.textContent = "Pause"; }
      else { viewer.pause(); playButton.textContent = "Play"; }
    });
    resetButton.addEventListener("click", () => { viewer.cameraOrbit = "20deg 74deg 5.6m"; viewer.fieldOfView = "32deg"; });
    speedInput.addEventListener("input", () => { viewer.timeScale = Number(speedInput.value); });
    viewer.addEventListener("load", () => { viewer.timeScale = Number(speedInput.value); if (activeId !== "base") viewer.play(); });
    renderList();
    if (activeId !== undefined) selectClip(activeId);
  </script>
</body>
</html>
`;
}

function findDownload(downloads: DownloadedMeshyFile[], key: string) {
  return downloads.find((download) => download.key === key) ?? null;
}

function relativeFrom(base: string, path: string | null | undefined) {
  if (!path) {
    return null;
  }
  let relative = path.startsWith(`${base}/`) ? path.slice(base.length + 1) : path;
  if (relative.startsWith("/")) {
    relative = relative.slice(1);
  }
  return relative;
}

function getExtension(path: string) {
  const fileName = basename(path);
  const index = fileName.lastIndexOf(".");
  return index === -1 ? ".glb" : fileName.slice(index);
}

function slugify(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}

async function runPool<T, U>(items: T[], concurrency: number, worker: (item: T) => Promise<U>) {
  const results: U[] = [];
  let cursor = 0;

  async function runNext() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runNext));
  return results;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
