import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: ["sharp"],
  experimental: { proxyClientMaxBodySize: "11mb" },
};
export default config;
