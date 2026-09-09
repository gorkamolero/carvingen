"use client";
/* eslint-disable @next/next/no-img-element */

import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";

import {
  DEMO_MESH_THUMB_ASSET,
  DEMO_PROMPT_OUTPUT_ASSET,
  DEMO_REFERENCE_ASSET,
  portfolioDemoGraph,
} from "@/features/demo/portfolio-demo-fixture";
import type {
  CarvingEdge,
  CarvingNode,
  ImageNode,
  MeshNode,
  PromptNode,
  ViewerNode,
} from "@/lib/graph/types";

const demoNodeTypes = {
  image: DemoImageNode,
  prompt: DemoPromptNode,
  mesh: DemoMeshNode,
  viewer: DemoViewerNode,
} as const satisfies NodeTypes;

export function PortfolioDemoScreen() {
  return (
    <main className="flex h-screen flex-col bg-[#f4efdf] text-black">
      <header className="flex min-h-[72px] flex-wrap items-center justify-between gap-3 border-b-[3px] border-black bg-[#efe8cd] px-5 py-3">
        <div>
          <p className="font-mono text-[10px] font-black uppercase tracking-[0.2em] text-black/55">
            Portfolio demo
          </p>
          <h1 className="text-[22px] font-black leading-tight">Carvingen public fixture</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] font-black uppercase tracking-[0.14em]">
          <span className="border-[3px] border-black bg-white px-2 py-1">Read-only</span>
          <span className="border-[3px] border-black bg-[#ffd400] px-2 py-1">No provider calls</span>
          <span className="border-[3px] border-black bg-[#8cff3e] px-2 py-1">Fake data</span>
        </div>
      </header>
      <section className="grid min-h-0 flex-1 grid-cols-[280px_1fr] max-lg:grid-cols-1">
        <aside className="border-r-[3px] border-black bg-[#fffdf5] p-4 max-lg:hidden">
          <div className="space-y-4">
            <DemoProof label="What this proves" value="Canvas workflow, node taxonomy, graph lineage, and 3D handoff shape." />
            <DemoProof label="What it withholds" value="Provider keys, local SQLite state, private prompts, generated outputs, and client media." />
            <DemoProof label="Source route" value="/portfolio-demo renders from a typed fixture only." />
          </div>
        </aside>
        <div className="min-h-[520px]">
          <ReactFlow
            data-testid="portfolio-demo-flow"
            nodeTypes={demoNodeTypes}
            nodes={portfolioDemoGraph.nodes as CarvingNode[]}
            edges={portfolioDemoGraph.edges as CarvingEdge[]}
            defaultViewport={portfolioDemoGraph.viewport}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            panOnDrag
            panOnScroll
            minZoom={0.05}
            maxZoom={2}
            defaultEdgeOptions={{
              type: "default",
              animated: false,
              style: {
                stroke: "#0a0a0a",
                strokeWidth: 3,
              },
            }}
          >
            <Controls showInteractive={false} position="bottom-left" />
            <MiniMap pannable zoomable maskColor="rgba(0,0,0,0.04)" nodeStrokeColor="#0a0a0a" nodeStrokeWidth={3} nodeColor="#ffd400" />
            <Background color="#0a0a0a33" gap={20} size={1.5} />
          </ReactFlow>
        </div>
      </section>
    </main>
  );
}

function DemoImageNode({ data }: NodeProps<ImageNode>) {
  return (
    <DemoNodeFrame title="Image" accentClassName="bg-[#ff6fa8]" testId="demo-image-node">
      <div className="aspect-square overflow-hidden border-[3px] border-black bg-white">
        <img src={data.previewUrl ?? DEMO_REFERENCE_ASSET} alt="Public fixture reference" className="h-full w-full object-cover" />
      </div>
      <DemoSmallText>{data.fileName ?? "public fixture reference"}</DemoSmallText>
      <DemoHandle type="source" id="image-out" side="right" />
    </DemoNodeFrame>
  );
}

function DemoPromptNode({ data }: NodeProps<PromptNode>) {
  return (
    <DemoNodeFrame title="Prompt" accentClassName="bg-[#ffd400]" testId="demo-prompt-node">
      <div className="min-h-[96px] border-[3px] border-black bg-white p-2.5 font-mono text-[13px] leading-[1.45]">
        {data.text}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <DemoBadge label="Model" value="Nano Banana 2" />
        <DemoBadge label="Aspect" value={data.aspectRatio} />
      </div>
      <div className="aspect-square overflow-hidden border-[3px] border-black bg-[#f9f5e8]">
        <img src={DEMO_PROMPT_OUTPUT_ASSET} alt="Fake generated concept render" className="h-full w-full object-cover" />
      </div>
      <button
        data-testid="portfolio-demo-run-button"
        type="button"
        disabled
        className="flex h-11 w-full items-center justify-between gap-3 border-[3px] border-black bg-[#e5dfc9] px-3 text-[12px] font-black uppercase tracking-[0.16em] text-black/45"
      >
        <span>Run disabled</span>
        <span className="font-mono text-[11px]">fixture</span>
      </button>
      <DemoHandle type="target" id="image-in" side="left" />
      <DemoHandle type="source" id="image-out" side="right" />
    </DemoNodeFrame>
  );
}

function DemoMeshNode({ data }: NodeProps<MeshNode>) {
  return (
    <DemoNodeFrame title="Mesh" accentClassName="bg-[#3e8cff]" testId="demo-mesh-node">
      <div className="grid grid-cols-2 gap-2">
        <DemoBadge label="Provider" value={data.provider ?? "meshy"} />
        <DemoBadge label="Polys" value={(data.meshyTargetPolycount ?? 3000).toLocaleString()} />
      </div>
      <div className="aspect-square overflow-hidden border-[3px] border-black bg-[#f9f5e8]">
        <img src={DEMO_MESH_THUMB_ASSET} alt="Fake mesh preview" className="h-full w-full object-cover" />
      </div>
      <button
        data-testid="portfolio-demo-mesh-run-button"
        type="button"
        disabled
        className="flex h-11 w-full items-center justify-between gap-3 border-[3px] border-black bg-[#c7d1e2] px-3 text-[12px] font-black uppercase tracking-[0.16em] text-white/70"
      >
        <span>Mesh disabled</span>
        <span className="font-mono text-[10px]">no spend</span>
      </button>
      <DemoHandle type="target" id="image-in" side="left" />
      <DemoHandle type="source" id="glb-out" side="right" />
    </DemoNodeFrame>
  );
}

function DemoViewerNode({ data }: NodeProps<ViewerNode>) {
  return (
    <DemoNodeFrame title="Viewer" accentClassName="bg-[#8cff3e]" testId="demo-viewer-node" wide>
      <div className="aspect-square overflow-hidden border-[3px] border-black bg-[#f9f5e8] p-4">
        <div className="flex h-full flex-col items-center justify-center border-[3px] border-black bg-white text-center">
          <div className="h-24 w-24 rotate-45 border-[8px] border-black bg-[#3e8cff] shadow-[14px_14px_0_0_#ffd400]" />
          <p className="mt-10 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-black/55">
            GLB viewer surface
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="border-[3px] border-black bg-black px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
          Auto-rotate: {data.autoRotate ? "on" : "off"}
        </span>
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-black/55">
          Exposure {data.exposure.toFixed(1)}
        </span>
      </div>
      <DemoHandle type="target" id="glb-in" side="left" />
    </DemoNodeFrame>
  );
}

function DemoNodeFrame({
  title,
  accentClassName,
  testId,
  wide = false,
  children,
}: {
  title: string;
  accentClassName: string;
  testId: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <article
      data-testid={testId}
      className={`relative border-[3px] border-black bg-[#fffdf5] shadow-[8px_8px_0_0_#0a0a0a] ${wide ? "w-[380px]" : "w-[320px]"}`}
    >
      <div className={`flex items-center justify-between border-b-[3px] border-black px-3 py-2 ${accentClassName}`}>
        <h2 className="text-[12px] font-black uppercase tracking-[0.18em]">{title}</h2>
        <span className="font-mono text-[9px] font-black uppercase tracking-[0.18em]">demo</span>
      </div>
      <div className="space-y-3 p-3">{children}</div>
    </article>
  );
}

function DemoProof({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-[3px] border-black bg-white p-3">
      <dt className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-black/55">{label}</dt>
      <dd className="mt-2 text-[13px] font-semibold leading-snug">{value}</dd>
    </div>
  );
}

function DemoBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-[3px] border-black bg-white px-2 py-1">
      <div className="font-mono text-[9px] font-black uppercase tracking-[0.16em] text-black/45">{label}</div>
      <div className="truncate text-[12px] font-black">{value}</div>
    </div>
  );
}

function DemoSmallText({ children }: { children: React.ReactNode }) {
  return <p className="truncate font-mono text-[11px] font-medium text-black/70">{children}</p>;
}

function DemoHandle({
  type,
  id,
  side,
}: {
  type: "source" | "target";
  id: "image-in" | "image-out" | "glb-in" | "glb-out";
  side: "left" | "right";
}) {
  return (
    <Handle
      type={type}
      id={id}
      position={side === "left" ? Position.Left : Position.Right}
      aria-hidden
      className={`absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full border-[3px] border-black bg-white ${
        side === "left" ? "-left-[13px]" : "-right-[13px]"
      }`}
    />
  );
}
