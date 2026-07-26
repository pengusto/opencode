import "@opencode-ai/app/index.css"
import "@opencode-ai/app/task-companion.css"
import {
  companionCardsBelow,
  companionLookDirection,
  companionPetY,
  type CompanionOverlaySnapshot,
} from "@opencode-ai/app/task-companion"
import { createMemo, onCleanup, onMount, Show, For } from "solid-js"
import { render } from "solid-js/web"
import { createStore } from "solid-js/store"
import {
  companionAnimation,
  loadBundledMolebyte,
  TaskCompanionSprite,
  type CompanionAnimationName,
  type LoadedCompanion,
} from "@opencode-ai/app/task-companion-renderer"
import "./companion.css"

const symbols = {
  idle: "○",
  thinking: "◌",
  working: "◉",
  waiting_for_permission: "◇",
  waiting_for_user: "?",
  completed: "✓",
  failed: "!",
  cancelled: "×",
} as const

function Companion() {
  const [state, setState] = createStore({
    snapshot: undefined as CompanionOverlaySnapshot | undefined,
    companion: undefined as LoadedCompanion | undefined,
    dragging: false,
    moved: false,
    dragDirection: undefined as "running-left" | "running-right" | undefined,
    lookDirection: undefined as number | undefined,
    greeting: true,
    hovering: false,
    interactive: false,
    menu: false,
    cardsBelow: false,
    petY: 198,
    dismissed: {} as Record<string, boolean | undefined>,
  })
  let dragCursor = { x: 0, y: 0 }
  let dragWindow = { cursorY: 0, top: 0 }
  let placed = false
  const sessions = createMemo(() => state.snapshot?.sessions.filter((session) => !state.dismissed[session.id]) ?? [])
  const placeCards = (placePet = false, windowTop = window.screenY) => {
    const display = window.screen as Screen & { availTop: number }
    const viewport = { top: display.availTop, bottom: display.availTop + display.availHeight }
    const scale = state.snapshot?.scale ?? 1
    const petY = placePet ? companionPetY(windowTop, viewport, scale) : state.petY
    const top = windowTop + petY - (scale - 1) * 104
    const next = companionCardsBelow(
      state.cardsBelow,
      { top, bottom: windowTop + petY + 104 },
      viewport,
    )
    if (state.dragging && next !== state.cardsBelow) {
      const desiredPetY = next ? 12 + Math.max(0, scale - 1) * 104 : 384
      const deltaY = state.petY - desiredPetY
      window.companion.reanchor(deltaY)
      dragWindow.top += deltaY
      setState({ petY: desiredPetY, cardsBelow: next })
      return
    }
    if (petY !== state.petY) setState("petY", petY)
    if (next !== state.cardsBelow) setState("cardsBelow", next)
  }

  const animation = createMemo(() => {
    const item = state.companion
    if (!item) return
    if (state.dragging && state.dragDirection && item.animations[state.dragDirection]) return state.dragDirection
    if (state.snapshot?.leadState && state.snapshot.leadState !== "idle")
      return companionAnimation(state.snapshot.leadState, item.animations)
    if (state.hovering && item.animations.jumping) return "jumping"
    if (state.greeting && item.animations.waving) return "waving"
    if (state.lookDirection !== undefined) {
      const name = `look-${state.lookDirection}` as CompanionAnimationName
      if (item.animations[name]) return name
    }
    return companionAnimation("idle", item.animations)
  })

  const setInteractive = (value: boolean) => {
    if (state.interactive === value) return
    setState("interactive", value)
    window.companion.setInteractive(value)
  }

  const observePointer = (event: MouseEvent) => {
    setInteractive(!!document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-companion-interactive]"))
  }
  const leave = () => {
    setInteractive(false)
  }

  const startDrag = (event: PointerEvent) => {
    if (event.button !== 0) return
    dragCursor = { x: event.screenX, y: event.screenY }
    dragWindow = { cursorY: event.screenY, top: window.screenY }
    setState({ dragging: true, moved: false, dragDirection: undefined })
    window.companion.startDrag()
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }

  const move = (event: PointerEvent) => {
    if (!state.dragging) return
    const x = event.screenX - dragCursor.x
    const y = event.screenY - dragCursor.y
    if (!x && !y) return
    dragCursor = { x: event.screenX, y: event.screenY }
    setState({
      moved: true,
      dragDirection: x < 0 ? "running-left" : x > 0 ? "running-right" : state.dragDirection,
    })
    window.companion.move()
    placeCards(false, dragWindow.top + event.screenY - dragWindow.cursorY)
  }

  const stopDrag = (event: PointerEvent) => {
    if (!state.dragging) return
    ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
    setState({ dragging: false, dragDirection: undefined })
    window.companion.endDrag()
    setInteractive(false)
  }

  onMount(() => {
    const unsubscribe = window.companion.onSnapshot((snapshot) => {
      for (const session of snapshot.sessions) {
        if (!state.dismissed[session.id] || session.state === "completed" || session.state === "idle") continue
        setState("dismissed", session.id, undefined)
      }
      setState("snapshot", snapshot)
      requestAnimationFrame(() => {
        placeCards(!placed)
        placed = true
      })
    })
    const unsubscribeCursor = window.companion.onCursor((cursor) => {
      const x = cursor.x - window.screenX
      const y = cursor.y - window.screenY
      setInteractive(!!document.elementFromPoint(x, y)?.closest("[data-companion-interactive]"))
      if (state.dragging) return
      const scale = state.snapshot?.scale ?? 1
      setState(
        "lookDirection",
        companionLookDirection(cursor, {
          x: window.screenX + 175,
          y: window.screenY + state.petY + 104 - 52 * scale,
        }),
      )
    })
    window.addEventListener("mousemove", observePointer)
    document.documentElement.addEventListener("mouseleave", leave)
    const greeting = setTimeout(() => setState("greeting", false), 1_200)
    onCleanup(() => {
      unsubscribe()
      unsubscribeCursor()
      window.removeEventListener("mousemove", observePointer)
      document.documentElement.removeEventListener("mouseleave", leave)
      clearTimeout(greeting)
    })

    void loadBundledMolebyte()
      .then((companion) => setState("companion", companion))
      .catch(() => {})
  })

  return (
    <Show when={state.snapshot?.visible}>
      <main class="companion-overlay">
        <section
          class="companion-cards"
          classList={{ "companion-cards-below": state.cardsBelow }}
          style={
            state.cardsBelow
              ? {
                  top: `${state.petY + 128}px`,
                  bottom: "auto",
                  "max-height": `${Math.max(54, Math.min(181, 500 - state.petY - 128))}px`,
                }
              : {
                  top: "auto",
                  bottom: `${500 - state.petY + ((state.snapshot?.scale ?? 1) - 1) * 104 + 24}px`,
                  "max-height": `${Math.max(54, Math.min(181, state.petY - ((state.snapshot?.scale ?? 1) - 1) * 104 - 24))}px`,
                }
          }
          data-companion-interactive
        >
          <For each={sessions()} fallback={<div class="companion-empty">Keine aktiven Tasks</div>}>
            {(session) => (
              <div class="companion-card">
                <button
                  type="button"
                  class="companion-card-open"
                  onClick={() => window.companion.openSession(session.id)}
                  aria-label={`${session.title}: ${session.description}`}
                >
                  <span class="companion-card-copy">
                    <strong>{session.title}</strong>
                    <span>{session.description}</span>
                  </span>
                </button>
                <Show
                  when={session.state === "completed" || session.state === "idle"}
                  fallback={
                    <span
                      class="companion-status"
                      classList={{
                        "companion-status-running": session.state === "thinking" || session.state === "working",
                        "companion-status-success": session.state === "idle",
                        "companion-status-error": session.state === "failed",
                      }}
                      aria-hidden="true"
                    >
                      {session.state === "thinking" || session.state === "working" ? "" : symbols[session.state]}
                    </span>
                  }
                >
                  <button
                    type="button"
                    class="companion-dismiss"
                    aria-label="Chat ausblenden"
                    onClick={() => setState("dismissed", session.id, true)}
                  >
                    <span class="companion-dismiss-idle" aria-hidden="true">○</span>
                    <span class="companion-dismiss-hover" aria-hidden="true">×</span>
                  </button>
                </Show>
              </div>
            )}
          </For>
        </section>

        <button
          type="button"
          class="companion-pet"
          classList={{ "cursor-grabbing": state.dragging }}
          data-companion-interactive
          aria-label="Molebyte verschieben"
          style={{ top: `${state.petY}px`, transform: `scale(${state.snapshot?.scale ?? 1})` }}
          onPointerDown={startDrag}
          onPointerMove={move}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
          onPointerEnter={() => setState("hovering", true)}
          onPointerLeave={() => setState("hovering", false)}
          onContextMenu={(event) => {
            event.preventDefault()
            setState("menu", true)
          }}
          onClick={(event) => {
            if (!state.moved) return
            event.preventDefault()
            setState("moved", false)
          }}
        >
          <Show
            when={state.snapshot?.mode === "animated" && state.companion}
            fallback={
              <span class="companion-orbit" aria-label={state.snapshot?.leadState ?? "idle"}>
                <span class="companion-face" aria-hidden="true"><i /><i /><b /></span>
              </span>
            }
          >
            <span classList={{ "task-companion-active": state.snapshot?.leadState !== "idle" }}>
              <TaskCompanionSprite
                companion={state.companion!}
                state={state.snapshot?.leadState ?? "idle"}
                animation={animation()}
                animated={state.snapshot?.animations ?? false}
                loop
              />
            </span>
          </Show>
        </button>
        <Show when={state.menu}>
          <div
            class="companion-menu"
            data-companion-interactive
            onMouseLeave={() => {
              setState("menu", false)
              setInteractive(false)
            }}
          >
            <button
              type="button"
              onClick={() => {
                setState("menu", false)
                setInteractive(false)
                window.companion.openSettings()
              }}
            >
              Companion-Einstellungen…
            </button>
          </div>
        </Show>
      </main>
    </Show>
  )
}

render(() => <Companion />, document.getElementById("root")!)
