import { randomInt } from "node:crypto";
import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { ensureMotionPython } from "./motion-env";
import { runMotionStage, type BlenderResult } from "./blender";
import { motionSlug, type MotionReport, type Take } from "./motion";
import type { PipelineData } from "./schema";
type Context = {
  directory: string; input: string; data: PipelineData;
  progress: (value: number, status: string, partial?: object) => Promise<void>;
  save: (file: BlenderResult["files"][number]) => Promise<string>;
  video: (reference: string, prompt: string, seed: number, prefix: string, submitted: (id: string) => Promise<void>) => Promise<{ assetId: string; path: string }>;
};
export async function runMotionJob(c: Context) {
  const d = c.data, root = c.directory, creature = join(root, "reference");
  const report: MotionReport = { layout: { width: 1536, height: 768, metresInFrame: 2.2, groundRow: 656 }, scale: 0, nativeHeight: 0, seedBase: d.seedBase ?? randomInt(1000, 900001), prompt: "", reference: { assetId: "" }, steps: ["Python environment", "Reference", "Prompt"].map((name) => ({ name, state: "pending" })), takes: [], chosenTake: null, totalUsd: 0 };
  const progress = (value: number, status: string) => c.progress(value, status, { motion: report, lastRunCost: report.totalUsd });
  async function step<T>(name: string, fn: () => Promise<T>) {
    let s = report.steps.find((s) => s.name === name);
    if (!s) { s = { name, state: "pending" }; report.steps.push(s); }
    s.state = "running"; await progress(0, name);
    try { const value = await fn(); const verdict = value as { pass?: boolean; reasons?: string[] } | undefined;
      s.state = verdict?.pass === false ? "failed" : "done"; s.detail = verdict?.reasons?.join("; ");
      await progress(100, name); return value; }
    catch (e) { s.state = "failed"; s.detail = e instanceof Error ? e.message : "Stage failed"; await progress(0, name); throw e; }
  }
  const python = await step("Python environment", () => ensureMotionPython(() => {}));
  async function stage(script: Parameters<typeof runMotionStage>[0], args: Record<string, unknown>, directory: string) {
    let writes = Promise.resolve();
    const r = await runMotionStage(script, { ...args, creature }, directory, python, creature, (p, s) => { writes = writes.then(() => progress(p, s)); });
    await writes; return r;
  }
  const reference = await step("Reference", () => stage("reference", { input: c.input, ...d }, creature));
  report.scale = Number(reference.scale); report.nativeHeight = Number(reference.nativeHeight);
  report.reference.assetId = await c.save({ name: "reference-image", kind: "image", path: join(creature, "reference.png") });
  const promptDir = join(root, "prompt");
  await step("Prompt", () => stage("prompt", { actionSentence: d.actionSentence }, promptDir));
  report.prompt = await readFile(join(promptDir, "prompt.txt"), "utf8");
  await c.save({ name: "prompt-txt", kind: "text", path: join(promptDir, "prompt.txt") });
  const info = join(creature, "rig-info.json"), blend = join(creature, "rig.blend");
  async function saveReport() {
    await writeFile(join(root, "motion-report.json"), JSON.stringify(report, null, 2));
    await progress(100, report.chosenTake ? "Motion complete" : "Take complete");
  }
  try {
  for (let i = 0; i < d.takeBudget; i++) {
    const prefix = `take-${i + 1}`, dir = join(root, prefix); await mkdir(dir, { recursive: true });
    const take: Take = { index: i + 1, seed: report.seedBase + i, usd: 0, status: "failed", reasons: [], assets: {} }; report.takes.push(take);
    const stepName = (name: string) => `${prefix} · ${name}`;
    const save = async (name: string, kind: string, path: string) => { take.assets[name] = await c.save({ name: `${prefix}-${name}`, kind, path }); };
    try {
      const video = await step(stepName("Video"), () => c.video(report.reference.assetId, report.prompt, take.seed, `${prefix}-video`, async (id) => {
        take.requestId = id; take.usd = .28; report.totalUsd = Math.round(report.takes.reduce((n, t) => n + t.usd, 0) * 100) / 100;
        await saveReport();
      }));
      take.assets.video = video.assetId;
      const readDir = join(dir, "read"), joints = join(readDir, "joints.json");
      await step(stepName("Read"), () => stage("read", { video: video.path, reference: join(creature, "reference.png") }, readDir));
      await save("video-sheet", "image", join(readDir, "video-sheet.png"));
      take.gates = await step(stepName("Gates"), () => stage("gates", { joints, info, planted: d.planted }, join(dir, "gates"))) as unknown as Take["gates"];
      await save("gates", "json", join(dir, "gates/gates.json"));
      if (!take.gates!.pass) { take.reasons = take.gates!.reasons; continue; }
      take.fit = await step(stepName("Solve"), () => stage("solve", { joints, info }, join(dir, "solve"))) as unknown as Take["fit"];
      await save("motion", "json", join(dir, "solve/motion.json"));
      if (!take.fit!.pass) { take.reasons = take.fit!.reasons; continue; }
      const applied = await step(stepName("Apply"), () => stage("apply", { blend, info, motion: join(dir, "solve/motion.json"), clipSeconds: d.clipSeconds, planted: d.planted, moveName: d.moveName, slug: motionSlug(d.moveName) }, join(dir, "apply")));
      take.checks = applied as unknown as Take["checks"];
      await save("sheet", "image", join(dir, "apply/sheet.png")); await save("checks", "json", join(dir, "apply/checks.json"));
      if (!take.checks!.pass) {
        for (const file of applied.files) await save(`rejected-${file.kind}`, file.kind, file.path);
        take.reasons = take.checks!.reasons; continue;
      }
      take.verify = await step(stepName("Verify"), () => stage("verify", { info, files: applied.files.map((f) => f.path) }, join(dir, "verify"))) as unknown as Take["verify"];
      await save("verify", "json", join(dir, "verify/result.json"));
      if (!take.verify!.pass) { for (const file of applied.files) await save(`rejected-${file.kind}`, file.kind, file.path); take.reasons = take.verify!.reasons; throw new Error(`Export verification failed: ${take.reasons.join("; ")}`); }
      for (const file of applied.files) take.assets[file.kind] = await c.save(file);
      take.status = "passed"; report.chosenTake = take.index;
    } catch (e) {
      take.status = "error"; take.reasons = [e instanceof Error ? e.message : "Motion stage failed"];
      if (/Blender was not found|ENOENT|missing fal key|FAL_KEY|Export verification failed/i.test(take.reasons[0])) throw e;
    } finally { await saveReport(); }
    if (report.chosenTake !== null) break;
  }
  } finally { await c.save({ name: "motion-report", kind: "json", path: join(root, "motion-report.json") }); await progress(100, "Motion report saved"); }
  if (report.chosenTake === null) throw new Error(report.takes.map((t) => `Take ${t.index}: ${t.reasons.join("; ")}`).join("\n"));
  return { motion: report, lastRunCost: report.totalUsd };
}
