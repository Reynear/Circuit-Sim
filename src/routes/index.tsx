import { Link, createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/")({
  component: HomePage,
})

function HomePage() {
  return (
    <main className="home-page">
      <section className="home-panel">
        <h1>Circuit Sim</h1>
        <p>
          A shared browser workbench where people and agents design, inspect,
          and simulate the same circuit.
        </p>
        <div className="button-row">
          <Link className="primary-link" to="/workbench">
            Open Agent Workbench
          </Link>
          <Link className="button" to="/projects">
            Browse Projects
          </Link>
        </div>
      </section>
    </main>
  )
}
