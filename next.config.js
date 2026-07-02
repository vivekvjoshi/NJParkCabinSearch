/** @type {import('next').NextConfig} */
const nextConfig = {
  // Playwright & the lambda chromium shim use dynamic requires — keep them
  // out of the webpack bundle and let dependency tracing ship them whole.
  serverExternalPackages: ['playwright', 'playwright-core', '@sparticuz/chromium-min'],
};

module.exports = nextConfig;
