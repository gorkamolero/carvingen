import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { runBlender } from "@/lib/character/blender";
import { inspectGlb } from "@/lib/character/inspect";
import { combineAnimationGlbs } from "@/lib/character/pack";
async function execute(script: string, config: string) {
  await new Promise<void>((ok, fail) => {
    const child = spawn(process.env.BLENDER_PATH || "/opt/homebrew/bin/blender", ["-b", "--factory-startup", "--python-exit-code", "1", "-P", resolve("scripts/blender", script), "--", config], { stdio: "inherit" });
    child.on("error", fail); child.on("close", (code) => code === 0 ? ok() : fail(new Error(`Blender exited ${code}`)));
  });
}
async function main() {
  await mkdir("tmp", { recursive: true });
  const root = await mkdtemp(resolve("tmp/blender-smoke-"));
  try {
    const fixture = join(root, "fixture.json"); await writeFile(fixture, JSON.stringify({ output: join(root, "fixtures") }));
    await execute("fixture.py", fixture);
    const bake = await runBlender("bake", { input: join(root, "fixtures/high.glb"), targetTriangles: 2000, textureSize: 1024 }, join(root, "bake"));
    if (bake.triangleCount !== 2000) throw new Error("Bake triangle target was missed");
    await runBlender("export", { input: join(root, "fixtures/rig.glb"), target: "unreal", triangleBudget: 15000 }, join(root, "export"));
    await runBlender("retarget", { input: join(root, "fixtures/rig.glb"), clip: join(root, "fixtures/rig.glb") }, join(root, "retarget"));
    const apiIndex = process.argv.indexOf("--api-url");
    if (apiIndex !== -1) {
      const base = process.argv[apiIndex + 1];
      async function json(path: string, init?: RequestInit) {
        const response = await fetch(base + path, init);
        if (!response.ok) throw new Error(await response.text());
        return response.json();
      }
      const project = await json("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Local Blender smoke" }) });
      const form = new FormData(); form.append("file", new File([await readFile(join(root, "fixtures/high.glb"))], "fixture.glb", { type: "model/gltf-binary" }));
      const upload = await json("/api/assets/upload", { method: "POST", body: form });
      const job = await json("/api/jobs/bake", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId: project.id, nodeId: "bake-smoke", data: { engine: "blender", targetTriangles: 2000, textureSize: 1024 }, meshAssetIds: [upload.assetId] }) });
      const deadline = Date.now() + 120000;
      while (true) {
        const status = await json(`/api/jobs/${job.jobId}`);
        if (status.state === "failed") throw new Error(status.error);
        if (status.state === "succeeded") {
          if (status.result.triangleCount !== 2000 || status.result.assets.length !== 3) throw new Error("API bake result mismatch");
          const response = await fetch(base + `/api/assets/${status.result.outputAssetId}`);
          if (!response.ok || inspectGlb(Buffer.from(await response.arrayBuffer())).triangleCount !== 2000) throw new Error("Persisted API GLB mismatch");
          console.log("PASS: HTTP upload → background Bake → SQLite polling → persisted asset download"); break;
        }
        if (Date.now() > deadline) throw new Error("API smoke timed out");
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    const verify = join(root, "verify.json"); await writeFile(verify, JSON.stringify({ root })); await execute("verify.py", verify);
    const combined = join(root, "combined.glb");
    await combineAnimationGlbs([{ path: join(root, "fixtures/rig.glb"), name: "Original" }, { path: join(root, "retarget/custom.glb"), name: "Custom" }], combined);
    const result = inspectGlb(await readFile(combined));
    if (result.clips.length !== 2) throw new Error("Combined GLB must contain two clips");
    console.log("PASS: bake 2000 tris; GLB/FBX reopened; texture, bone renames, manifest, retarget and combined clips verified.");
  } finally { await rm(root, { recursive: true, force: true }); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
