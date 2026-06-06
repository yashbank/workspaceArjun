import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Reuse the client Router Cache across navigations so switching
    // Files ↔ Admin ↔ Activity ↔ Settings and back doesn't refetch/remount.
    // Access is still enforced server-side per API call + the layout redirect.
    staleTimes: {
      dynamic: 25,
      static: 180,
    },
    // Tree-shake the lucide-react barrel for a smaller client bundle.
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
