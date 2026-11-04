export type SavedCapture = { assetId: string; extension: string; conversionWarning?: string };
export async function requestViewerCapture(record: boolean, input: {
  projectId: string; nodeId: string; assetId: string; clip?: string; autoRotate: boolean; exposure: number; seconds: number;
}): Promise<SavedCapture | null> {
  const response = await fetch(`/api/capture/viewer-${record ? "clip" : "still"}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
  });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 503 && result.code === "PLAYWRIGHT_UNAVAILABLE") return null;
    throw new Error(result.error ?? "Capture failed.");
  }
  return result;
}
