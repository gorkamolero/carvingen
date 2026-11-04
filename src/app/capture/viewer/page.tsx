import { CaptureViewer } from "@/features/capture/CaptureViewer";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const background = q.bg && /^[\da-f]{6}$/i.test(q.bg.replace(/^#/, "")) ? `#${q.bg.replace(/^#/, "")}` : undefined;
  const exposure = Number(q.exposure ?? 1);
  if (!q.asset || !Number.isFinite(exposure)) return <p>Valid asset and exposure required.</p>;
  return <main style={{ width: "100vw", height: "100vh" }}><style>{`nextjs-portal { display: none !important; } body { margin: 0; }`}</style><CaptureViewer asset={q.asset} clip={q.clip} autoRotate={q.autorotate === "1"} exposure={exposure} background={background} standalone /></main>;
}
