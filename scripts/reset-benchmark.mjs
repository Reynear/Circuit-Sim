import { spawnSync } from "node:child_process"

runCompose(["down"])
runCompose(["up", "--build", "--wait"])

function runCompose(arguments_) {
  const result = spawnSync("docker", ["compose", ...arguments_], {
    cwd: process.cwd(),
    stdio: "inherit",
  })
  if (result.error) {
    process.stderr.write(`${result.error.message}\n`)
    process.exit(result.status ?? 1)
  }
  if (result.status !== 0) process.exit(result.status ?? 1)
}
