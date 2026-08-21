import { Link, createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/")({
  component: HomePage,
})

function HomePage() {
  return (
    <main className="home-page">
      <section className="home-panel">
        <h1>Circuit Sim</h1>
        <p>Browser schematic design, ERC, generated tscircuit, and demo simulation.</p>
        <Link className="primary-link" to="/projects">
          Open projects
        </Link>
      </section>
    </main>
  )
}
