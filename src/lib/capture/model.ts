/** Shared with the editable Viewer and the isolated capture renderer. */
export const viewerLook = { environment: "neutral", shadow: "1", background: "#fafaf5" };
export type ModelElement = HTMLElement & {
  availableAnimations: string[]; animationName: string; currentTime: number; duration: number;
  loaded: boolean; paused: boolean; play: () => void; pause: () => void;
  toBlob: (options: { mimeType: string; idealAspect: boolean }) => Promise<Blob>;
};
declare global {
  interface Window { __captureReady: boolean; __captureError?: string; }
}
