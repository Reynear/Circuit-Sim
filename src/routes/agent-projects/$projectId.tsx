import { createFileRoute } from "@tanstack/react-router"
import { Schema } from "effect"
import { IdSchema } from "@circuit-sim/core/ids"
import { getAgentProjectForBrowser } from "@/server/agent/agent-project.functions"

const SearchSchema = Schema.Struct({
  snapshotId: Schema.optionalKey(IdSchema),
  circuitHash: Schema.optionalKey(Schema.NonEmptyString),
  focus: Schema.optionalKey(Schema.NonEmptyString),
})

export const Route = createFileRoute("/agent-projects/$projectId")({
  validateSearch: (raw: unknown) =>
    Schema.decodeUnknownSync(SearchSchema, { onExcessProperty: "error" })(raw),
  loaderDeps: ({ search }) => search,
  loader: ({ params, deps }) =>
    getAgentProjectForBrowser({
      data: {
        projectId: params.projectId,
        ...(deps.snapshotId === undefined ? {} : { snapshotId: deps.snapshotId }),
        ...(deps.circuitHash === undefined ? {} : { circuitHash: deps.circuitHash }),
        ...(deps.focus === undefined ? {} : { focus: deps.focus }),
      },
    }),
  component: AgentProjectView,
})

function AgentProjectView() {
  const result = Route.useLoaderData()
  if (result._tag === "failure") {
    return (
      <main style={pageStyle}>
        <h1>Agent circuit unavailable</h1>
        <p>{result.message}</p>
        <code>{result.error}</code>
      </main>
    )
  }

  const warningItems = [
    ...result.warnings.map((warning) => `Render: ${warning}`),
    ...result.ercWarnings.map((warning) => `ERC: ${warning}`),
  ]
  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>
            Immutable agent snapshot · version {result.version}
          </p>
          <h1 style={{ marginBottom: 8 }}>{result.projectName}</h1>
          <p style={metaStyle}>
            Snapshot {result.snapshot.snapshotId} · circuit {result.snapshot.circuitHash}
          </p>
        </div>
        <a href={result.currentProjectUrl} style={currentLinkStyle}>
          View current project
        </a>
      </header>
      <section style={canvasFrameStyle} aria-label="Circuit schematic">
        <img
          src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.svg)}`}
          alt={result.caption}
          style={schematicImageStyle}
        />
      </section>
      {warningItems.length > 0 ? (
        <section style={warningStyle}>
          <h2 style={{ marginTop: 0 }}>Checks</h2>
          <ul>
            {warningItems.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </section>
      ) : null}
    </main>
  )
}

const pageStyle = {
  maxWidth: 1400,
  margin: "0 auto",
  padding: "32px clamp(16px, 4vw, 64px)",
  color: "#162536",
  background: "#f4f7fa",
  minHeight: "100vh",
} as const

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 24,
  flexWrap: "wrap",
  marginBottom: 20,
} as const

const eyebrowStyle = {
  margin: 0,
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  fontSize: 12,
  color: "#536579",
} as const

const metaStyle = {
  margin: 0,
  color: "#536579",
  fontFamily: "monospace",
  overflowWrap: "anywhere",
} as const

const currentLinkStyle = { color: "#b53c0c", fontWeight: 700 } as const

const canvasFrameStyle = {
  overflow: "hidden",
  border: "1px solid #cbd5df",
  borderRadius: 14,
  background: "#ffffff",
  boxShadow: "0 16px 48px rgba(38, 56, 74, 0.12)",
  padding: 16,
} as const

const schematicImageStyle = {
  width: "100%",
  height: "min(72vh, 820px)",
  display: "block",
  objectFit: "contain",
} as const

const warningStyle = {
  marginTop: 20,
  border: "1px solid #f0c36e",
  borderRadius: 10,
  background: "#fff8e6",
  padding: 16,
} as const
