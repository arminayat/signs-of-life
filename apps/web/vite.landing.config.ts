import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL("./landing", import.meta.url)),
  server: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: true,
    watch: { usePolling: true, interval: 300 },
  },
  build: {
    outDir: fileURLToPath(new URL("./dist-landing", import.meta.url)),
    emptyOutDir: true,
  },
});
