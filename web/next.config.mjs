/** @type {import('next').NextConfig} */
const API = process.env.API_URL || "https://my-agent-roan-delta.vercel.app";
// LOCAL_EXPORT=1 builds a plain static site (web/out) that the PC backend serves itself at http://localhost:8000.
// Rewrites and headers only exist for the hosted (Vercel) build; the backend adds its own headers when serving the export.
const EXPORT = process.env.LOCAL_EXPORT === "1";
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  ...(EXPORT ? { output: "export", trailingSlash: false } : {}),
  async rewrites() {
    if (EXPORT) return [];
    // Same-origin /api/* is proxied to the Python backend, so the browser never needs CORS and no token ever leaves our domains.
    return [{ source: "/api/:path*", destination: `${API}/api/:path*` }];
  },
  async headers() {
    if (EXPORT) return [];
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""),
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob: data:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
      ],
    }];
  },
};
export default nextConfig;
