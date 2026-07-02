/** @type {import('next').NextConfig} */
const nextConfig = {
  // Playwright & the lambda chromium shim use dynamic requires — keep them
  // out of the webpack bundle and let dependency tracing ship them whole.
  serverExternalPackages: ['playwright', 'playwright-core', '@sparticuz/chromium-min'],
  // Dependency tracing only follows JS requires, which misses assets like
  // playwright-core/browsers.json — force-include the whole packages.
  outputFileTracingIncludes: {
    '/api/**': [
      'node_modules/playwright-core/**',
      'node_modules/@sparticuz/chromium-min/**',
    ],
  },
};

module.exports = nextConfig;
