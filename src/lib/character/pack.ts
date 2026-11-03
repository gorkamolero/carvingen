import { NodeIO, type Document, type Accessor, type Node } from "@gltf-transform/core";
// Shared with the character packing CLI: copy animation accessors and channels onto
// the base skeleton by name. Never fall back to node index across unrelated rigs.
export function copyAnimationClips(base: Document, source: Document, name: string) {
  const nodes = new Map(base.getRoot().listNodes().map((n) => [n.getName(), n]));
  const buffer = base.getRoot().listBuffers()[0] ?? base.createBuffer();
  const copy = (a: Accessor) => {
    const array = a.getArray(); if (!array) throw new Error("Animation accessor has no data");
    return base.createAccessor(a.getName()).setArray(array.slice()).setType(a.getType()).setBuffer(buffer).setNormalized(a.getNormalized());
  };
  for (const [index, animation] of source.getRoot().listAnimations().entries()) {
    const target = base.createAnimation(source.getRoot().listAnimations().length === 1 ? name : `${name}_${index + 1}`);
    const samplers = new Map(animation.listSamplers().map((s) => {
      const input = s.getInput(), output = s.getOutput();
      if (!input || !output) throw new Error("Missing animation sampler data");
      const copied = base.createAnimationSampler().setInput(copy(input)).setOutput(copy(output)).setInterpolation(s.getInterpolation());
      target.addSampler(copied); return [s, copied];
    }));
    for (const channel of animation.listChannels()) {
      const src = channel.getTargetNode(), path = channel.getTargetPath(), sampler = channel.getSampler();
      const node: Node | undefined = src ? nodes.get(src.getName()) : undefined;
      if (!node || !path || !sampler) throw new Error(`Cannot combine clip: unmatched animated node ${src?.getName()}`);
      target.addChannel(base.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(samplers.get(sampler)!));
    }
  }
}
export async function combineAnimationGlbs(clips: { path: string; name: string }[], output: string) {
  if (!clips.length) return;
  const io = new NodeIO(), base = await io.read(clips[0].path);
  const first = base.getRoot().listAnimations();
  first.forEach((a, i) => a.setName(first.length === 1 ? clips[0].name : `${clips[0].name}_${i + 1}`));
  for (const clip of clips.slice(1)) copyAnimationClips(base, await io.read(clip.path), clip.name);
  await io.write(output, base);
}
