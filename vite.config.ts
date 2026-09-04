import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

const BASE_PATH = ''

const GH_REDIRECT_SCRIPT =
  '<script>(function(){try{var p=location.pathname;if(p.indexOf("' +
  BASE_PATH +
  '")===0&&p!=="' +
  BASE_PATH +
  '"&&p!=="' +
  BASE_PATH +
  'index.html"){sessionStorage.setItem("__gh_redirect__",location.pathname+location.search+location.hash);location.replace("' +
  BASE_PATH +
  '");}}catch(e){}})();</script>'

function ghPagesFallback(): Plugin {
  return {
    name: 'gh-pages-404-fallback',
    apply: 'build',
    closeBundle() {
      const distDir = path.resolve(__dirname, 'dist')
      const indexPath = path.join(distDir, 'index.html')
      const fallbackPath = path.join(distDir, '404.html')
      if (!fs.existsSync(indexPath)) return
      let html = fs.readFileSync(indexPath, 'utf-8')
      if (!html.includes('__gh_redirect__')) {
        html = html.replace('<head>', '<head>' + GH_REDIRECT_SCRIPT)
      }
      fs.writeFileSync(fallbackPath, html)
      fs.writeFileSync(path.join(distDir, '.nojekyll'), '')
    },
  }
}

export default defineConfig({
  base: BASE_PATH,
  plugins: [react(), ghPagesFallback()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: false,
    cors: true,
    allowedHosts: true as unknown as string[],
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
    hmr: {
      overlay: true,
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: false,
    cors: true,
    allowedHosts: true as unknown as string[],
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
        },
      },
    },
  },
})
