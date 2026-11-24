import type { NextConfig } from 'next';

const config: NextConfig = {
  // Les paquets du monorepo sont publiés en TypeScript source : Next les compile.
  transpilePackages: ['@nkap/client', '@nkap/contracts', '@nkap/core', '@nkap/banking-sim'],
  reactStrictMode: true,
};

export default config;
