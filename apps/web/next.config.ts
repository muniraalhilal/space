import type { NextConfig } from 'next';

const API = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@space/shared'],
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${API}/api/:path*` },
      // socket.io serves its endpoint at '/realtime/' (trailing slash); the client requests '/realtime'.
      { source: '/realtime', destination: `${API}/realtime/` },
      { source: '/realtime/:path*', destination: `${API}/realtime/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
