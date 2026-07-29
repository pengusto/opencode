export type CompanionState =
  | "idle"
  | "thinking"
  | "working"
  | "waiting_for_permission"
  | "waiting_for_user"
  | "completed"
  | "failed"
  | "cancelled"

export type CompanionSession = {
  id: string
  title: string
  directory: string
  state: CompanionState
  updatedAt: number
}

export type CompanionOverlaySnapshot = {
  visible: boolean
  mode: "orbit" | "animated"
  animations: boolean
  scale: number
  leadState: CompanionState
  labels: {
    idle: string
    dismiss: string
    move: string
    settings: string
  }
  sessions: {
    id: string
    title: string
    state: CompanionState
    description: string
    href: string
  }[]
}

export function companionCardsBelow(
  current: boolean,
  pet: { top: number; bottom: number },
  viewport: { top: number; bottom: number },
) {
  const aboveFits = pet.top - 24 - 181 >= viewport.top
  const belowFits = pet.bottom + 24 + 181 <= viewport.bottom
  if (current) return belowFits || !aboveFits
  return !aboveFits && belowFits
}

export function companionPetY(windowTop: number, viewport: { top: number; bottom: number }, scale = 1) {
  const top = windowTop - viewport.top
  if (top < 198) return Math.max(12 + Math.max(0, scale - 1) * 104, top)
  const bottom = viewport.bottom - (windowTop + 500)
  if (bottom < 186) return Math.min(384, 384 - bottom)
  return 198
}

const priority: Record<CompanionState, number> = {
  waiting_for_permission: 0,
  waiting_for_user: 1,
  failed: 2,
  working: 3,
  thinking: 4,
  completed: 5,
  cancelled: 6,
  idle: 7,
}

export function companionState(input: {
  status?: "idle" | "busy" | "retry"
  permission?: boolean
  question?: boolean
  runningTools?: number
  outcome?: "completed" | "failed" | "cancelled"
}): CompanionState {
  if (input.permission) return "waiting_for_permission"
  if (input.question) return "waiting_for_user"
  if (input.outcome) return input.outcome
  if (input.runningTools) return "working"
  if (input.status === "busy" || input.status === "retry") return "thinking"
  return "idle"
}

export function sortCompanionSessions(sessions: CompanionSession[]) {
  return sessions.toSorted((a, b) => priority[a.state] - priority[b.state] || b.updatedAt - a.updatedAt)
}

export function companionCards(active: CompanionSession[], all: CompanionSession[]) {
  if (!active.length) return all.slice(0, 12)
  if (active.length >= 3) return active.slice(0, 12)
  const activeIDs = new Set(active.map((session) => session.id))
  return active.concat(all.filter((session) => !activeIDs.has(session.id)).slice(0, 3 - active.length))
}

export function companionProgress(todos: { content: string; status: string }[]) {
  const complete = todos.filter((todo) => todo.status === "completed" || todo.status === "cancelled").length
  return {
    current:
      todos.find((todo) => todo.status === "in_progress")?.content ??
      todos.find((todo) => todo.status === "pending")?.content ??
      todos.at(-1)?.content,
    complete,
    total: todos.length,
    percent: todos.length ? Math.round((complete / todos.length) * 100) : undefined,
  }
}

export function companionResult(
  messages: { id: string; role: string }[],
  parts: Record<string, { type: string; text?: string }[] | undefined>,
) {
  return messages
    .toReversed()
    .filter((message) => message.role === "assistant")
    .flatMap((message) => (parts[message.id] ?? []).toReversed())
    .find((part) => part.type === "text" && part.text?.trim())
    ?.text?.trim()
}

export function companionLookDirection(
  pointer: { x: number; y: number },
  companion: { x: number; y: number },
  deadzone = 40,
  radius = 336,
) {
  const x = pointer.x - companion.x
  const y = pointer.y - companion.y
  const distance = Math.hypot(x, y)
  if (distance < deadzone || distance > radius) return
  return Math.round((((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360) / 22.5) % 16
}

export function companionRunningTools(
  messages: { id: string }[],
  parts: Record<string, { type: string; state?: { status?: string } }[] | undefined>,
) {
  return messages
    .flatMap((message) => parts[message.id] ?? [])
    .filter((part) => {
      if (part.type !== "tool") return false
      return part.state?.status === "pending" || part.state?.status === "running"
    }).length
}

export function clampCompanionPosition(
  position: { x: number; y: number },
  viewport: { width: number; height: number },
) {
  return {
    x: Math.min(Math.max(8, position.x), Math.max(8, viewport.width - 104)),
    y: Math.min(Math.max(8, position.y), Math.max(8, viewport.height - 112)),
  }
}
