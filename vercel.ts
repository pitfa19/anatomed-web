import { routes, type VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  framework: 'vite',
  buildCommand: 'npm run build',
  outputDirectory: 'dist',
  // SPA fallback: deep-link routes like /docs, /viewer, /agent serve index.html.
  // Filesystem and Function matches take precedence, so /api/* and /assets/*
  // resolve normally and are not affected.
  rewrites: [routes.rewrite('/(.*)', '/index.html')],
};
