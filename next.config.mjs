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
    // Next's standalone output traces JS imports but can miss Prisma's native
    // query-engine binary (a .node file) and its schema. Force them into the
    // bundle so the Cloud Run container can run queries. (In Next 14.2 this key
    // lives under `experimental`; it graduates to top-level in Next 15.)
    outputFileTracingIncludes: {
      "*": [
        "./node_modules/.prisma/client/*.node",
        "./node_modules/.prisma/client/schema.prisma",
      ],
    },
  },
};

export default nextConfig;
