import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: { "/api/jobs/*": ["./scripts/blender/*.py", "./scripts/blender/*.json"] },
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
