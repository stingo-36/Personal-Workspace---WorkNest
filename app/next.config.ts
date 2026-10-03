import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The app is intentionally opened from another device on this LAN during
  // development. Next blocks dev assets/endpoints from origins other than the
  // hostname it was started with, which prevents React from hydrating and
  // prevents Server Actions from reaching the auth flow.
  allowedDevOrigins: ["192.168.31.130"],
  experimental: {
    serverActions: {
      allowedOrigins: ["192.168.31.130:3000"],
    },
  },
};

export default nextConfig;
