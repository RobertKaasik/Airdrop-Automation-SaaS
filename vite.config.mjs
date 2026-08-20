import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'ui-dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: 'src/ui.jsx',
      output: {
        entryFileNames: 'react-ui.js',
        assetFileNames: 'react-ui.[ext]'
      }
    }
  }
});
