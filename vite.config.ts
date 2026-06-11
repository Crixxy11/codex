import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Base path: '/' for local dev, '/<repo>/' when deploying to GitHub Pages
const base = process.env.VITE_BASE || '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*'],
      manifest: {
        name: 'Codex',
        short_name: 'Codex',
        description: 'Tu biblioteca personal de lectura',
        lang: 'es',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f4efe6',
        theme_color: '#f4efe6',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Los WASM de onnxruntime (12–25 MB) se cachean bajo demanda,
        // no en el precache: solo hacen falta si se usan voces neuronales.
        globIgnores: ['**/ort/**', '**/*.wasm'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Cache the TTS runtime (onnxruntime + piper wasm) and voice model
        // metadata so neural voices keep working fully offline once downloaded.
        runtimeCaching: [
          {
            urlPattern: /\/(ort\/.*|.*\.wasm)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tts-onnx-local',
              expiration: { maxEntries: 12 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/onnxruntime-web/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tts-onnx-runtime',
              expiration: { maxEntries: 20 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/@diffusionstudio\/piper-wasm/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tts-piper-wasm',
              expiration: { maxEntries: 20 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/huggingface\.co\/diffusionstudio\/piper-voices/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tts-voice-meta',
              expiration: { maxEntries: 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
})
