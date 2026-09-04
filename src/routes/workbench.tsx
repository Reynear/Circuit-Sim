import { createFileRoute } from "@tanstack/react-router"
import { AgentWorkbench } from "@/features/projects/AgentWorkbench"

export const Route = createFileRoute("/workbench")({
  ssr: false,
  component: AgentWorkbench,
})
