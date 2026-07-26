import { contextBridge, ipcRenderer } from "electron"
import type { CompanionAPI } from "./types"

const companion: CompanionAPI = {
  onSnapshot: (cb) => {
    const handler = (_: unknown, snapshot: Parameters<typeof cb>[0]) => cb(snapshot)
    ipcRenderer.on("companion-snapshot", handler)
    ipcRenderer.send("companion-ready")
    return () => ipcRenderer.removeListener("companion-snapshot", handler)
  },
  onCursor: (cb) => {
    const handler = (_: unknown, point: Parameters<typeof cb>[0]) => cb(point)
    ipcRenderer.on("companion-cursor", handler)
    return () => ipcRenderer.removeListener("companion-cursor", handler)
  },
  startDrag: () => ipcRenderer.send("companion-start-drag"),
  move: () => ipcRenderer.send("companion-move"),
  reanchor: (deltaY) => ipcRenderer.send("companion-reanchor", deltaY),
  endDrag: () => ipcRenderer.send("companion-end-drag"),
  setInteractive: (interactive) => ipcRenderer.send("companion-interactive", interactive),
  openSession: (sessionID) => ipcRenderer.send("companion-open-session", sessionID),
  openSettings: () => ipcRenderer.send("companion-open-settings"),
}

contextBridge.exposeInMainWorld("companion", companion)
