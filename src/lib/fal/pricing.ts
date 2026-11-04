import { TRIPO_CREDITS } from "@/lib/tripo/presets";
import type { CarvingNode } from "@/lib/graph/types";
import { IMAGE_MODEL_CAPABILITIES } from "./models";
import { viewPrompts } from "@/lib/character/fal";
// Prices from each fal model page, checked 2026-11-03 (see docs/COSTS.md).
export const CHARACTER_PRICES = {
  motion: { unitPrice: 0.28, unit: "take (5 s, 768P)" },
  p2: { unitPrice: 1.1, unit: "model, standard textures" }, h31: { unitPrice: 0.3, unit: "model, standard textures" },
  remesh: { unitPrice: 0.01, unit: "unit" }, rig: { unitPrice: 0.2, unit: "request" },
  animate: { unitPrice: 0.2, unit: "request + $0.12 per clip" }, multiview: { unitPrice: 0.08, unit: "image" },
  bake: { unitPrice: 0, unit: "local" }, export: { unitPrice: 0, unit: "local" }, animation: { unitPrice: 0, unit: "upload" },
} as const;
export function estimateNodeCost(node: Pick<CarvingNode, "type" | "data">): { usd: number | null; label: string } {
  const d = node.data;
  if (node.type === "motion" && "takeBudget" in d) { const usd = Math.round(d.takeBudget * 28) / 100; return { usd, label: `up to ~$${usd.toFixed(2)} · ${d.takeBudget} takes` }; }
  if ((node.type === "prompt" && "model" in d && d.model === "codex/gpt-image") || (node.type === "multiview" && "imageModel" in d && d.imageModel === "codex/gpt-image")) return { usd: 0, label: "$0 · Codex subscription" };
  if (node.type === "mesh" && "provider" in d) {
    if (d.provider.startsWith("tripo")) { const usd = tripoCost(d); return { usd, label: `~$${usd.toFixed(2)}` }; }
    return { usd: null, label: "provider pricing varies" };
  }
  if (node.type === "prompt" && "model" in d && d.model in IMAGE_MODEL_CAPABILITIES) {
    const usd = IMAGE_MODEL_CAPABILITIES[d.model as keyof typeof IMAGE_MODEL_CAPABILITIES].estimateByResolution[("resolution" in d ? d.resolution : "1K") as "1K"] ?? 0.04;
    return { usd, label: `~$${usd.toFixed(2)}` };
  }
  if (node.type === "multiview" && "equipment" in d) { const usd = viewPrompts(d.includeBack, d.equipment).length * 0.08; return { usd, label: `~$${usd.toFixed(2)}` }; }
  if ((node.type === "rig" && "engine" in d && d.engine === "tripo") || (node.type === "animate" && "rigEngine" in d && d.rigEngine === "tripo")) {
    const credits = node.type === "rig" ? TRIPO_CREDITS.rig + TRIPO_CREDITS.convert : (TRIPO_CREDITS.retarget + ("inPlace" in d && d.inPlace === false ? TRIPO_CREDITS.convert : 0)) * new Set("tripoPresetIds" in d ? d.tripoPresetIds : []).size; // in-place clips get their FBX from the local recentre step
    const usd = credits * TRIPO_CREDITS.usdPerCredit;
    return { usd, label: `${credits} Tripo credits · ~$${usd.toFixed(2)}` };
  }
  if (node.type === "rig") return { usd: 0.2, label: "~$0.20" };
  if (node.type === "animate" && "presetIds" in d) {
    if (!d.presetIds.length) return { usd: 0, label: "$0 · local" };
    const usd = 0.2 + 0.12 * new Set(d.presetIds).size;
    return { usd, label: `~$${usd.toFixed(2)}` };
  }
  if (node.type === "bake" && "engine" in d && d.engine === "tripo") return { usd: null, label: "Tripo remesh · price not published" };
  return { usd: 0, label: "$0 · local" };
}

type TripoPricingFields = { provider: string; tripoTexture?: boolean; tripoPbr?: boolean; tripoTextureQuality?: string; tripoQuad?: boolean; tripoGeometryQuality?: string };
/** Tripo charges per model; the rate depends on textures, texture quality, geometry and quad options. */
export function tripoCost(d: TripoPricingFields) {
  const textured = Boolean(d.tripoTexture || d.tripoPbr);
  if (d.provider === "tripo-p2") {
    if (!textured) return 1.0;
    return d.tripoTextureQuality === "extreme" ? 1.3 : d.tripoTextureQuality === "detailed" ? 1.2 : 1.1;
  }
  const base = !textured ? 0.2 : d.tripoTextureQuality === "detailed" ? 0.4 : 0.3;
  return base + (d.tripoGeometryQuality === "detailed" ? 0.2 : 0) + (d.tripoQuad ? 0.05 : 0);
}
