import path from 'node:path';
import {fileURLToPath} from 'node:url';
import type { NextConfig } from 'next';
import {resolveApiProxyTarget} from './lib/api-proxy-target';

const apiProxyTarget = resolveApiProxyTarget(process.env);

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

const config: NextConfig = {
  transpilePackages: ['html-to-image'],
  outputFileTracingRoot: repoRoot,
  // El proxy de /api corta a los 30 s por defecto; generar la imagen de referencia con IA puede tardar varios minutos (incluye la verificación y los reintentos).
  experimental: { proxyTimeout: 300_000 },
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
