import { describe, expect, it } from "vitest";
import { isPrivateUrl } from "@/lib/character/jobs";

describe("isPrivateUrl", () => {
  it("flags addresses a provider cannot fetch", () => {
    for (const url of ["http://127.0.0.1:3001/api/assets/a", "http://localhost:3001/x", "http://app.localhost/x", "http://192.168.1.4/x", "http://10.0.0.2/x", "http://172.20.0.1/x", "http://[::1]:3001/x"]) {
      expect(isPrivateUrl(url)).toBe(true);
    }
  });
  it("lets public addresses through", () => {
    for (const url of ["https://v3b.fal.media/files/a.glb", "https://example.trycloudflare.com/api/assets/a", "http://172.32.0.1/x"]) {
      expect(isPrivateUrl(url)).toBe(false);
    }
  });
});

import { clipDisplayName } from "@/lib/character/jobs";
describe("clipDisplayName", () => {
  it("names Meshy clips after the requested presets", () => {
    expect(clipDisplayName("animations-0-animation_glb", [0, 30])).toBe("Idle");
    expect(clipDisplayName("animations-1-animation_glb", [0, 30])).toBe("Casual_Walk");
    expect(clipDisplayName("custom-0-glb", [0, 30])).toBe("custom-0-glb");
  });
});

import { estimateNodeCost, tripoCost } from "@/lib/fal/pricing";
describe("character pricing", () => {
  it("uses Tripo's per-model rates", () => {
    expect(tripoCost({ provider: "tripo-p2", tripoTexture: true, tripoTextureQuality: "standard" })).toBeCloseTo(1.1);
    expect(tripoCost({ provider: "tripo-p2", tripoTexture: false, tripoPbr: false })).toBeCloseTo(1.0);
    expect(tripoCost({ provider: "tripo-p2", tripoPbr: true, tripoTextureQuality: "extreme" })).toBeCloseTo(1.3);
    expect(tripoCost({ provider: "tripo-h31", tripoTexture: true, tripoTextureQuality: "standard", tripoGeometryQuality: "detailed", tripoQuad: true })).toBeCloseTo(0.55);
  });
  it("charges Meshy multi-animation per clip", () => {
    expect(estimateNodeCost({ type: "animate", data: { presetIds: [0, 30] } } as never).usd).toBeCloseTo(0.44);
    expect(estimateNodeCost({ type: "rig", data: {} } as never).usd).toBeCloseTo(0.2);
  });
});
