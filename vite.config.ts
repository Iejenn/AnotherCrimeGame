import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the build works both on GitHub Pages
  // (served from /AnotherCrimeGame/) and on Netlify (served from /).
  base: './',
});
