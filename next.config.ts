import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {},
  async redirects() {
    return [
      {
        source: '/guide',
        destination: 'https://ko-fi.com/s/59604a0ac1',
        permanent: false,
      },
    ]
  },
};

export default nextConfig;
