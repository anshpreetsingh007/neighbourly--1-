import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {},
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // Set DISABLE_HMR=true to turn off hot module reload.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    build: {
      rollupOptions: {
        output: {
          /**
           * Split the big third-party libraries out of the app bundle.
           *
           * These change only when a dependency is upgraded, while app code
           * changes on every deploy - keeping them in one chunk meant every
           * deploy invalidated the whole download for returning visitors.
           * React and the router stay together on purpose: splitting a
           * library from its own context provider risks loading two copies.
           */
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            motion: ['framer-motion'],
            supabase: ['@supabase/supabase-js'],
            realtime: ['socket.io-client'],
          },
        },
      },
    },
  };
});
