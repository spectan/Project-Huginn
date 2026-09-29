import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "127.0.0.1",
    "192.168.1.150"
  ],
  devIndicators: false,
  output: "standalone",
  // The image route reads raw layers from process.cwd()/map-images, which the
  // file tracer would otherwise copy (~100 MB) into .next/standalone. The
  // Dockerfile copies map-images next to server.js explicitly instead.
  outputFileTracingExcludes: {
    "/**": ["./map-images/**/*"],
    "/api/maps/[mapId]/image": ["./map-images/**/*"]
  }
};

export default nextConfig;
