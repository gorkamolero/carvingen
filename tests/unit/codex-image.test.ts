// @vitest-environment node
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
import { spawn } from "node:child_process";
import { CODEX_IMAGE_TIMEOUT_MS, generateCodexImage } from "@/lib/codex/image";
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
let root: string;
let children: Array<ReturnType<typeof child>>;
function child() {
  const p = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() });
  p.kill.mockImplementation(() => { p.emit("close", null); return true; });
  return p;
}
beforeEach(async () => {
  await mkdir("tmp", { recursive: true }); root = await mkdtemp(join(process.cwd(), "tmp/codex-test-")); children = [];
  vi.mocked(spawn).mockImplementation(() => { const p = child(); children.push(p); return p as unknown as ReturnType<typeof spawn>; });
});
afterEach(async () => { vi.useRealTimers(); vi.clearAllMocks(); await rm(root, { recursive: true, force: true }); });
async function waitFor(count: number) { await vi.waitFor(() => expect(children).toHaveLength(count)); }
const run = (dir: string, referencePaths: string[] = []) => generateCodexImage({ prompt: "An apple", aspectRatio: "3:4", referencePaths, workDir: dir });
describe("Codex image process", () => {
  it("spawns without shell, attaches every reference and sends instructions on stdin", async () => {
    const ref = join(root, "ref.png"); await writeFile(ref, png);
    const dir = join(root, "job"); const result = run(dir, [ref, ref]); await waitFor(1);
    const [binary, args, opts] = vi.mocked(spawn).mock.calls[0];
    expect(binary).toBe(process.env.CODEX_PATH || "codex"); expect(opts).toMatchObject({ shell: false, cwd: dir });
    expect(args).toEqual(["exec", "--skip-git-repo-check", "-s", "workspace-write", "--enable", "image_generation", "-C", dir, "-o", join(dir, "last.txt"), "-i", join(dir, "reference-0.png"), "-i", join(dir, "reference-1.png"), "-"]);
    expect(children[0].stdin.read().toString()).toContain("Portrait 3:4");
    await writeFile(join(dir, "output.png"), png); children[0].emit("close", 0); expect(await result).toBe(join(dir, "output.png"));
  });
  it("reports missing output with the log tail", async () => {
    const result = expect(run(join(root, "job"))).rejects.toThrow(/did not create output.png.*\nhelpful log/);
    await waitFor(1); children[0].stderr.write("helpful log"); children[0].emit("close", 0); await result;
  });
  it("rejects invalid PNG bytes", async () => {
    const dir = join(root, "job"); const result = expect(run(dir)).rejects.toThrow("not a PNG"); await waitFor(1);
    await writeFile(join(dir, "output.png"), "not png"); children[0].emit("close", 0); await result;
  });
  it("reports a missing CLI clearly", async () => {
    const result = expect(run(join(root, "job"))).rejects.toThrow("Codex CLI not found; install it and sign in with your ChatGPT account"); await waitFor(1);
    children[0].emit("error", Object.assign(new Error("missing"), { code: "ENOENT" })); await result;
  });
  it("kills the process after ten minutes", async () => {
    vi.useFakeTimers(); const result = expect(run(join(root, "job"))).rejects.toThrow("timed out"); await waitFor(1);
    await vi.advanceTimersByTimeAsync(CODEX_IMAGE_TIMEOUT_MS); expect(children[0].kill).toHaveBeenCalledWith("SIGKILL"); await result;
  });
  it("runs at most two processes and releases slots on failure", async () => {
    const results = [0, 1, 2].map((i) => expect(run(join(root, `job-${i}`))).rejects.toThrow("exited"));
    await waitFor(2); children[0].emit("close", 1); await waitFor(3);
    children[1].emit("close", 1); children[2].emit("close", 1); await Promise.all(results);
  });
});
