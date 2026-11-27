import type { NextConfig } from 'next';

const config: NextConfig = {
  // Les paquets du monorepo sont publiés en TypeScript source : Next les compile.
  transpilePackages: ['@nkap/client', '@nkap/react', '@nkap/contracts', '@nkap/core', '@nkap/banking-sim'],
  reactStrictMode: true,
  async rewrites() {
    const gateway = (process.env.NKAP_GATEWAY_URL ?? 'http://127.0.0.1:8080').replace(/\/+$/, '');
    return [{ source: '/v1/:path*', destination: `${gateway}/v1/:path*` }];
  },
};

export default config;
