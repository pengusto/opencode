import type { CompanionAPI, ElectronAPI } from "../preload/types"

declare global {
  interface Window {
    api: ElectronAPI
    companion: CompanionAPI
    __OPENCODE__?: {
      deepLinks?: string[]
    }
  }
}
