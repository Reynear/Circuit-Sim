import viteReact from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

const coreTests = [
  "tests/unit/lib/ids.test.ts",
  "tests/unit/lib/agent/**/*.test.ts",
  "tests/unit/lib/schematic/{commands,component-geometry,components,editor-interaction,electrical-circuit,erc,geometry,hit-testing,lead-annotation-geometry,net-extraction,placement,post-endpoints,post-markers,project,schematic-text,selection-rect,values,wire-routing}.test.ts",
  "tests/unit/lib/simulation/{result,run-observations,signals}.test.ts",
]

const serverTests = [
  "tests/unit/lib/simulation/{ngspice-output,spice-runtime-limits,spice-solver}.test.ts",
]

export default defineConfig({
  plugins: [viteReact()],
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "core",
          environment: "node",
          globals: true,
          include: coreTests,
        },
      },
      {
        extends: true,
        test: {
          name: "server",
          environment: "node",
          globals: true,
          include: serverTests,
        },
      },
      {
        extends: true,
        test: {
          name: "browser",
          environment: "jsdom",
          globals: true,
          include: ["tests/**/*.test.{ts,tsx}"],
          exclude: [...coreTests, ...serverTests],
          setupFiles: ["tests/setup.ts"],
        },
      },
    ],
  },
})
