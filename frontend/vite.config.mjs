import { defineConfig, loadEnv, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
const local = path => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const backend = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:5001';
  return {
    plugins: [
      {
        name: 'flip-card-jsx',
        enforce: 'pre',
        transform(code, id) {
          if (!id.includes('/react-native-flip-card/') || !id.endsWith('.js'))
            return;
          return transformWithEsbuild(code, id, {
            loader: 'jsx',
            jsx: 'automatic',
          });
        },
      },
      {
        name: 'native-web-assets',
        enforce: 'pre',
        transform(code, id) {
          if (!id.includes('/src/') || !/\.tsx?$/.test(id)) return;
          const result = code.replace(
            /require\(['"]([^'"]+\.png)['"]\)/g,
            (_, path) => `({ uri: new URL('${path}', import.meta.url).href })`,
          );
          return result === code ? null : { code: result, map: null };
        },
      },
      react({ babel: { babelrc: false, configFile: false } }),
    ],
    resolve: {
      alias: [
        { find: /^react-native$/, replacement: 'react-native-web' },
        {
          find: /^@react-native\/assets-registry\/registry$/,
          replacement: local(
            './node_modules/react-native-web/dist/modules/AssetRegistry/index.js',
          ),
        },
        {
          find: /^react-native-keychain$/,
          replacement: local('./web/keychain.ts'),
        },
        {
          find: /^react-native-webview$/,
          replacement: local('./web/WebView.tsx'),
        },
      ],
      extensions: [
        '.web.tsx',
        '.web.ts',
        '.web.jsx',
        '.web.js',
        '.tsx',
        '.ts',
        '.jsx',
        '.js',
        '.json',
      ],
      dedupe: ['react', 'react-dom'],
    },
    optimizeDeps: {
      esbuildOptions: {
        loader: { '.js': 'jsx' },
        resolveExtensions: [
          '.web.tsx',
          '.web.ts',
          '.web.jsx',
          '.web.js',
          '.tsx',
          '.ts',
          '.jsx',
          '.js',
          '.json',
        ],
      },
    },
    define: {
      global: 'globalThis',
      __DEV__: mode !== 'production',
      'process.env.NODE_ENV': JSON.stringify(mode),
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': backend,
        '/static': backend,
        '/socket.io': { target: backend, ws: true },
      },
    },
    build: { outDir: 'dist-web' },
  };
});
