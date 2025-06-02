
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
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
      // Apple usually doesn't provide direct image URLs via OAuth in a way that `next/image` can easily consume.
      // User's Apple profile picture typically isn't exposed.
      { 
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com', // For Firebase Storage (user uploads)
        port: '',
        pathname: '/**',
      }
    ],
  },
};

export default nextConfig;
