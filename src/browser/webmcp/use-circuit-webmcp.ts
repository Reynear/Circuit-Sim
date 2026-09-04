import { useServerFn } from "@tanstack/react-start"
import { Cause, Effect, Exit, Option } from "effect"
import { useEffect, useRef, useState } from "react"
import type * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { observeRun } from "@circuit-sim/core/simulation/run-observations"
import type { SpiceEnginePreference } from "@circuit-sim/core/simulation/result"
import {
  getEditorState,
} from "@/browser/editor/editor-state"
import {
  runAndRecordSimulation,
  simulationRequestErrorMessage,
} from "@/browser/simulation/run-atom"
import { runSpiceSimulationOnServer } from "@/server/simulation/spice.functions"
import {
  makeCircuitWebMcpTools,
  type WebMcpActivity,
  type WebMcpSimulationResult,
} from "./circuit-tools"

export type WebMcpRegistrationState =
  | "checking"
  | "ready"
  | "unsupported"
  | "error"

export function useCircuitWebMcp({
  registry,
  onActivity,
}: {
  readonly registry: AtomRegistry.AtomRegistry
  readonly onActivity: (activity: WebMcpActivity) => void
}): WebMcpRegistrationState {
  const runServerSimulation = useServerFn(runSpiceSimulationOnServer)
  const activityRef = useRef(onActivity)
  const simulationRunnerRef = useRef(runServerSimulation)
  const [registrationState, setRegistrationState] =
    useState<WebMcpRegistrationState>("checking")

  activityRef.current = onActivity
  simulationRunnerRef.current = runServerSimulation

  useEffect(() => {
    const modelContext = document.modelContext
    if (typeof modelContext?.registerTool !== "function") {
      setRegistrationState("unsupported")
      return
    }

    const controller = new AbortController()
    let active = true
    const tools = makeCircuitWebMcpTools({
      getState: () => getEditorState(registry),
      runSimulation: (engine, signal) =>
        runSimulation(registry, simulationRunnerRef.current, engine, signal, (activity) =>
          activityRef.current(activity),
        ),
      onActivity: (activity) => activityRef.current(activity),
    })

    void Promise.all(
      tools.map((tool) =>
        modelContext.registerTool(tool, { signal: controller.signal }),
      ),
    ).then(
      () => {
        if (active) setRegistrationState("ready")
      },
      () => {
        if (active && !controller.signal.aborted) {
          setRegistrationState("error")
        }
      },
    )

    return () => {
      active = false
      controller.abort()
    }
  }, [registry])

  return registrationState
}

async function runSimulation(
  registry: AtomRegistry.AtomRegistry,
  runServerSimulation: Parameters<typeof runAndRecordSimulation>[0],
  engine: SpiceEnginePreference,
  signal: AbortSignal,
  onActivity: (activity: WebMcpActivity) => void,
): Promise<WebMcpSimulationResult> {
  const state = getEditorState(registry)
  if (!state.project) {
    return failure("NoActiveProject", "No circuit project is loaded on this page.", false)
  }

  onActivity({ message: `Agent is running ${engine}…`, panel: "simulation" })
  const outcome = await Effect.runPromiseExit(
    runAndRecordSimulation(runServerSimulation, {
      project: state.project,
      engine,
    }),
    { signal },
  )
  if (Exit.isFailure(outcome)) {
    if (signal.aborted) {
      return failure("SimulationCanceled", "The simulation was canceled.", true)
    }
    const error = Option.getOrUndefined(Cause.findErrorOption(outcome.cause))
    return failure(
      "SimulationRequestFailed",
      simulationRequestErrorMessage(error ?? outcome.cause),
      true,
    )
  }
  if (outcome.value._tag === "PersistenceFailure") {
    return failure(
      "SimulationPersistenceFailed",
      `SPICE completed, but the exact simulation run could not be stored: ${outcome.value.error.operation}.`,
      true,
    )
  }

  const run = outcome.value.run
  getEditorState(registry).setLatestRun(run)
  const currentProject = getEditorState(registry).project
  const observations = observeRun(currentProject ?? state.project, run)
  onActivity({
    message: `Agent completed ${engine} simulation for circuit ${run.circuitHash.slice(0, 8)}.`,
    panel: "simulation",
  })
  return {
    _tag: "Success",
    data: {
      run: observations.run,
      netVoltages: observations.netVoltages,
      componentMeasurements: observations.componentMeasurements,
      probeMeasurements: observations.probeMeasurements,
      notes: observations.notes,
    },
  }
}

function failure(
  code: string,
  message: string,
  retryable: boolean,
): WebMcpSimulationResult {
  return {
    _tag: "Failure",
    error: { code, message, retryable },
  }
}
