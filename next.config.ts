
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
      { 
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com', // For Google profile pictures
        port: '',
        pathname: '/**',
      },
      { 
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com', // For GitHub profile pictures
        port: '',
        pathname: '/**',
      },
      { 
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com', // For Firebase Storage (user uploads)
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https', // Allow all HTTPS sources
        hostname: '**',
      },
      {
        protocol: 'http', // Allow all HTTP sources (less secure, for flexibility in prototype)
        hostname: '**',
      }
    ],
  },
};

export default nextConfig;
