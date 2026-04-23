import { Buffer } from "node:buffer";

import { loadLocalEnvFile } from "@/lib/load-local-env";

loadLocalEnvFile(process.cwd());

const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3001";

const tinyPngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlH0nQAAAAASUVORK5CYII=";

async function main() {
  const project = await fetch(`${baseUrl}/api/projects`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: `API E2E ${Date.now()}` }),
  }).then((response) => response.json() as Promise<{ id: string; name: string }>);

  const saveResponse = await fetch(`${baseUrl}/api/projects/${project.id}/save`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: project.id,
      name: project.name,
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    }),
  });

  if (!saveResponse.ok) {
    throw new Error(`Project save failed with ${saveResponse.status}`);
  }

  const formData = new FormData();
  formData.append(
    "file",
    new File([Buffer.from(tinyPngBase64, "base64")], "api-e2e.png", { type: "image/png" }),
  );

  const upload = await fetch(`${baseUrl}/api/assets/upload`, {
    method: "POST",
    body: formData,
  }).then((response) => response.json() as Promise<{ assetId: string; url: string }>);

  const assetResponse = await fetch(`${baseUrl}${new URL(upload.url).pathname}`);
  if (!assetResponse.ok) {
    throw new Error(`Asset stream failed with ${assetResponse.status}`);
  }

  console.log(
    JSON.stringify(
      {
        projectId: project.id,
        assetId: upload.assetId,
        assetStatus: assetResponse.status,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
