import { render, waitFor } from "@testing-library/react";
import { vi, it, expect } from "vitest";
import { CaptureViewer } from "@/features/capture/CaptureViewer";
it("marks the loaded playing model ready without saving", async () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  const { container, unmount } = render(<CaptureViewer asset="fixture" clip="Walk" standalone />);
  const viewer = container.querySelector("model-viewer")!;
  const play = vi.fn();
  Object.assign(viewer, { availableAnimations: ["Walk"], play });
  viewer.dispatchEvent(new Event("load"));
  await waitFor(() => expect(window.__captureReady).toBe(true));
  expect(play).toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  unmount(); fetch.mockRestore();
});

vi.mock("@xyflow/react", () => ({
  ReactFlow: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Background: () => null, Handle: () => null, Position: { Left: "left", Right: "right" },
  useNodesInitialized: () => true,
  useReactFlow: () => ({ fitView: vi.fn().mockResolvedValue(true) }),
}));
import { CaptureCanvas } from "@/features/capture/CaptureCanvas";
it("fits a read-only canvas and never calls a save API", async () => {
  Object.defineProperty(document, "fonts", { configurable: true, value: { ready: Promise.resolve() } });
  const fetch = vi.spyOn(globalThis, "fetch");
  const { unmount } = render(<CaptureCanvas graph={{ id: "fixture", name: "Empty", nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }} />);
  await waitFor(() => expect(window.__captureReady).toBe(true));
  expect(fetch).not.toHaveBeenCalled();
  unmount(); fetch.mockRestore();
});
