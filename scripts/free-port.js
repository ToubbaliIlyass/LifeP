/**
 * Frees a port before something tries to listen on it.
 *
 * Without this, `npm run phone` would build successfully, fail to start with
 * EADDRINUSE, and leave an older server still answering on the same port —
 * so the phone would load a stale build while everything looked fine. That
 * is indistinguishable from "my changes didn't work", which is the worst
 * possible failure to debug remotely.
 *
 * Only matches the process actually listening on the port, so it cannot
 * take down anything unrelated.
 */
const { execSync } = require('child_process')

const port = process.argv[2]
if (!port) {
  console.error('usage: node scripts/free-port.js <port>')
  process.exit(1)
}

try {
  const pids = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .split('\n')
    .map((p) => p.trim())
    .filter(Boolean)

  for (const pid of pids) {
    process.kill(Number(pid))
    console.log(`Freed port ${port} (stopped stale process ${pid})`)
  }
} catch {
  // lsof exits non-zero when nothing is listening, which is the normal case.
}
