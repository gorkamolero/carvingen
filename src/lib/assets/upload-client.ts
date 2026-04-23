export type UploadedAsset = {
  assetId: string;
  url: string;
};

type UploadResponse = {
  assetId?: string;
  url?: string;
  error?: string;
};

export async function uploadImageAsset(file: File): Promise<UploadedAsset> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/assets/upload", {
    method: "POST",
    body: formData,
  });

  const payload = (await response.json().catch(() => null)) as UploadResponse | null;

  if (!response.ok || !payload?.assetId || !payload.url) {
    throw new Error(payload?.error ?? "Upload failed.");
  }

  return {
    assetId: payload.assetId,
    url: payload.url,
  };
}
