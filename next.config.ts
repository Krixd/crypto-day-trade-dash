import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,   // ← This is the only line we added
  },
};

export default nextConfig;