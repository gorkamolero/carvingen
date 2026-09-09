import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { Accessor, NodeIO, type Document, type Node as GltfNode } from "@gltf-transform/core";
import { dedup, prune, quantize, resample, textureCompress, weld } from "@gltf-transform/functions";
import sharp from "sharp";

type ClipInput = {
  actionId: number | null;
  name: string;
  glbPath: string;
  sourceDir: string;
};

async function main() {
  const characterDir = process.argv[2];
  if (!characterDir) {
    throw new Error("Usage: pnpm character:pack output/characters/<id> [--out path] [--texture-size 1024] [--texture-quality 70]");
  }

  const args = process.argv.slice(3);
  const outputPath = readFlag(args, "--out") ?? join(characterDir, "game", `${basename(characterDir)}.game.glb`);
  const textureSize = Number(readFlag(args, "--texture-size") ?? "1024");
  const textureQuality = Number(readFlag(args, "--texture-quality") ?? "70");
  const clips = await discoverClips(characterDir);
  if (!clips.length) {
    throw new Error(`No animation GLBs found under ${characterDir}/animations.`);
  }

  const baseClip = pickBaseClip(clips);
  const io = new NodeIO();
  const baseDoc = await io.read(baseClip.glbPath);
  renameDocumentAnimations(baseDoc, baseClip);

  for (const clip of clips) {
    if (clip.glbPath === baseClip.glbPath) {
      continue;
    }
    const sourceDoc = await io.read(clip.glbPath);
    copyAnimations(baseDoc, sourceDoc, clip);
  }

  await baseDoc.transform(
    resample(),
    weld(),
    quantize({
      quantizePosition: 14,
      quantizeNormal: 10,
      quantizeTexcoord: 12,
      quantizeWeight: 8,
    }),
    textureCompress({
      encoder: sharp,
      targetFormat: "webp",
      resize: [textureSize, textureSize],
      quality: textureQuality,
      effort: 6,
    }),
    dedup(),
    prune(),
  );

  await mkdir(dirname(outputPath), { recursive: true });
  await io.write(outputPath, baseDoc);

  const manifest = {
    characterDir,
    outputPath,
    baseClip,
    clips: clips.map((clip) => ({
      actionId: clip.actionId,
      name: clip.name,
      glbPath: clip.glbPath,
    })),
    before: await summarizeInputs(clips),
    options: {
      textureSize,
      textureQuality,
    },
    after: await inspectGlb(outputPath),
  };
  const manifestPath = outputPath.replace(/\.glb$/i, ".manifest.json");
  const viewerPath = outputPath.replace(/\.glb$/i, ".viewer.html");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(viewerPath, createGameViewerHtml(outputPath, manifest.after.animations));
  console.log(JSON.stringify({ outputPath, manifestPath, viewerPath, before: manifest.before, after: manifest.after }, null, 2));
}

async function discoverClips(characterDir: string): Promise<ClipInput[]> {
  const animationsDir = join(characterDir, "animations");
  const entries = await readdir(animationsDir, { withFileTypes: true });
  const clips: ClipInput[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const glbPath = join(animationsDir, entry.name, "animation_glb_url.glb");
    try {
      await stat(glbPath);
    } catch {
      continue;
    }
    const actionIdMatch = /^(\d+)-/.exec(entry.name);
    clips.push({
      actionId: actionIdMatch ? Number(actionIdMatch[1]) : null,
      name: entry.name.replace(/^\d+-/, ""),
      glbPath,
      sourceDir: join(animationsDir, entry.name),
    });
  }

  return clips.sort((a, b) => {
    if (a.actionId === 669) return -1;
    if (b.actionId === 669) return 1;
    return (a.actionId ?? 0) - (b.actionId ?? 0);
  });
}

function pickBaseClip(clips: ClipInput[]) {
  return clips.find((clip) => clip.actionId === 669) ?? clips[0];
}

function renameDocumentAnimations(doc: Document, clip: ClipInput) {
  for (const animation of doc.getRoot().listAnimations()) {
    animation.setName(getClipName(clip, animation.getName()));
  }
}

function copyAnimations(baseDoc: Document, sourceDoc: Document, clip: ClipInput) {
  const baseRoot = baseDoc.getRoot();
  const sourceRoot = sourceDoc.getRoot();
  const baseNodes = baseRoot.listNodes();
  const sourceNodes = sourceRoot.listNodes();
  const baseNodeByName = new Map<string, GltfNode>();
  for (const node of baseNodes) {
    const name = node.getName();
    if (name) {
      baseNodeByName.set(name, node);
    }
  }
  const buffer = baseRoot.listBuffers()[0] ?? baseDoc.createBuffer();

  for (const sourceAnimation of sourceRoot.listAnimations()) {
    const targetAnimation = baseDoc.createAnimation(getClipName(clip, sourceAnimation.getName()));

    for (const sourceSampler of sourceAnimation.listSamplers()) {
      const input = sourceSampler.getInput();
      const output = sourceSampler.getOutput();
      if (!input || !output) {
        continue;
      }
      targetAnimation.addSampler(
        baseDoc
          .createAnimationSampler()
          .setInput(copyAccessor(baseDoc, input, buffer))
          .setOutput(copyAccessor(baseDoc, output, buffer))
          .setInterpolation(sourceSampler.getInterpolation()),
      );
    }

    const sourceSamplers = sourceAnimation.listSamplers();
    const targetSamplers = targetAnimation.listSamplers();
    for (const sourceChannel of sourceAnimation.listChannels()) {
      const sourceTargetNode = sourceChannel.getTargetNode();
      const sourceTargetPath = sourceChannel.getTargetPath();
      const sourceSampler = sourceChannel.getSampler();
      if (!sourceTargetNode || !sourceTargetPath || !sourceSampler) {
        continue;
      }

      const targetNode = findTargetNode(sourceTargetNode, sourceNodes, baseNodes, baseNodeByName);
      const targetSampler = targetSamplers[sourceSamplers.indexOf(sourceSampler)];
      if (!targetNode || !targetSampler) {
        continue;
      }

      targetAnimation.addChannel(
        baseDoc
          .createAnimationChannel()
          .setTargetNode(targetNode)
          .setTargetPath(sourceTargetPath)
          .setSampler(targetSampler),
      );
    }
  }
}

function copyAccessor(baseDoc: Document, source: Accessor, buffer: ReturnType<Document["createBuffer"]>) {
  const sourceArray = source.getArray();
  if (!sourceArray) {
    throw new Error(`Animation accessor ${source.getName()} has no array.`);
  }

  return baseDoc
    .createAccessor(source.getName())
    .setArray(sourceArray.slice() as NonNullable<ReturnType<Accessor["getArray"]>>)
    .setType(source.getType())
    .setBuffer(buffer)
    .setNormalized(source.getNormalized())
    .setSparse(source.getSparse());
}

function findTargetNode(
  sourceNode: GltfNode,
  sourceNodes: GltfNode[],
  baseNodes: GltfNode[],
  baseNodeByName: Map<string, GltfNode>,
) {
  const byName = baseNodeByName.get(sourceNode.getName());
  if (byName) {
    return byName;
  }
  return baseNodes[sourceNodes.indexOf(sourceNode)] ?? null;
}

function getClipName(clip: ClipInput, fallback: string) {
  const name = normalizeClipName(clip.name || fallback);
  return clip.actionId ? `${clip.actionId}_${name}` : name;
}

function normalizeClipName(value: string) {
  return value.replace(/-/g, "_").replace(/^animation_/i, "");
}

async function summarizeInputs(clips: ClipInput[]) {
  const bytes = await Promise.all(clips.map((clip) => stat(clip.glbPath).then((stats) => stats.size)));
  return {
    clipCount: clips.length,
    bytes: bytes.reduce((total, size) => total + size, 0),
    mb: toMb(bytes.reduce((total, size) => total + size, 0)),
  };
}

async function inspectGlb(path: string) {
  const buffer = await readFile(path);
  const json = readGlbJson(buffer);
  let triangles = 0;
  let vertices = 0;
  let primitives = 0;
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      primitives += 1;
      const position = primitive.attributes?.POSITION;
      if (typeof position === "number") {
        vertices += json.accessors?.[position]?.count ?? 0;
      }
      if ((primitive.mode ?? 4) === 4 && typeof primitive.indices === "number") {
        triangles += Math.floor((json.accessors?.[primitive.indices]?.count ?? 0) / 3);
      }
    }
  }

  return {
    bytes: buffer.byteLength,
    mb: toMb(buffer.byteLength),
    meshes: json.meshes?.length ?? 0,
    primitives,
    vertices,
    triangles,
    animations: json.animations?.length ?? 0,
    images: json.images?.length ?? 0,
    materials: json.materials?.length ?? 0,
  };
}

function readGlbJson(buffer: Buffer) {
  if (buffer.toString("utf8", 0, 4) !== "glTF") {
    throw new Error("Expected GLB input.");
  }
  const jsonLength = buffer.readUInt32LE(12);
  const chunkType = buffer.readUInt32LE(16);
  if (chunkType !== 0x4e4f534a) {
    throw new Error("Expected GLB JSON chunk.");
  }
  return JSON.parse(buffer.toString("utf8", 20, 20 + jsonLength)) as {
    meshes?: Array<{ primitives?: Array<{ attributes?: { POSITION?: number }; indices?: number; mode?: number }> }>;
    accessors?: Array<{ count?: number }>;
    animations?: unknown[];
    images?: unknown[];
    materials?: unknown[];
  };
}

function dirname(path: string) {
  const index = path.lastIndexOf("/");
  return index === -1 ? "." : path.slice(0, index);
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

function toMb(bytes: number) {
  return Number((bytes / 1024 / 1024).toFixed(2));
}

function createGameViewerHtml(outputPath: string, animationCount: number) {
  const modelFile = basename(outputPath);
  const title = basename(outputPath).replace(/\.glb$/i, "");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js"></script>
    <style>
      :root {
        color-scheme: dark;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #111;
        color: #f7f2e8;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        grid-template-rows: auto 1fr;
      }

      header {
        display: flex;
        gap: 12px;
        align-items: center;
        padding: 12px 16px;
        background: #181818;
        border-bottom: 1px solid #303030;
      }

      h1 {
        margin: 0;
        font-size: 15px;
        font-weight: 650;
      }

      select,
      button {
        height: 34px;
        border: 1px solid #454545;
        background: #252525;
        color: #f7f2e8;
        border-radius: 6px;
        padding: 0 10px;
        font: inherit;
      }

      model-viewer {
        width: 100%;
        height: 100%;
        min-height: 640px;
        background: radial-gradient(circle at 50% 18%, #343434 0, #171717 52%, #101010 100%);
      }

      .meta {
        margin-left: auto;
        color: #b8b0a4;
        font-size: 12px;
      }
    </style>
  </head>
  <body>
    <header>
      <h1>${escapeHtml(title)}</h1>
      <select id="animationSelect" aria-label="Animation"></select>
      <button id="playPause" type="button">Pause</button>
      <span class="meta">${animationCount} animations in one optimized GLB</span>
    </header>
    <model-viewer
      id="viewer"
      src="./${escapeHtml(modelFile)}"
      camera-controls
      autoplay
      ar
      shadow-intensity="1"
      exposure="1"
      environment-image="neutral"
    ></model-viewer>
    <script>
      const viewer = document.querySelector("#viewer");
      const select = document.querySelector("#animationSelect");
      const playPause = document.querySelector("#playPause");

      viewer.addEventListener("load", () => {
        const animations = viewer.availableAnimations || [];
        select.replaceChildren(...animations.map((name) => {
          const option = document.createElement("option");
          option.value = name;
          option.textContent = name;
          return option;
        }));
        if (animations.length) {
          viewer.animationName = animations[0];
          select.value = animations[0];
          viewer.play();
        }
      });

      select.addEventListener("change", () => {
        viewer.animationName = select.value;
        viewer.currentTime = 0;
        viewer.play();
        playPause.textContent = "Pause";
      });

      playPause.addEventListener("click", () => {
        if (viewer.paused) {
          viewer.play();
          playPause.textContent = "Pause";
        } else {
          viewer.pause();
          playPause.textContent = "Play";
        }
      });
    </script>
  </body>
</html>
`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
