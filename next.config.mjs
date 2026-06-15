/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for Cloud Run Dockerfile — produces a minimal standalone server bundle
  output: "standalone",
};

export default nextConfig;
