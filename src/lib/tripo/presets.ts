import { ANIMATION_PRESETS } from "@/lib/character/animation-library";

/** v3.0 humanoid presets; the older v1 biped library is not compatible. */
export const TRIPO_PRESET_IDS = ["preset:idle", "preset:walk", "preset:run", "preset:dive", "preset:climb", "preset:jump", "preset:slash", "preset:shoot", "preset:hurt", "preset:fall", "preset:turn"] as const;
export type TripoPreset = typeof TRIPO_PRESET_IDS[number];
export const TRIPO_PRESETS = TRIPO_PRESET_IDS.map((id) => ({ id, name: id.slice(7) }));
export function animationPresets(engine: string) { return engine === "tripo" ? TRIPO_PRESETS : ANIMATION_PRESETS; }
export const TRIPO_CREDITS = { rigCheck: 0, rig: 25, retarget: 10, convert: 5, usdPerCredit: 0.01 } as const;
