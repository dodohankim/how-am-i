import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 개발 모드에서는 /api 요청을 파이썬 서버(scripts/serve.py)로 넘긴다.
// 빌드 결과(dist/)는 그 파이썬 서버가 직접 서빙하므로 프록시가 필요 없다.
const API = process.env.HOWAMI_API ?? "http://127.0.0.1:7788";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: { "/api": { target: API, changeOrigin: false } },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
