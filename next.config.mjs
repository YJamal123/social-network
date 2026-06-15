/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for Cloud Run Dockerfile — produces a minimal standalone server bundle
  output: "standalone",
  experimental: {
    // Server Actions enforce an Origin === Host check (CSRF). When reached through
    // `gcloud run services proxy`, the browser Origin is localhost:8080 but the
    // proxied Host is the run.app domain, so the check rejects the request. Allow
    // the proxy origin (and the canonical host) so actions work in both setups.
    serverActions: {
      allowedOrigins: [
        "localhost:8080",
        "mdjamal-app-110062063496.us-central1.run.app",
      ],
    },
  },
};

export default nextConfig;
