import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Trigger CI deployment
export default defineConfig({
  base: '/fossilmap/',
  plugins: [
    react(),
    VitePWA({
      // Prompt before applying a new service worker so a mid-fieldwork update
      // never reloads the app without the user's consent.
      registerType: 'prompt',
      includeAssets: ['logo.svg'],
      manifest: {
        name: 'FossilMap UK',
        short_name: 'FossilMap',
        description: 'Offline geological field data collection',
        theme_color: '#3b82f6',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/fossilmap/',
        icons: [
          {
            src: 'logo-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'logo-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: 'logo.svg',
            sizes: 'any',
            type: 'image/svg+xml'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      },
      devOptions: {
        enabled: true,
      }
    })
  ],
})
