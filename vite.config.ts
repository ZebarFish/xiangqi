
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, (process as any).cwd(), '')
  
  return {
    // 关键修复：设置基础路径为相对路径，解决安卓白屏问题
    base: './',
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate', 
        includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
        devOptions: {
          enabled: true 
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
          cleanupOutdatedCaches: true
        },
        manifest: {
          name: '亲情象棋',
          short_name: '亲情象棋',
          description: '专为家庭设计的在线视频象棋应用，AI辅助',
          theme_color: '#dbbf8e',
          background_color: '#dbbf8e',
          display: 'standalone', 
          orientation: 'portrait',
          start_url: '/',
          icons: [
            {
              src: '/icon.svg', 
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any maskable'
            },
            {
              src: '/icon.svg', 
              sizes: '512x512',
              type: 'image/svg+xml'
            }
          ]
        }
      })
    ],
    define: {
      // Polyfill process.env so your existing code works
      'process.env': JSON.stringify(env)
    }
  }
})