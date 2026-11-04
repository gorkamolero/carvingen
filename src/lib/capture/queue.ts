// Share one queue across route bundles and development module reloads.
const state = globalThis as typeof globalThis & { viewerCaptureTail?: Promise<unknown> };
export function queueCapture<T>(work: () => Promise<T>): Promise<T> {
  const result = (state.viewerCaptureTail ?? Promise.resolve()).then(work);
  state.viewerCaptureTail = result.catch(() => undefined);
  return result;
}
