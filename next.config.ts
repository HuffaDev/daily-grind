import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Inside Discord the page is served from <app_id>.discordsays.com via a
  // tunnel; without this the dev server rejects its /_next requests. Dev only.
  allowedDevOrigins: ["*.discordsays.com"],
};

export default nextConfig;
