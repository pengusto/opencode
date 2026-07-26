import windowState from "electron-window-state"
import { resolveThemeVariant } from "@opencode-ai/ui/theme/resolve"
import type { DesktopTheme } from "@opencode-ai/ui/theme/types"
import type { CompanionOverlaySnapshot } from "@opencode-ai/app/task-companion"
import oc2ThemeJson from "../../../ui/src/theme/themes/oc-2.json"
import { randomUUID } from "node:crypto"
import { rmSync } from "node:fs"
import { app, BrowserWindow, dialog, net, nativeImage, nativeTheme, protocol, screen } from "electron"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import type { TitlebarTheme } from "../preload/types"
import { exportDebugLogs, write as writeLog } from "./logging"
import { getStore, removeStoreFile } from "./store"
import { COMPANION_POSITION_KEY, PINCH_ZOOM_ENABLED_KEY, WINDOW_IDS_KEY } from "./store-keys"
import { createUnresponsiveSampler } from "./unresponsive"
import { createWindowRegistry } from "./window-registry"
import { safeWindowURL } from "./window-state"
import { clampCompanionBounds, companionDragBounds, parseCompanionWindowPosition } from "./companion-window"

const root = dirname(fileURLToPath(import.meta.url))
const rendererRoot = join(root, "../renderer")
const rendererProtocol = "oc"
const rendererHost = "renderer"
const clipboardWritePermission = "clipboard-sanitized-write"
const notificationPermission = "notifications"
const rendererPermissions = new Set([clipboardWritePermission, notificationPermission])
const oc2Theme = oc2ThemeJson as DesktopTheme
const oc2Background = {
  light: resolveThemeVariant(oc2Theme.light, false)["background-base"],
  dark: resolveThemeVariant(oc2Theme.dark, true)["background-base"],
}
const documentPolicyHeader = "Document-Policy"
const jsCallStacksDocumentPolicy = "include-js-call-stacks-in-crash-reports"

protocol.registerSchemesAsPrivileged([
  {
    scheme: rendererProtocol,
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
])

let backgroundColor: string | undefined
let relaunchHandler = () => {
  setAppQuitting()
  app.relaunch()
  app.exit(0)
}
const titlebarThemes = new WeakMap<BrowserWindow, Partial<TitlebarTheme>>()
const pinchZoomEnabled = new WeakMap<BrowserWindow, boolean>()
const windowIDs = new WeakMap<BrowserWindow, string>()
const registry = createWindowRegistry<BrowserWindow>({
  read: () => getStore().get(WINDOW_IDS_KEY),
  write: (ids) => getStore().set(WINDOW_IDS_KEY, ids),
  cleanup: (id) => {
    rmSync(join(app.getPath("userData"), windowStateFile(id)), { force: true })
    removeStoreFile(windowDataFile(id))
  },
})
const titlebarHeight = 40
const maxZoomLevel = 10
const minZoomLevel = 0.2
const companionSize = { width: 350, height: 500 }
const companionSnapshots = new WeakMap<BrowserWindow, CompanionOverlaySnapshot>()
let companionWindow: BrowserWindow | undefined
let companionSource: BrowserWindow | undefined
let companionReady = false
let companionDrag:
  | { cursor: { x: number; y: number }; bounds: { x: number; y: number; width: number; height: number } }
  | undefined
let companionDisplaysWired = false
let appQuitting = false

export function setRelaunchHandler(handler: () => void) {
  relaunchHandler = handler
}

export function setAppQuitting(quitting = true) {
  appQuitting = quitting
  registry.setQuitting(quitting)
}

export function setBackgroundColor(color: string) {
  backgroundColor = color
  BrowserWindow.getAllWindows().forEach((win) => {
    win.setBackgroundColor(color)
    if (process.platform === "darwin") win.invalidateShadow()
  })
}

export function getBackgroundColor(): string | undefined {
  return backgroundColor
}

function iconsDir() {
  return app.isPackaged ? join(process.resourcesPath, "icons") : join(root, "../../resources/icons")
}

function iconPath() {
  const ext = process.platform === "win32" ? "ico" : "png"
  return join(iconsDir(), `icon.${ext}`)
}

function tone() {
  return nativeTheme.shouldUseDarkColors ? "dark" : "light"
}

function defaultBackgroundColor() {
  return oc2Background[tone()]
}

function overlay(theme: Partial<TitlebarTheme> = {}, zoom = 1) {
  const mode = theme.mode ?? tone()
  return {
    color: "#00000000",
    symbolColor: mode === "dark" ? "white" : "black",
    height: Math.max(titlebarHeight, Math.round(titlebarHeight * zoom)),
  }
}

export function setTitlebar(win: BrowserWindow, theme: Partial<TitlebarTheme> = {}) {
  titlebarThemes.set(win, theme)
  // macOS draws the window frame hairline and shadow using the NSWindow
  // appearance, which follows nativeTheme rather than the rendered content.
  // Align it with the app theme so a light app on a dark system does not get
  // the dark-appearance border and shadow. A "system" scheme must map to
  // "system" (not the resolved mode) or prefers-color-scheme stops tracking
  // OS appearance changes in the renderer.
  if (process.platform === "darwin") nativeTheme.themeSource = theme.scheme ?? theme.mode ?? "system"
  updateTitlebar(win)
}

export function updateTitlebar(win: BrowserWindow) {
  if (process.platform !== "win32") return
  win.setTitleBarOverlay(overlay(titlebarThemes.get(win), win.webContents.getZoomFactor()))
}

export function setPinchZoomEnabled(enabled: boolean) {
  getStore().set(PINCH_ZOOM_ENABLED_KEY, enabled)
  for (const win of BrowserWindow.getAllWindows()) {
    pinchZoomEnabled.set(win, enabled)
    win.webContents.send("pinch-zoom-enabled-changed", enabled)
    if (!enabled && win.webContents.getZoomFactor() !== 1) win.webContents.setZoomFactor(1)
    updateZoom(win)
  }
}

export function getPinchZoomEnabled() {
  return getStore().get(PINCH_ZOOM_ENABLED_KEY) === true
}

export function getWindowID(win: BrowserWindow) {
  return windowIDs.get(win)
}

export function getLastFocusedWindow() {
  const focused = BrowserWindow.getFocusedWindow()
  if (focused && windowIDs.has(focused)) return focused
  const win = registry.lastFocused()
  if (!win || win.isDestroyed()) return null
  return win
}

export function restoreMainWindows() {
  const ids = registry.persisted()
  return (ids.length ? ids : [randomUUID()]).map((id) => createMainWindow(id))
}

export function setDockIcon() {
  if (process.platform !== "darwin") return
  const icon = nativeImage.createFromPath(join(iconsDir(), "dock.png"))
  if (!icon.isEmpty()) app.dock?.setIcon(icon)
}

export function createMainWindow(id: string = randomUUID()) {
  const state = windowState({
    file: windowStateFile(id),
    defaultWidth: 1280,
    defaultHeight: 800,
  })

  const mode = tone()
  const win = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    show: false,
    autoHideMenuBar: true,
    title: "OpenCode",
    icon: iconPath(),
    backgroundColor: backgroundColor ?? defaultBackgroundColor(),
    ...(process.platform === "darwin"
      ? {
          titleBarStyle: "hidden" as const,
          trafficLightPosition: { x: 14, y: 14 },
        }
      : {}),
    ...(process.platform === "win32"
      ? {
          frame: false,
          titleBarStyle: "hidden" as const,
          titleBarOverlay: overlay({ mode }),
        }
      : {}),
    webPreferences: {
      preload: join(root, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  allowRendererPermissions(win)
  wireWindowRecovery(win, id)

  win.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
    const { requestHeaders } = details
    upsertKeyValue(requestHeaders, "Access-Control-Allow-Origin", ["*"])
    callback({ requestHeaders })
  })

  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const { responseHeaders = {} } = details
    addRendererHeaders(details.url, responseHeaders)
    callback({ responseHeaders })
  })

  state.manage(win)
  registerWindow(win, id)
  loadWindow(win, "index.html")
  wireZoom(win)

  win.once("ready-to-show", () => {
    win.show()
  })

  return win
}

function registerWindow(win: BrowserWindow, id: string) {
  windowIDs.set(win, id)
  registry.register(id, win)

  win.on("focus", () => {
    registry.focused(id)
    companionSource = win
    updateCompanionWindow()
  })
  // Windows never emits before-quit on OS shutdown/logoff, but each window
  // gets session-end before it closes; flag the quit so ids stay persisted.
  win.on("session-end", () => registry.setQuitting())
  win.webContents.on("render-process-gone", () => {
    companionSnapshots.delete(win)
    if (companionSource === win) updateCompanionWindow()
  })
  win.on("closed", () => {
    companionSnapshots.delete(win)
    registry.closed(id)
    if (companionSource !== win) return
    companionSource = registry.lastFocused()
    updateCompanionWindow()
  })
}

export function publishCompanionSnapshot(win: BrowserWindow, snapshot: CompanionOverlaySnapshot) {
  if (!windowIDs.has(win)) return
  companionSnapshots.set(win, snapshot)
  const active = getLastFocusedWindow()
  if (!companionSource || active === win) companionSource = win
  if (companionSource !== win) return
  updateCompanionWindow()
}

export function isCompanionWindow(win: BrowserWindow | null): win is BrowserWindow {
  return !!win && win === companionWindow
}

export function companionRendererReady(win: BrowserWindow | null) {
  if (!isCompanionWindow(win)) return
  companionReady = true
  updateCompanionWindow()
}

export function startCompanionDrag(win: BrowserWindow | null) {
  if (!isCompanionWindow(win)) return
  companionDrag = { cursor: screen.getCursorScreenPoint(), bounds: win.getBounds() }
}

export function moveCompanionWindow(win: BrowserWindow | null) {
  if (!isCompanionWindow(win) || !companionDrag) return
  const cursor = screen.getCursorScreenPoint()
  if (cursor.x === companionDrag.cursor.x && cursor.y === companionDrag.cursor.y) return
  const next = clampCompanionBounds(
    companionDragBounds(companionDrag.bounds, companionDrag.cursor, cursor),
    screen.getDisplayNearestPoint(cursor).bounds,
  )
  win.setPosition(next.x, next.y)
}

export function reanchorCompanionWindow(win: BrowserWindow | null, deltaY: unknown) {
  if (!isCompanionWindow(win) || typeof deltaY !== "number" || !Number.isFinite(deltaY) || Math.abs(deltaY) > 500)
    return
  const bounds = win.getBounds()
  const next = clampCompanionBounds(
    { ...bounds, y: bounds.y + deltaY },
    screen.getDisplayMatching(bounds).bounds,
  )
  const applied = next.y - bounds.y
  win.setPosition(next.x, next.y)
  if (companionDrag) companionDrag.bounds.y += applied
}

export function finishCompanionDrag(win: BrowserWindow | null) {
  if (!isCompanionWindow(win)) return
  companionDrag = undefined
  restoreCompanionBounds()
  persistCompanionPosition()
}

export function setCompanionInteractive(win: BrowserWindow | null, interactive: unknown) {
  if (!isCompanionWindow(win) || typeof interactive !== "boolean") return
  if (process.platform === "linux") return
  win.setIgnoreMouseEvents(!interactive, { forward: !interactive })
}

export function openCompanionSession(win: BrowserWindow | null, sessionID: unknown) {
  if (!isCompanionWindow(win) || typeof sessionID !== "string") return
  const source = companionSource
  if (!source || source.isDestroyed()) return
  const session = companionSnapshots.get(source)?.sessions.find((item) => item.id === sessionID)
  if (!session) return
  source.show()
  source.focus()
  source.webContents.send("companion-open-session", session.href)
}

export function openCompanionSettings(win: BrowserWindow | null) {
  if (!isCompanionWindow(win)) return
  const source = companionSource
  if (!source || source.isDestroyed()) return
  source.show()
  source.focus()
  source.webContents.send("companion-open-settings")
}

function updateCompanionWindow() {
  if (appQuitting) return
  const source = companionSource
  const snapshot = source && !source.isDestroyed() ? companionSnapshots.get(source) : undefined
  if (!snapshot?.visible) {
    companionWindow?.hide()
    return
  }

  const win = companionWindow ?? createCompanionWindow()
  if (companionReady) win.webContents.send("companion-snapshot", snapshot)
  if (!win.isVisible()) win.showInactive()
}

function createCompanionWindow() {
  wireCompanionDisplays()
  const stored = parseCompanionWindowPosition(getStore().get(COMPANION_POSITION_KEY))
  const display = screen.getAllDisplays().find((item) => item.id === stored?.displayId) ?? screen.getPrimaryDisplay()
  const initial = clampCompanionBounds(
    {
      x: stored?.x ?? display.workArea.x + display.workArea.width - companionSize.width - 24,
      y: stored?.y ?? display.workArea.y + display.workArea.height - companionSize.height - 24,
      ...companionSize,
    },
    display.bounds,
  )
  const win = new BrowserWindow({
    ...initial,
    show: false,
    transparent: true,
    frame: false,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: join(root, "../preload/companion.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  companionWindow = win
  win.setBackgroundColor("#00000000")
  companionReady = false
  win.setAlwaysOnTop(true, "floating")
  if (process.platform === "darwin") win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  if (process.platform !== "linux") win.setIgnoreMouseEvents(true, { forward: true })
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
  win.webContents.on("will-navigate", (event, url) => {
    if (isRendererUrl(url)) return
    event.preventDefault()
  })
  win.webContents.once("render-process-gone", () => {
    win.destroy()
    setTimeout(updateCompanionWindow, 1_000)
  })
  loadWindow(win, "companion.html")
  let cursor = screen.getCursorScreenPoint()
  const cursorTimer = setInterval(() => {
    if (!companionReady || !win.isVisible()) return
    const next = screen.getCursorScreenPoint()
    if (next.x === cursor.x && next.y === cursor.y) return
    cursor = next
    win.webContents.send("companion-cursor", next)
  }, 33)
  win.on("closed", () => {
    clearInterval(cursorTimer)
    if (companionWindow !== win) return
    companionWindow = undefined
    companionReady = false
  })
  return win
}

function wireCompanionDisplays() {
  if (companionDisplaysWired) return
  companionDisplaysWired = true
  screen.on("display-removed", restoreCompanionBounds)
  screen.on("display-metrics-changed", restoreCompanionBounds)
}

function restoreCompanionBounds() {
  const win = companionWindow
  if (!win || win.isDestroyed()) return
  const bounds = win.getBounds()
  win.setBounds(clampCompanionBounds(bounds, screen.getDisplayMatching(bounds).bounds))
}

function persistCompanionPosition() {
  const win = companionWindow
  if (!win || win.isDestroyed()) return
  const bounds = win.getBounds()
  getStore().set(COMPANION_POSITION_KEY, {
    displayId: screen.getDisplayMatching(bounds).id,
    x: bounds.x,
    y: bounds.y,
  })
}

function windowStateFile(id: string) {
  return `window-state-${id.replace(/[^a-zA-Z0-9._-]/g, "-")}.json`
}

// Mirrors windowStorage() in packages/app/src/utils/persist.ts, which names
// the per-window renderer store this window persists its tabs into.
function windowDataFile(id: string) {
  return `opencode.window.${id.replace(/[^a-zA-Z0-9._-]/g, "-")}.dat`
}

export function registerRendererProtocol() {
  if (protocol.isProtocolHandled(rendererProtocol)) return

  protocol.handle(rendererProtocol, async (request) => {
    const url = new URL(request.url)
    if (url.host !== rendererHost) {
      writeLog("protocol", "rejected host", { url: request.url }, "warn")
      return new Response("Not found", { status: 404 })
    }

    const file = resolve(rendererRoot, `.${decodeURIComponent(url.pathname)}`)
    const rel = relative(rendererRoot, file)
    if (rel.startsWith("..") || isAbsolute(rel)) {
      writeLog("protocol", "rejected path", { url: request.url, file }, "warn")
      return new Response("Not found", { status: 404 })
    }

    try {
      const range = request.headers.get("range")
      const response = await net.fetch(pathToFileURL(file).toString(), {
        headers: range ? { range } : undefined,
      })
      if (response.status >= 400) {
        writeLog(
          "protocol",
          "fetch failed",
          {
            url: request.url,
            file,
            status: response.status,
            statusText: response.statusText,
          },
          "error",
        )
      }
      return addDocumentPolicy(response, file)
    } catch (error) {
      writeLog("protocol", "fetch error", { url: request.url, file, error }, "error")
      return new Response("Not found", { status: 404 })
    }
  })
}

function loadWindow(win: BrowserWindow, html: string) {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    const url = new URL(html, devUrl)
    void win.loadURL(url.toString())
    return
  }

  void win.loadURL(`${rendererProtocol}://${rendererHost}/${html}`)
}

function wireWindowRecovery(win: BrowserWindow, name: string) {
  let showing = false
  const sampler = createUnresponsiveSampler(win, name)

  const handle = async (button: string | undefined, wait: boolean) => {
    if (button === "Export Logs") {
      const sampling = sampler.stopAndFlush()
      await exportDebugLogs().catch((error) => writeLog("main", "failed to export debug logs", { error }, "error"))
      if (wait && sampling) sampler.start()
      return true
    }
    if (button === "Relaunch") {
      sampler.stopAndFlush()
      relaunchHandler()
      return false
    }
    if (button === "Quit") {
      sampler.stopAndFlush()
      app.quit()
    }
    return false
  }

  const show = async (message: string, detail: string, wait: boolean) => {
    if (showing || win.isDestroyed()) return
    showing = true
    try {
      while (!win.isDestroyed()) {
        const buttons = wait ? ["Relaunch", "Export Logs", "Keep Waiting"] : ["Relaunch", "Export Logs", "Quit"]
        const result = await dialog.showMessageBox(win, {
          type: "warning",
          buttons,
          defaultId: 0,
          cancelId: 2,
          message,
          detail,
        })
        if (await handle(buttons[result.response], wait)) continue
        return
      }
    } finally {
      showing = false
    }
  }

  const failed = (
    event: string,
    errorCode: number,
    errorDescription: string,
    validatedURL: string,
    isMainFrame: boolean,
  ) => {
    writeLog(
      "window",
      "renderer load failed",
      {
        window: name,
        event,
        errorCode,
        errorDescription,
        validatedURL,
        currentURL: safeWindowURL(win),
        isMainFrame,
      },
      "error",
    )

    if (!isMainFrame || errorCode === -3) return
    void show(
      "OpenCode failed to load",
      [`Window: ${name}`, `URL: ${validatedURL}`, `Error: ${errorCode} ${errorDescription}`].join("\n"),
      false,
    )
  }

  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    failed("did-fail-load", errorCode, errorDescription, validatedURL, isMainFrame)
  })
  win.webContents.on("did-fail-provisional-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    failed("did-fail-provisional-load", errorCode, errorDescription, validatedURL, isMainFrame)
  })
  win.webContents.on("render-process-gone", (_event, details) => {
    sampler.stopAndFlush()
    writeLog("window", "renderer process gone", { window: name, currentURL: safeWindowURL(win), details }, "error")
    void show(
      "OpenCode window terminated unexpectedly",
      [`Window: ${name}`, `Reason: ${details.reason}`, `Code: ${details.exitCode ?? "<unknown>"}`].join("\n"),
      false,
    )
  })
  win.on("unresponsive", () => {
    writeLog("window", "renderer unresponsive", { window: name, currentURL: safeWindowURL(win) }, "error")
    sampler.start()
    void show("OpenCode is not responding", "You can relaunch the app, open the logs, or keep waiting.", true)
  })
  win.on("responsive", () => {
    writeLog("window", "renderer responsive", { window: name, currentURL: safeWindowURL(win) }, "error")
    sampler.stopAndFlush()
  })
  win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (message.toLowerCase().includes("terminal") || sourceId.toLowerCase().includes("terminal")) {
      writeLog("pty", "console", { window: name, level, message, line, sourceId })
    }
  })
  win.webContents.on("preload-error", (_event, preloadPath, error) => {
    writeLog("preload", "preload error", { window: name, preloadPath, error }, "error")
  })
}

function addDocumentPolicy(response: Response, file: string) {
  if (!file.toLowerCase().endsWith(".html")) return response
  const headers = new Headers(response.headers)
  headers.set(documentPolicyHeader, jsCallStacksDocumentPolicy)
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

function allowRendererPermissions(win: BrowserWindow) {
  const webContentsId = win.webContents.id

  win.webContents.session.setPermissionRequestHandler((webContents, permission, callback, details) => {
    callback(
      rendererPermissions.has(permission) &&
        isTrustedRendererUrl(details.requestingUrl) &&
        webContents.id === webContentsId,
    )
  })
  win.webContents.session.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    if (!rendererPermissions.has(permission)) return false
    if (webContents && webContents.id !== webContentsId) return false
    return isTrustedRendererUrl(details.requestingUrl) || isTrustedRendererUrl(requestingOrigin)
  })
}

function isTrustedRendererUrl(value?: string) {
  return isRendererUrl(value)
}

function addRendererHeaders(value: string, headers: Record<string, any>) {
  upsertKeyValue(headers, "Access-Control-Allow-Origin", ["*"])
  upsertKeyValue(headers, "Access-Control-Allow-Headers", ["*"])
  if (isRendererUrl(value, true)) upsertKeyValue(headers, documentPolicyHeader, [jsCallStacksDocumentPolicy])
}

function isRendererUrl(value?: string, html = false) {
  if (!value || !URL.canParse(value)) return false
  const url = new URL(value)
  if (html && !url.pathname.endsWith(".html")) return false
  if (url.protocol === `${rendererProtocol}:` && url.host === rendererHost) return true
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (!devUrl || !URL.canParse(devUrl)) return false
  return url.origin === new URL(devUrl).origin
}

function wireZoom(win: BrowserWindow) {
  pinchZoomEnabled.set(win, getPinchZoomEnabled())
  win.webContents.setZoomFactor(1)
  win.webContents.on("zoom-changed", (event, zoomDirection) => {
    event.preventDefault()
    if (pinchZoomEnabled.get(win)) {
      win.webContents.setZoomFactor(clampZoom(win.webContents.getZoomFactor() + (zoomDirection === "in" ? 0.2 : -0.2)))
      updateZoom(win)
      return
    }
    if (win.webContents.getZoomFactor() !== 1) win.webContents.setZoomFactor(1)
    updateZoom(win)
  })
}

function clampZoom(value: number) {
  return Math.min(Math.max(value, minZoomLevel), maxZoomLevel)
}

function updateZoom(win: BrowserWindow) {
  updateTitlebar(win)
  win.webContents.send("zoom-factor-changed", win.webContents.getZoomFactor())
}

function upsertKeyValue(obj: Record<string, any>, keyToChange: string, value: any) {
  const keyToChangeLower = keyToChange.toLowerCase()
  for (const key of Object.keys(obj)) {
    if (key.toLowerCase() === keyToChangeLower) {
      // Reassign old key
      obj[key] = value
      // Done
      return
    }
  }
  // Insert at end instead
  obj[keyToChange] = value
}
