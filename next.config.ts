import type { NextConfig } from "next";

// The app is served at https://www.anshumanbuilds.dev/resolve through a proxy on the main site.
// Set NEXT_PUBLIC_BASE_PATH to an empty string to serve from the domain root instead.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '/resolve';

const nextConfig: NextConfig = {
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  // The floating dev badge sits on top of the page; turned off so it stays out of the demo recording.
  devIndicators: false,
};

export default nextConfig;
