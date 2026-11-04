import { withRetries } from "@/lib/character/retries";
import { TRIPO_PRESET_IDS, type TripoPreset } from "./presets";

const BASE = "https://openapi.tripo3d.ai/v3";
export type TripoTask = { task_id: string; status: string; progress?: number; error_message?: string; credits_consumed?: number; output?: { model_url?: string; riggable?: boolean; rig_type?: string } };
export function buildTripoRigRequest(input: string) { return { input, model: "v3.0-20260909", rig_type: "biped", spec: "mixamo", out_format: "glb" }; }
export function buildTripoRetargetRequest(input: string, animation: TripoPreset) {
  if (!TRIPO_PRESET_IDS.includes(animation)) throw new Error("Unsupported Tripo v3 animation preset");
  return { input, animation, out_format: "glb", export_with_geometry: true };
}
export function tripoArtifact(task: TripoTask, kind: "glb" | "fbx", name: string) {
  const sourceUrl = task.output?.model_url;
  if (!sourceUrl || new URL(sourceUrl).protocol !== "https:") throw new Error(`Tripo task ${task.task_id} returned no usable ${kind} URL`);
  return { name: `${name}-${kind}`, kind, sourceUrl };
}
export class TripoClient {
  private key: string;
  constructor(private options: { apiKey?: string; fetch?: typeof fetch; pauseMs?: number; maxPolls?: number; onTask?: (id: string, endpoint: string) => Promise<void>; onProgress?: (progress: number, status: string) => Promise<void> } = {}) {
    this.key = (options.apiKey ?? process.env.TRIPO_API_KEY ?? "").trim();
    if (!this.key) throw new Error("Set TRIPO_API_KEY to use Tripo rigging");
  }
  private async request<T>(path: string, body?: Record<string, unknown> | FormData): Promise<T> {
    const multipart = body instanceof FormData;
    const response = await (this.options.fetch ?? fetch)(`${BASE}${path}`, {
      method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${this.key}`, ...(!multipart && body ? { "Content-Type": "application/json" } : {}) },
      body: multipart ? body : body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(120000),
    });
    const envelope = await response.json() as { code: number; message?: string; msg?: string; data: T };
    if (!response.ok || envelope.code !== 0) throw new Error(`Tripo: ${envelope.message ?? envelope.msg ?? `HTTP ${response.status}, code ${envelope.code}`}`);
    return envelope.data;
  }
  async uploadGlb(bytes: Uint8Array): Promise<string> {
    if (bytes.byteLength > 150 * 1024 * 1024) throw new Error("Tripo GLB upload exceeds 150 MB");
    const body = new FormData(); body.append("file", new Blob([new Uint8Array(bytes)], { type: "model/gltf-binary" }), "model.glb");
    const result = await this.request<{ file_token: string }>("/files", body);
    if (!result.file_token) throw new Error("Tripo upload returned no file_token");
    return result.file_token;
  }
  async poll(id: string, label: string): Promise<TripoTask> {
    for (let i = 0; i < (this.options.maxPolls ?? 900); i++) {
      const task = await withRetries(() => this.request<TripoTask>(`/tasks/${encodeURIComponent(id)}`), 6, this.options.pauseMs ?? 2000);
      await this.options.onProgress?.(task.progress ?? 0, `${label} · ${task.status}`);
      if (task.status === "success") return task;
      if (["failed", "cancelled", "banned", "expired"].includes(task.status)) throw new Error(`Tripo task ${id}: ${task.error_message ?? task.status}`);
      await new Promise((r) => setTimeout(r, this.options.pauseMs ?? 2000));
    }
    throw new Error(`Tripo task ${id} polling timed out; it may still finish. Check provider status before rerunning.`);
  }
  private async task(endpoint: string, body: Record<string, unknown>, label: string) {
    await this.options.onProgress?.(0, label);
    // Never retry task creation: a lost response could otherwise double bill.
    const result = await this.request<{ task_id: string }>(endpoint, body);
    if (!result.task_id) throw new Error("Tripo returned no task_id");
    await this.options.onTask?.(result.task_id, endpoint);
    return this.poll(result.task_id, label);
  }
  async rigCheck(input: string) {
    const task = await this.task("/animations/rig-check", { input }, "Tripo rig-check");
    if (task.output?.riggable !== true || task.output.rig_type !== "biped") throw new Error(`Tripo rig-check: model is not riggable as a biped (${task.output?.rig_type ?? "unknown rig type"})`);
    return task;
  }
  rig(input: string) { return this.task("/animations/rig", buildTripoRigRequest(input), "Tripo rig"); }
  retarget(input: string, animation: TripoPreset) { return this.task("/animations/retarget", buildTripoRetargetRequest(input, animation), `Tripo ${animation}`); }
  convertFbx(modelUrl: string) { return this.task("/models/convert", { input: modelUrl, format: "FBX", with_animation: true }, "Tripo FBX conversion"); }
}
