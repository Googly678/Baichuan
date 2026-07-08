import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = (env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3000').replace(/\/$/, '')

  // base path：
  //   - GitHub Pages 用户页：'/仓库名/'（通过 VITE_BASE_PATH 注入）
  //   - 自定义域名或用户首页：'/'
  //   - 本地开发：'./'（相对路径，Vite 自动适配）
  // 部署时用 VITE_BASE_PATH 覆盖，默认 './'（最稳妥）
  const base = env.VITE_BASE_PATH || './'

  return {
    base,
    server: {
      host: '0.0.0.0',
      port: 5174,
      strictPort: true,
      proxy: {
        '/login': proxyTarget,
        '/health': proxyTarget,
        '/claims': proxyTarget,
        '/core-claims': proxyTarget,
        '/icd10': proxyTarget,
        '/work-injury-standards': proxyTarget,
        '/hospitals': proxyTarget,
        '/vehicles': proxyTarget,
        '/repair-order': proxyTarget,
        '/audit-logs': proxyTarget,
        '/re-inspections': proxyTarget,
        '/investigations': proxyTarget,
        '/litigations': proxyTarget,
        '/regions': proxyTarget,
      },
    },
  }
})