import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: false,
  experimental: {
    optimizePackageImports: ['@mediapipe/tasks-vision', '@tensorflow/tfjs', 'lucide-react', '@base-ui/react'],
  },
};

export default nextConfig;
