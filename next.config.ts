import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  headers: async () => [
    {
      // HTML pages — never cache
      source: "/(.*)",
      headers: [
        { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0" },
        { key: "Pragma", value: "no-cache" },
        { key: "Expires", value: "0" },
        { key: "Surrogate-Control", value: "no-store" },
        { key: "CDN-Cache-Control", value: "no-store" },
      ],
    },
  ],
};

export default nextConfig;
