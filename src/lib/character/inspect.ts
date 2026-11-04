/** Inspect the JSON chunk without decoding vertex buffers or loading a renderer. */
export function inspectGlb(buffer: Buffer) {
  if (buffer.length < 20 || buffer.toString("ascii", 0, 4) !== "glTF") throw new Error("Not a GLB file.");
  const length = buffer.readUInt32LE(12);
  const gltf = JSON.parse(buffer.toString("utf8", 20, 20 + length)) as {
    nodes?: { name?: string }[]; skins?: { joints: number[] }[];
    accessors?: { count: number; min?: number[]; max?: number[] }[];
    meshes?: { primitives: { indices?: number; attributes: { POSITION: number }; mode?: number }[] }[];
    animations?: { name?: string; samplers: { input: number }[] }[];
  };
  const joints = [...new Set(gltf.skins?.flatMap((s) => s.joints) ?? [])];
  const triangleCount = (gltf.meshes ?? []).reduce((sum, m) => sum + m.primitives.reduce((n, p) => {
    const count = gltf.accessors?.[p.indices ?? p.attributes.POSITION]?.count ?? 0;
    return n + ((p.mode ?? 4) === 4 ? Math.floor(count / 3) : [5, 6].includes(p.mode ?? 4) ? Math.max(0, count - 2) : 0);
  }, 0), 0);
  return { triangleCount, boneNames: joints.map((j) => gltf.nodes?.[j]?.name ?? `joint-${j}`),
    clips: (gltf.animations ?? []).map((a, i) => ({ name: a.name ?? `Clip ${i + 1}`, frameCount: Math.max(0, ...a.samplers.map((s) => gltf.accessors?.[s.input]?.count ?? 0)), duration: Math.max(0, ...a.samplers.map((s) => gltf.accessors?.[s.input]?.max?.[0] ?? 0)) })) };
}
