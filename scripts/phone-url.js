// Prints the address to open on a phone. The LAN IP is looked up fresh each
// time rather than hardcoded, because it changes whenever the machine
// reconnects to the network — and a stale address looks exactly like the app
// being broken.
const os = require('os')

const PORT = process.env.PHONE_PORT || 3002

const ip = Object.values(os.networkInterfaces())
  .flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal)
  .map((i) => i.address)[0]

const line = '─'.repeat(46)

if (!ip) {
  console.log(`\n${line}\n  No network connection found.\n  Connect to Wi-Fi, then run this again.\n${line}\n`)
} else {
  console.log(
    `\n${line}\n` +
      `  On your phone, open:\n\n` +
      `      http://${ip}:${PORT}\n\n` +
      `  Same Wi-Fi as this Mac, and keep the Mac awake.\n` +
      `  In Chrome, make sure "Desktop site" is OFF.\n` +
      `${line}\n`,
  )
}
