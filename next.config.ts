import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Inside Discord the page is served from <app_id>.discordsays.com via a
  // tunnel; without this the dev server rejects its /_next requests. Dev only.
  allowedDevOrigins: ["*.discordsays.com"],
  // Discord's frame blocks the clipboard, so the dev overlay's copy button can't
  // work there. This prints browser errors in the dev server's terminal instead.
  logging: { browserToTerminal: "error" },
};

export default nextConfig;
