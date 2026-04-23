"use client";
/* eslint-disable @next/next/no-img-element */

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useRef } from "react";

import { getAssetUrl } from "@/lib/assets/url";
import { updateImageNode } from "@/lib/graph/store";
import type { ImageNode as ImageGraphNode } from "@/lib/graph/types";
import { NodeChrome } from "@/features/canvas/nodes/NodeChrome";

export function ImageNode({ id, data }: NodeProps<ImageGraphNode>) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    updateImageNode(id, { isUploading: true, errorMessage: null });

    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/assets/upload", {
      method: "POST",
      body: formData,
    });

    const payload = (await response.json()) as { assetId?: string; url?: string; error?: string };

    if (!response.ok || !payload.assetId || !payload.url) {
      updateImageNode(id, {
        isUploading: false,
        errorMessage: payload.error ?? "Upload failed.",
      });
      return;
    }

    updateImageNode(id, {
      assetId: payload.assetId,
      previewUrl: payload.url,
      fileName: file.name,
      isUploading: false,
      errorMessage: null,
    });
  }

  return (
    <NodeChrome title="Image" accentClassName="bg-[#ff6fa8]" testId="image-node" nodeId={id}>
      <div className="relative min-h-44 overflow-hidden border-[3px] border-black bg-white">
        {data.assetId ? (
          <img
            src={data.previewUrl ?? getAssetUrl(data.assetId)}
            alt={data.fileName ?? "Uploaded reference"}
            className="h-44 w-full object-cover"
          />
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-44 w-full items-center justify-center bg-[radial-gradient(circle_at_1px_1px,#000_1px,transparent_0)] [background-size:16px_16px] px-4 text-center font-mono text-xs uppercase"
          >
            {data.isUploading ? "Uploading…" : "Pick a reference image"}
          </button>
        )}
        {data.isUploading ? (
          <div className="absolute inset-0 flex items-end bg-[repeating-linear-gradient(45deg,#00000055_0_8px,transparent_8px_16px)] p-2 font-mono text-xs uppercase">
            Uploading…
          </div>
        ) : null}
      </div>
      <input
        data-testid="image-file-input"
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void upload(file);
          }
        }}
      />
      <p className="font-mono text-xs">{data.fileName ?? "No file selected"}</p>
      {data.errorMessage ? <p className="font-mono text-xs text-[#d61f1f]">{data.errorMessage}</p> : null}
      <Handle data-testid="image-out-handle" type="source" id="image-out" position={Position.Right} className="!h-4 !w-4 !border-[3px] !border-black !bg-white" />
    </NodeChrome>
  );
}
