import { validCompanionPetID, type CompanionOverlaySnapshot, type CompanionState } from "@opencode-ai/app/task-companion"

const states = new Set<CompanionState>([
  "idle",
  "thinking",
  "working",
  "waiting_for_permission",
  "waiting_for_user",
  "completed",
  "failed",
  "cancelled",
])

export type CompanionWindowPosition = {
  displayId: number
  x: number
  y: number
}

type Bounds = {
  x: number
  y: number
  width: number
  height: number
}

type Point = { x: number; y: number }

const companionPet = { x: 127, y: 198, width: 96, height: 104 }
const companionPetVisible = 40

export function parseCompanionSnapshot(value: unknown): CompanionOverlaySnapshot | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return
  const input = value as Record<string, unknown>
  if (typeof input.visible !== "boolean") return
  if (!validCompanionPetID(input.pet)) return
  if (typeof input.animations !== "boolean") return
  if (typeof input.scale !== "number" || input.scale < 0.6 || input.scale > 1.6) return
  if (typeof input.leadState !== "string" || !states.has(input.leadState as CompanionState)) return
  if (!input.labels || typeof input.labels !== "object" || Array.isArray(input.labels)) return
  const labels = input.labels as Record<string, unknown>
  if (![labels.idle, labels.dismiss, labels.move, labels.settings].every((label) => typeof label === "string" && label.length <= 200))
    return
  if (!Array.isArray(input.sessions) || input.sessions.length > 12) return

  const sessions = input.sessions.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return []
    const session = value as Record<string, unknown>
    if (typeof session.id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(session.id)) return []
    if (typeof session.title !== "string" || session.title.length > 200) return []
    if (typeof session.description !== "string" || session.description.length > 2_000) return []
    if (typeof session.state !== "string" || !states.has(session.state as CompanionState)) return []
    if (
      typeof session.href !== "string" ||
      session.href.length > 4_096 ||
      !session.href.startsWith("/") ||
      !session.href.endsWith(`/session/${session.id}`)
    )
      return []
    return [
      {
        id: session.id,
        title: session.title,
        state: session.state as CompanionState,
        description: session.description,
        href: session.href,
      },
    ]
  })
  if (sessions.length !== input.sessions.length) return

  return {
    visible: input.visible,
    pet: input.pet,
    animations: input.animations,
    scale: input.scale,
    leadState: input.leadState as CompanionState,
    labels: {
      idle: labels.idle as string,
      dismiss: labels.dismiss as string,
      move: labels.move as string,
      settings: labels.settings as string,
    },
    sessions,
  }
}

export function parseCompanionWindowPosition(value: unknown): CompanionWindowPosition | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return
  const input = value as Record<string, unknown>
  if (typeof input.displayId !== "number" || !Number.isSafeInteger(input.displayId)) return
  if (typeof input.x !== "number" || typeof input.y !== "number") return
  if (!Number.isFinite(input.x) || !Number.isFinite(input.y)) return
  return { displayId: input.displayId, x: input.x, y: input.y }
}

export function clampCompanionBounds(bounds: Bounds, display: Bounds) {
  return {
    x: Math.round(
      Math.min(
        Math.max(display.x + companionPetVisible - companionPet.x - companionPet.width, bounds.x),
        display.x + display.width - companionPetVisible - companionPet.x,
      ),
    ),
    y: Math.round(
      Math.min(
        Math.max(display.y, bounds.y),
        display.y + Math.max(0, display.height - bounds.height) + 24,
      ),
    ),
    width: bounds.width,
    height: bounds.height,
  }
}

export function companionCursorDelta(previous: Point, current: Point) {
  return { x: current.x - previous.x, y: current.y - previous.y }
}

export function companionDragBounds(bounds: Bounds, start: Point, current: Point) {
  const delta = companionCursorDelta(start, current)
  return { ...bounds, x: bounds.x + delta.x, y: bounds.y + delta.y }
}
