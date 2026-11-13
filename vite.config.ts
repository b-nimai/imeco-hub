import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // import.meta.dirname rather than __dirname — the latter is unavailable under Vite's
      // native config loader.
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  // Fixed dev/preview port: the Google API key's website allow-list names the exact origin
  // (http://localhost:5173), and Google rejects a wildcard port. strictPort makes a clash an
  // error instead of silently moving to a port the key would refuse.
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
  build: {
    rolldownOptions: {
      output: {
        // React + router change far less often than dashboard code, so they get their own
        // long-cached chunk. Each dashboard is already split by its lazy `load()`.
        codeSplitting: {
          groups: [
            {
              name: 'vendor-react',
              // clsx is used by the shared UI *and* by recharts; pinning it here (higher
              // priority) stops it from dragging the charts chunk into every page.
              test: /node_modules[\\/](react|react-dom|react-router|scheduler|clsx)[\\/]/,
              priority: 20,
            },
            {
              // Charting for Sales only — still lazy (loaded with that dashboard), but cached
              // apart from its code so a Sales change doesn't re-download ~400 kB of charts.
              name: 'vendor-charts',
              priority: 10,
              test: /node_modules[\\/](recharts|d3-[^\\/]+|victory-vendor|internmap|decimal\.js-light|lodash|react-smooth|recharts-scale|eventemitter3|tiny-invariant)[\\/]/,
            },
          ],
        },
      },
    },
  },
});
