import { fireEvent, render, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ capture: vi.fn(), upload: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/capture/client", () => ({ requestViewerCapture: mocks.capture }));
vi.mock("@/lib/api/client", () => ({ fetchJson: mocks.upload }));
vi.mock("@/lib/graph/selectors", () => ({ getIncomingGlbAssetId: () => "model" }));
vi.mock("@/lib/graph/store", () => ({
  graphHistory: { value: { activeProjectId: "project", nodes: [{ id: "viewer", type: "viewer", data: {} }], edges: [] } },
  updateViewerNode: mocks.update,
}));
import { ViewerCaptureButtons } from "@/features/capture/ViewerCaptureButtons";
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  mocks.upload.mockResolvedValue({ assetId: "fallback", extension: "png" });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function setup() {
  const result = render(<div data-testid="viewer-node"><model-viewer auto-rotate="" exposure="1.5" /><ViewerCaptureButtons nodeId="viewer" /></div>);
  const toBlob = vi.fn().mockResolvedValue(new Blob(["png"], { type: "image/png" }));
  Object.assign(result.container.querySelector("model-viewer")!, { loaded: true, animationName: "Walk", toBlob });
  return { ...result, toBlob };
}
it("uses server capture and shows progress on the still button", async () => {
  let finish!: (value: unknown) => void;
  mocks.capture.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const view = setup();
  fireEvent.click(view.getByText("Save still"));
  expect(view.getByText("Saving still…")).toBeTruthy();
  expect(mocks.capture).toHaveBeenCalledWith(false, expect.objectContaining({ clip: "Walk", autoRotate: true, seconds: 10, exposure: 1.5 }));
  finish({ assetId: "server", extension: "png" });
  await waitFor(() => expect(mocks.update).toHaveBeenCalledWith("viewer", { captureAssetIds: ["server"] }));
  expect(view.toBlob).not.toHaveBeenCalled();
});
it("runs the browser path only when the server helper permits fallback", async () => {
  mocks.capture.mockResolvedValue(null);
  const view = setup();
  fireEvent.click(view.getByText("Save still"));
  await waitFor(() => expect(mocks.upload).toHaveBeenCalled());
  expect(view.toBlob).toHaveBeenCalled();
});
it("shows server failure without browser capture", async () => {
  mocks.capture.mockRejectedValue(new Error("ffmpeg unavailable"));
  const view = setup();
  fireEvent.click(view.getByText("Record"));
  await waitFor(() => expect(view.getByRole("alert").textContent).toBe("ffmpeg unavailable"));
  expect(view.toBlob).not.toHaveBeenCalled();
  expect(mocks.upload).not.toHaveBeenCalled();
});
