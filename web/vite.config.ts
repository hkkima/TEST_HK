import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base must match the GitHub Pages sub-path (https://<user>.github.io/TEST_HK/).
// Override with VITE_BASE when deploying elsewhere (e.g. Firebase Hosting → "/").
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || '/TEST_HK/',
});
