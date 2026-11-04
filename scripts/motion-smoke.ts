import { mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { ensureMotionPython, motionCommand } from "@/lib/character/motion-env";
import { runMotionStage } from "@/lib/character/blender";
async function main() {
  const input = process.argv.slice(2).find((a) => a !== "--"); if (!input) throw new Error("Usage: pnpm motion:smoke -- <rigged.glb>");
  const python = await ensureMotionPython(console.log); await mkdir("tmp", { recursive: true });
  const root = await mkdtemp(resolve("tmp/motion-smoke-")), creature = join(root, "reference");
  const stage = (name: Parameters<typeof runMotionStage>[0], args: Record<string, unknown>) => runMotionStage(name, { ...args, creature }, join(root, name), python, creature, (p, s) => console.log(`${p}% ${s}`));
  console.log(`Exam outputs: ${root}`);
  await stage("reference", { input: resolve(input), heightMeters: 1.8, firstPose: "standing", planted: "feet", moveName: "Exam" });
  const info = join(creature, "rig-info.json"), blend = join(creature, "rig.blend");
  await stage("exam", { info, blend });
  const config = join(root, "exam-video.json"); await writeFile(config, JSON.stringify({ directory: join(root, "exam") }));
  await motionCommand(python, ["scripts/motion/exam_video.py", config], console.log);
  await stage("read", { video: join(root, "exam/exam.mp4"), reference: join(creature, "reference.png") });
  const joints = join(root, "read/joints.json"), gates = await stage("gates", { joints, info });
  console.log("Gates", JSON.stringify(gates));
  const fit = await stage("solve", { joints, info }); console.log("Fit", JSON.stringify(fit));
  const truth = JSON.parse(await readFile(join(root, "exam/truth.json"), "utf8")) as { names: string[]; joints: number[][][] };
  const solved = JSON.parse(await readFile(join(root, "solve/motion.json"), "utf8")) as { joint_names: string[]; joints: number[][][] };
  const errors = solved.joints.flatMap((frame, t) => solved.joint_names.flatMap((name, j) => {
    if (!/^(shoulder|elbow|wrist|hip|knee|ankle|toe)_/.test(name)) return [];
    const target = truth.joints[t % 48][truth.names.indexOf(name)]; return [Math.hypot(...frame[j].map((v, k) => v - target[k])) * 100];
  }));
  const meanLimbErrorCm = errors.reduce((a, b) => a + b, 0) / errors.length;
  const applied = await stage("apply", { blend, info, motion: join(root, "solve/motion.json"), clipSeconds: 3.5, planted: "feet", moveName: "Exam", slug: "exam" });
  const verify = await stage("verify", { info, files: applied.files.map((f) => f.path) });
  const summary = { gates, fit, meanLimbErrorCm, checks: applied, verify };
  await writeFile(join(root, "exam-report.json"), JSON.stringify(summary, null, 2)); console.log(JSON.stringify(summary, null, 2));
  if (!gates.pass || !fit.pass || !applied.pass || !(meanLimbErrorCm < 8) || !verify.pass) throw new Error(`Motion exam failed; retained ${root}`);
  await rm(root, { recursive: true, force: true });
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; });
