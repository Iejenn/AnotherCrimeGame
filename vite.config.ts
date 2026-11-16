import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Every build gets its own id. It's baked into the game (__BUILD_ID__) and published next to it as
// version.json, so a running game can notice a newer build and reload itself (src/useUpdateCheck.ts).
const BUILD_ID = Date.now().toString(36);

const versionFile = (): Plugin => ({
  name: 'version-file',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) });
  },
});

export default defineConfig({
  plugins: [react(), versionFile()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  // Relative asset paths so the build works both on GitHub Pages
  // (served from /AnotherCrimeGame/) and on Netlify (served from /).
  base: './',
  // three.js makes the bundle ~200 KB gzipped; that's expected for the 3D Street view.
  build: { chunkSizeWarningLimit: 900 },
});
