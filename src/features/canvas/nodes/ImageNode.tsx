"use client";
/* eslint-disable @next/next/no-img-element */

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useRef } from "react";

import { getAssetUrl } from "@/lib/assets/url";
import { uploadImageAsset } from "@/lib/assets/upload-client";
import { updateImageNode } from "@/lib/graph/store";
import { getErrorMessage, showErrorToast, showLoadingToast, showSuccessToast } from "@/lib/notifications/toast";
import type { ImageNode as ImageGraphNode } from "@/lib/graph/types";
import { NodeChrome } from "@/features/canvas/nodes/NodeChrome";

export function ImageNode({ id, data }: NodeProps<ImageGraphNode>) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    updateImageNode(id, { isUploading: true, errorMessage: null });
    const toastId = showLoadingToast({
      title: "Uploading image",
      description: file.name,
    });

    try {
      const payload = await uploadImageAsset(file);
      updateImageNode(id, {
        assetId: payload.assetId,
        previewUrl: payload.url,
        fileName: file.name,
        isUploading: false,
        errorMessage: null,
      });
      showSuccessToast(toastId, {
        title: "Image ready",
        description: file.name,
      });
    } catch (error) {
      updateImageNode(id, {
        isUploading: false,
        errorMessage: getErrorMessage(error, "Upload failed."),
      });
      showErrorToast(toastId, {
        title: "Upload failed",
        description: getErrorMessage(error, "Upload failed."),
      });
    }
  }

  return (
    <NodeChrome title="Image" accentClassName="bg-[#ff6fa8]" testId="image-node" nodeId={id}>
      <div className="relative aspect-square overflow-hidden border-[3px] border-black bg-white">
        {data.assetId ? (
          <img
            src={data.previewUrl ?? getAssetUrl(data.assetId)}
            alt={data.fileName ?? "Uploaded reference"}
            className="h-full w-full object-cover"
          />
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,transparent_49%,rgba(0,0,0,0.08)_49%_51%,transparent_51%)] bg-[length:14px_14px] text-center font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-black/55 hover:bg-[#fff2f6]"
          >
            {data.isUploading ? "Uploading…" : "Pick a reference"}
          </button>
        )}
        {data.isUploading ? (
          <div className="pointer-events-none absolute inset-0 flex items-end bg-[repeating-linear-gradient(45deg,rgba(0,0,0,0.28)_0_8px,transparent_8px_16px)] p-2">
            <span className="inline-block self-start border-[2px] border-black bg-[#ff6fa8] px-2 py-[2px] font-mono text-[10px] font-bold uppercase tracking-[0.2em]">
              Uploading
            </span>
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
      <div className="flex items-center justify-between gap-3">
        <span className="truncate font-mono text-[11px] font-medium text-black/70" title={data.fileName ?? undefined}>
          {data.fileName ?? "No file selected"}
        </span>
        {data.assetId ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="h-7 shrink-0 border-[3px] border-black bg-white px-2 text-[10px] font-black uppercase tracking-[0.14em] hover:bg-[#fff2f6]"
          >
            Replace
          </button>
        ) : null}
      </div>
      {data.errorMessage ? (
        <p className="font-mono text-[11px] text-[#d8421b]">{data.errorMessage}</p>
      ) : null}
      <Handle
        data-testid="image-out-handle"
        type="source"
        id="image-out"
        position={Position.Right}
      />
    </NodeChrome>
  );
}
