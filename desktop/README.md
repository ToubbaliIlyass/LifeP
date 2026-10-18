# Acture for Mac

A native Mac window around the live app at https://app.acture.co — Dock
icon, menu bar, native notifications, the microphone — built with Electron.
Nothing of the app is bundled: it loads the site, so it is always current.

```sh
npm install
npm start          # run it against app.acture.co
npm run dev        # run it against a local dev server on :3000
npm run dist       # build dist/Acture-<version>-arm64.dmg and -x64.dmg
```

**Signing in** happens in your browser (Google does not allow sign-in inside
app windows): the app opens `/auth/desktop/start`, and after Google the
browser hands the session back through an `acture://` link.

**Unsigned.** Without an Apple Developer ID, macOS warns the first time:
right-click Acture in Applications → Open → Open. (With an ID, set
`mac.identity` and notarization in package.json.)

**Reminders** show as native notifications while Acture is running — closing
the window only hides it; quit with ⌘Q.
