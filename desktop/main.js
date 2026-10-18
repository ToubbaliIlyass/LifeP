/*
 * Acture for Mac: the live app (app.acture.co) in a window of its own, with
 * a Dock icon, a menu bar, native notifications and the microphone.
 *
 * It is the same app as the website — nothing is bundled but this shell —
 * so it is always up to date. Three things are its own:
 *
 *  - Signing in. Google refuses to sign in inside an app's own window, so
 *    the Google step opens in the person's browser (/auth/desktop/start),
 *    and the browser hands the session back through an acture:// link,
 *    which this app opens at /auth/desktop/session.
 *  - Staying alive. Closing the window hides it, as Mac apps do, so the
 *    page keeps running and reminders still arrive as notifications.
 *  - Links elsewhere open in the browser, not in here.
 */
const { app, BrowserWindow, Menu, nativeTheme, session, shell, systemPreferences } = require('electron')

const APP_URL = (process.env.ACTURE_URL || 'https://app.acture.co').replace(/\/$/, '')
const ORIGIN = new URL(APP_URL).origin

let win = null
let quitting = false
/** An acture:// link that arrived before the window existed. */
let pendingLink = null

// One Acture at a time: a second launch (or a link) goes to the first.
if (!app.requestSingleInstanceLock()) app.quit()
app.setAsDefaultProtocolClient('acture')

/** The hops of Google sign-in, which must happen in the browser instead. */
function isSignInHop(url) {
  try {
    const u = new URL(url)
    return (u.hostname.endsWith('.supabase.co') && u.pathname.startsWith('/auth/v1/authorize'))
      || u.hostname === 'accounts.google.com'
  } catch { return false }
}

function show() {
  if (!win) createWindow()
  else { if (win.isMinimized()) win.restore(); win.show(); win.focus() }
}

/** acture://auth#access_token=…&refresh_token=… — the session, back from the browser. */
function openLink(url) {
  let u
  try { u = new URL(url) } catch { return }
  if (u.protocol !== 'acture:') return
  if (!win) { pendingLink = url; return }
  show()
  if (u.host === 'auth' && u.hash) win.loadURL(`${APP_URL}/auth/desktop/session${u.hash}`)
  else win.loadURL(`${APP_URL}/app`)
}

app.on('open-url', (event, url) => { event.preventDefault(); if (app.isReady()) openLink(url); else pendingLink = url })
app.on('second-instance', (_e, argv) => {
  const link = argv.find((a) => a.startsWith('acture://'))
  if (link) openLink(link)
  else show()
})

function createWindow() {
  win = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 380,
    minHeight: 480,
    show: false,
    title: 'Acture',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#141415' : '#fefffe',
    webPreferences: {
      preload: `${__dirname}/preload.js`,
      contextIsolation: true,
      sandbox: true,
      // Reminders are checked on a timer; a hidden window must keep time.
      backgroundThrottling: false,
      spellcheck: true,
    },
  })
  win.once('ready-to-show', () => win.show())

  const wc = win.webContents
  // Same origin stays in here; sign-in goes to the browser; anything else, too.
  const route = (event, url) => {
    if (isSignInHop(url)) {
      event.preventDefault()
      void shell.openExternal(`${APP_URL}/auth/desktop/start`)
      return
    }
    if (new URL(url).origin !== ORIGIN) {
      event.preventDefault()
      void shell.openExternal(url)
    }
  }
  wc.on('will-navigate', route)
  wc.on('will-redirect', route)
  wc.setWindowOpenHandler(({ url }) => {
    if (new URL(url).origin === ORIGIN) win.loadURL(url)
    else void shell.openExternal(url)
    return { action: 'deny' }
  })

  // Closing hides it — reminders keep coming. Quitting (⌘Q) really quits.
  win.on('close', (event) => {
    if (!quitting) { event.preventDefault(); win.hide() }
  })
  win.on('closed', () => { win = null })

  const link = pendingLink
  pendingLink = null
  if (link && link.startsWith('acture://auth#')) win.loadURL(`${APP_URL}/auth/desktop/session${new URL(link).hash}`)
  else win.loadURL(`${APP_URL}/app`)
}

function menu() {
  const template = [
    { role: 'appMenu' },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Today', accelerator: 'CmdOrCtrl+1', click: () => { show(); win.loadURL(`${APP_URL}/app#today`) } },
        { label: 'Inbox', accelerator: 'CmdOrCtrl+2', click: () => { show(); win.loadURL(`${APP_URL}/app#inbox`) } },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [{ label: 'Acture on the web', click: () => shell.openExternal(ORIGIN) }],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(() => {
  // What the page may ask for: notifications for reminders, the microphone
  // for capture. Nothing else.
  const allowed = new Set(['notifications', 'media', 'clipboard-sanitized-write'])
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    if (permission === 'media') {
      void systemPreferences.askForMediaAccess('microphone').then((ok) => callback(ok)).catch(() => callback(false))
      return
    }
    callback(allowed.has(permission))
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission))
  // So the site can tell it is in the Mac app.
  session.defaultSession.setUserAgent(`${session.defaultSession.getUserAgent()} ActureDesktop/${app.getVersion()}`)

  menu()
  createWindow()
  if (pendingLink) openLink(pendingLink)
})

app.on('activate', show)
app.on('before-quit', () => { quitting = true })
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
