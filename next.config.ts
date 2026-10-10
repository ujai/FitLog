import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // A deliberately strict policy with one exception, not a strict one. Next
      // inlines its bootstrap and hydration payload, so script-src without
      // 'unsafe-inline' needs a nonce — and a nonce is affordable here: every
      // page is already dynamic (the (app) layout and /login both read
      // headers(), so nothing is prerendered and nothing is traded away). The
      // exception is kept anyway, on the residual-risk reasoning below — with no
      // injection sink in this app a nonce would add machinery without removing
      // a reachable attack. Revisit if that balance changes.
      //
      // Accepted residual risk: 'unsafe-inline' means an injected inline script
      // would run. Nothing here can inject one — no dangerouslySetInnerHTML or
      // .innerHTML anywhere in src/, no third-party or <Script> tags, and all
      // output is React-escaped — so the exposure is a compromised dependency or a
      // browser extension, not a sink in our own code. Revisit if either changes.
      // React dev tools need eval() (never used in production builds), and
      // browser-automation/design tooling may inject helper scripts and run a
      // WASM core, so dev additionally allows localhost + wasm-eval.
      `script-src 'self' 'unsafe-inline'${
        isDev ? " 'unsafe-eval' 'wasm-unsafe-eval' http://localhost:*" : ""
      }`,
      // Same story for styles: Next injects critical CSS inline.
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      `connect-src 'self'${isDev ? " http://localhost:*" : ""}`,
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // Screenshots are downscaled client-side to <2MB; allow headroom for the base64 overhead
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
