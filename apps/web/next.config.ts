import path from 'node:path';
import {fileURLToPath} from 'node:url';
import type { NextConfig } from 'next';

const apiProxyTarget = (
  process.env.API_PROXY_TARGET?.trim() ||
  process.env.API_PUBLIC_URL?.trim() ||
  'http://127.0.0.1:3001/api'
).replace(/\/$/, '');

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

const config: NextConfig = {
  transpilePackages: ['html-to-image'],
  outputFileTracingRoot: repoRoot,
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
