import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/Order-Pad-React-TS/',
  server: { allowedHosts: ['terminal.local'] }
});