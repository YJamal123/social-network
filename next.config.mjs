/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for Cloud Run Dockerfile — produces a minimal standalone server bundle
  output: "standalone",
  experimental: {
    // Server Actions enforce an Origin === Host check (CSRF). Allow both run.app
    // host formats the service answers on (project-number and hash form) so actions
    // work regardless of which public URL a visitor lands on.
    serverActions: {
      allowedOrigins: [
        "mdjamal-app-ttc7jxtqgq-uc.a.run.app",
        "mdjamal-app-110062063496.us-central1.run.app",
      ],
      // Allow avatar image uploads (default Server Action body limit is 1MB).
      bodySizeLimit: "3mb",
    },
  },
};

export default nextConfig;
