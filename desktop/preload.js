/*
 * The only thing the Mac app tells the page: that it is the Mac app. The
 * page uses it to skip what makes no sense here (an "Install the app"
 * offer, say). No other bridge into Node or Electron is opened.
 */
const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('actureDesktop', { platform: process.platform })
