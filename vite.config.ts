import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { defineConfig } from "vite"

export default defineConfig({
  optimizeDeps: {
    // This native, server-only dependency cannot be scanned as browser source.
    exclude: ["@resvg/resvg-js"],
  },
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  plugins: [
    tanstackStart(),
    nitro({
      routeRules: {
        "/**": {
          headers: {
            "Origin-Agent-Cluster": "?1",
            "Permissions-Policy": "tools=(self)",
          },
        },
      },
    }),
    viteReact(),
  ],
})
