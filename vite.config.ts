import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { defineConfig } from "vite"

function getNodeModulePackageName(id: string): string | null {
  const marker = "/node_modules/"
  const nodeModulesIndex = id.lastIndexOf(marker)

  if (nodeModulesIndex === -1) {
    return null
  }

  const packagePath = id.slice(nodeModulesIndex + marker.length)
  const [scopeOrName, packageName] = packagePath.split("/")

  if (!scopeOrName) {
    return null
  }

  return scopeOrName.startsWith("@") && packageName
    ? `${scopeOrName}/${packageName}`
    : scopeOrName
}

function toChunkName(packageName: string): string {
  return packageName.replace(/^@/, "").replace(/[^a-zA-Z0-9_-]/g, "-")
}

function manualChunks(id: string): string | undefined {
  const packageName = getNodeModulePackageName(id)

  if (!packageName) {
    return undefined
  }

  if (packageName === "@tscircuit/runframe") {
    return "preview-runframe"
  }

  if (packageName === "@tscircuit/eval") {
    return "preview-tscircuit-eval"
  }

  if (packageName === "@tscircuit/core") {
    return "preview-tscircuit-core"
  }

  if (packageName === "@tscircuit/3d-viewer" || packageName === "three") {
    return "preview-3d-viewer"
  }

  if (packageName === "@tscircuit/pcb-viewer") {
    return "preview-pcb-viewer"
  }

  if (packageName === "@tscircuit/schematic-viewer" || packageName === "circuit-to-svg") {
    return "preview-schematic-viewer"
  }

  if (packageName === "circuit-json" || packageName === "@tscircuit/props") {
    return "preview-circuit-json"
  }

  if (packageName.startsWith("@tscircuit/") || packageName.startsWith("circuit-json")) {
    return `preview-${toChunkName(packageName)}`
  }

  return undefined
}

export default defineConfig({
  server: {
    port: 3000,
  },
  build: {
    // RunFrame PCB/CAD viewers are intentionally isolated behind the lazy
    // Preview tab. Keep the warning budget aligned with that explicit preview
    // payload instead of the editor's initial route chunks.
    chunkSizeWarningLimit: 7000,
    rolldownOptions: {
      output: {
        manualChunks,
      },
    },
  },
  plugins: [tanstackStart(), viteReact()],
})
