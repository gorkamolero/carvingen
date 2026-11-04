import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Isolate verification builds from a running development server.
  distDir: process.env.CARVINGEN_BUILD_DIR ?? ".next",
  outputFileTracingIncludes: { "/api/jobs/*": ["./scripts/blender/*.py", "./scripts/blender/*.json"] },
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
