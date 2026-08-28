import type { NextConfig } from 'next';

const apiProxyTarget = (
  process.env.API_PROXY_TARGET?.trim() ||
  process.env.API_PUBLIC_URL?.trim() ||
  'http://127.0.0.1:3001/api'
).replace(/\/$/, '');

const config: NextConfig = {
  transpilePackages: ['html-to-image'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiProxyTarget}/:path*`,
      },
    ];
  },
};

export default config;
