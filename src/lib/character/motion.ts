import { z } from "zod";
const verdict = z.object({ pass: z.boolean(), reasons: z.array(z.string()) });
export const gatesSchema = verdict.extend({ coverage: z.number(), facing: z.number(), agreement: z.object({ score: z.number().nullable() }).catchall(z.number().nullable()), studio: z.object({ floorMaxDeviationPx: z.number(), dividerMaxDeviationPx: z.number() }) }).passthrough();
export const fitSchema = verdict.extend({ reproj_confident_px: z.object({ front_x_only: z.number(), side: z.number() }).passthrough() }).passthrough();
export const checksSchema = verdict.extend({ minSkinZ: z.number(), handTorsoOverlapMax: z.number(), plantedDriftCm: z.number(), groundLiftM: z.number(), frames: z.number(), fps: z.literal(24), durationS: z.number() }).passthrough();
export const takeSchema = z.object({ index: z.number(), seed: z.number(), requestId: z.string().optional(), usd: z.number(), status: z.enum(["passed", "failed", "error"]), reasons: z.array(z.string()), gates: gatesSchema.optional(), fit: fitSchema.optional(), checks: checksSchema.optional(), verify: verdict.passthrough().optional(), assets: z.record(z.string(), z.string()) });
export const motionReportSchema = z.object({ layout: z.object({ width: z.literal(1536), height: z.literal(768), metresInFrame: z.literal(2.2), groundRow: z.literal(656) }), scale: z.number(), nativeHeight: z.number(), seedBase: z.number(), prompt: z.string(), reference: z.object({ assetId: z.string() }), steps: z.array(z.object({ name: z.string(), state: z.enum(["pending", "running", "done", "failed"]), detail: z.string().optional() })), takes: z.array(takeSchema), chosenTake: z.number().nullable(), totalUsd: z.number() });
export type MotionReport = z.infer<typeof motionReportSchema>;
export type Take = z.infer<typeof takeSchema>;
export function motionSlug(name: string) { return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "motion"; }
