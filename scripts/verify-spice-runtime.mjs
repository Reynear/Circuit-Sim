import { spawn } from "node:child_process"

const imageTag = process.env.SPICE_RUNTIME_IMAGE ?? "circuit-sim-ngspice-check"

async function main() {
  await run("docker", ["version"])
  await run("docker", ["build", "-t", imageTag, "."])
  const versionOutput = await run("docker", [
    "run",
    "--rm",
    imageTag,
    "ngspice",
    "--version",
  ])
  if (!/ngspice/i.test(versionOutput)) {
    throw new Error("Docker image did not report an ngspice version.")
  }
  console.log(`Verified ngspice runtime in Docker image ${imageTag}.`)
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => {
      const text = String(chunk)
      stdout += text
      process.stdout.write(text)
    })
    child.stderr.on("data", (chunk) => {
      const text = String(chunk)
      stderr += text
      process.stderr.write(text)
    })
    child.on("error", reject)
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout)
        return
      }
      reject(
        new Error(
          [
            `${command} ${args.join(" ")} exited with code ${code}.`,
            stderr.trim(),
            "Start Docker Desktop or point DOCKER_HOST at a reachable Docker daemon, then rerun npm run verify:spice-runtime.",
          ]
            .filter(Boolean)
            .join("\n"),
        ),
      )
    })
  })
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
