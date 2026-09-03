import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "127.0.0.1",
    "192.168.1.150"
  ],
  devIndicators: false,
  output: "standalone"
};

export default nextConfig;
