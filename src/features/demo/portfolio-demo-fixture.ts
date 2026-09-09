import type { ProjectGraph } from "@/lib/graph/types";

function svgDataUrl(svg: string) {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const DEMO_REFERENCE_ASSET = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 720">
  <rect width="720" height="720" fill="#f4efdf"/>
  <path d="M150 520c90-220 240-340 420-360-28 142-92 258-192 348-70 62-147 89-228 12Z" fill="#3d2415" stroke="#0a0a0a" stroke-width="18"/>
  <path d="M264 409c74-34 135-91 183-171" fill="none" stroke="#ffd400" stroke-width="20" stroke-linecap="round"/>
  <circle cx="465" cy="210" r="28" fill="#ff6fa8" stroke="#0a0a0a" stroke-width="12"/>
  <path d="M142 545c82 42 182 42 300 0" fill="none" stroke="#0a0a0a" stroke-width="16" stroke-linecap="round"/>
</svg>
`);

export const DEMO_PROMPT_OUTPUT_ASSET = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 720">
  <rect width="720" height="720" fill="#fffdf5"/>
  <rect x="76" y="74" width="568" height="568" rx="28" fill="#f4efdf" stroke="#0a0a0a" stroke-width="18"/>
  <path d="M194 514c48-196 158-310 330-342-12 118-59 220-141 305-57 59-121 79-189 37Z" fill="#6b3f25" stroke="#0a0a0a" stroke-width="16"/>
  <path d="M275 416c72-37 127-93 167-169" fill="none" stroke="#ffd400" stroke-width="18" stroke-linecap="round"/>
  <path d="M236 522c65 30 144 29 238-5" fill="none" stroke="#0a0a0a" stroke-width="12" stroke-linecap="round"/>
  <circle cx="458" cy="225" r="25" fill="#3e8cff" stroke="#0a0a0a" stroke-width="10"/>
  <text x="102" y="632" font-family="monospace" font-size="24" font-weight="700" fill="#0a0a0a">fake concept render</text>
</svg>
`);

export const DEMO_MESH_THUMB_ASSET = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 720">
  <rect width="720" height="720" fill="#eaf2ff"/>
  <path d="M360 112 566 232v248L360 608 154 480V232Z" fill="#3e8cff" stroke="#0a0a0a" stroke-width="18"/>
  <path d="M360 112v248l206 120M360 360 154 480M360 360 154 232M360 360l206-128" fill="none" stroke="#fffdf5" stroke-width="14" stroke-linecap="round"/>
  <path d="M250 452c45 38 111 49 198 27" fill="none" stroke="#ffd400" stroke-width="16" stroke-linecap="round"/>
  <text x="128" y="638" font-family="monospace" font-size="24" font-weight="700" fill="#0a0a0a">fake mesh preview</text>
</svg>
`);

export const portfolioDemoGraph = {
  id: "portfolio-demo",
  name: "Portfolio demo - public fixture",
  viewport: { x: 80, y: 42, zoom: 0.74 },
  nodes: [
    {
      id: "demo-reference",
      type: "image",
      position: { x: 0, y: 115 },
      data: {
        assetId: DEMO_REFERENCE_ASSET,
        previewUrl: DEMO_REFERENCE_ASSET,
        fileName: "public-fixture-reference.svg",
        width: 720,
        height: 720,
        isUploading: false,
        errorMessage: null,
        collapsed: false,
      },
    },
    {
      id: "demo-prompt",
      type: "prompt",
      position: { x: 390, y: 0 },
      data: {
        text: "Design a walnut relief carving that keeps the original leaf silhouette, adds a lunar inlay, and simplifies the contour so the form can be carved by hand.",
        model: "fal-ai/nano-banana-2",
        aspectRatio: "1:1",
        resolution: "1K",
        seed: 4281,
        activeJobId: null,
        outputAssetIds: [DEMO_PROMPT_OUTPUT_ASSET],
        activeAssetId: DEMO_PROMPT_OUTPUT_ASSET,
        versionMetadata: {
          [DEMO_PROMPT_OUTPUT_ASSET]: {
            prompt:
              "Design a walnut relief carving that keeps the original leaf silhouette, adds a lunar inlay, and simplifies the contour so the form can be carved by hand.",
            model: "fal-ai/nano-banana-2",
            aspectRatio: "1:1",
            resolution: "1K",
            seed: 4281,
            referenceAssetIds: [DEMO_REFERENCE_ASSET],
            createdAt: 1793476800000,
          },
        },
        inputsChangedSinceLastRun: false,
        runStatus: "Demo fixture",
        errorMessage: null,
        lastRunCost: 0,
        collapsed: false,
        chainSources: false,
      },
    },
    {
      id: "demo-mesh",
      type: "mesh",
      position: { x: 800, y: 34 },
      data: {
        mode: "preview",
        provider: "meshy",
        meshyUseMultiview: false,
        meshyPolyMode: "low",
        meshyTopology: "triangle",
        meshyTargetPolycount: 3000,
        meshySymmetryMode: "auto",
        meshyShouldRemesh: true,
        meshyShouldTexture: true,
        meshyEnablePbr: false,
        meshyPoseMode: "",
        meshyEnableRigging: false,
        meshyRiggingHeightMeters: 1.7,
        meshyEnableAnimation: false,
        meshyAnimationActionId: 1001,
        hunyuanViewSlots: ["front"],
        hunyuanGenerateType: "Normal",
        hunyuanEnablePbr: false,
        hunyuanFaceCount: 500000,
        activeJobId: null,
        outputAssetId: null,
        artifactAssetIds: {},
        thumbnailAssetId: DEMO_MESH_THUMB_ASSET,
        inputsChangedSinceLastRun: false,
        runStatus: "Demo fixture",
        errorMessage: null,
        collapsed: false,
        autoRotate: true,
        exposure: 1,
      },
    },
    {
      id: "demo-viewer",
      type: "viewer",
      position: { x: 1200, y: 120 },
      data: {
        autoRotate: true,
        exposure: 1,
        collapsed: false,
      },
    },
  ],
  edges: [
    {
      id: "demo-reference-to-prompt",
      source: "demo-reference",
      sourceHandle: "image-out",
      target: "demo-prompt",
      targetHandle: "image-in",
      data: { kind: "image" },
    },
    {
      id: "demo-prompt-to-mesh",
      source: "demo-prompt",
      sourceHandle: "image-out",
      target: "demo-mesh",
      targetHandle: "image-in",
      data: { kind: "image" },
    },
    {
      id: "demo-mesh-to-viewer",
      source: "demo-mesh",
      sourceHandle: "glb-out",
      target: "demo-viewer",
      targetHandle: "glb-in",
      data: { kind: "glb" },
    },
  ],
} satisfies ProjectGraph;
