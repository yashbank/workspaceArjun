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
    // MIS V2 Epic 7: a phone-camera badge photo (2–5 MB) is posted through a server action;
    // the default 1 MB cap rejected it before employee-photo.ts's own 5 MB check could run.
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
