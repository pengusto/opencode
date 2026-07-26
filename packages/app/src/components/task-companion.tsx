import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { createStore } from "solid-js/store"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { useLanguage } from "@/context/language"
import { useServerSync } from "@/context/server-sync"
import { useServerSDK } from "@/context/server-sdk"
import { useSettings } from "@/context/settings"
import { usePlatform } from "@/context/platform"
import {
  clampCompanionPosition,
  companionCards,
  companionLookDirection,
  companionProgress,
  companionResult,
  companionRunningTools,
  companionState,
  sortCompanionSessions,
  type CompanionSession,
} from "./task-companion-model"
import {
  companionAnimation,
  companionInput,
  LegacyAtlasCompanionAdapter,
  type CompanionAnimationName,
  type LoadedCompanion,
} from "./task-companion-package"
import { loadBundledMolebyte, TaskCompanionSprite } from "./task-companion-renderer"
import "./task-companion.css"

const symbol = {
  idle: "○",
  thinking: "◌",
  working: "◉",
  waiting_for_permission: "◇",
  waiting_for_user: "?",
  completed: "✓",
  failed: "!",
  cancelled: "×",
} as const

export function TaskCompanion() {
  const sync = useServerSync()
  const sdk = useServerSDK()
  const settings = useSettings()
  const platform = usePlatform()
  const language = useLanguage()
  const navigate = useNavigate()
  const [companion, setCompanion] = createSignal<LoadedCompanion>()
  const [importError, setImportError] = createSignal<string>()
  const [surface, setSurface] = createStore({
    x: 0,
    y: 0,
    dragging: false,
    moved: false,
    dragDirection: undefined as "running-left" | "running-right" | undefined,
    lookDirection: undefined as number | undefined,
    greeting: true,
    hovering: false,
  })
  let picker!: HTMLInputElement
  let root!: HTMLDivElement
  let drag = { x: 0, y: 0, startX: 0, startY: 0 }
  const [outcomes, setOutcomes] = createStore<Record<string, "completed" | "failed" | "cancelled" | undefined>>({})
  const [dismissed, setDismissed] = createStore<Record<string, boolean | undefined>>({})
  const timeouts = new Set<ReturnType<typeof setTimeout>>()
  const clear = (sessionID: string) => {
    const timeout = setTimeout(() => {
      setOutcomes(sessionID, undefined)
      timeouts.delete(timeout)
    }, settings.companion.showCompletedForSeconds() * 1_000)
    timeouts.add(timeout)
  }
  onCleanup(() => timeouts.forEach(clearTimeout))
  onMount(() => {
    const position = settings.companion.position()
    const next = clampCompanionPosition(position ?? { x: window.innerWidth - 120, y: window.innerHeight - 128 }, {
      width: window.innerWidth,
      height: window.innerHeight,
    })
    setSurface({ x: next.x, y: next.y })
    const resize = () => {
      const position = clampCompanionPosition(surface, { width: window.innerWidth, height: window.innerHeight })
      setSurface({ x: position.x, y: position.y })
    }
    window.addEventListener("resize", resize)
    const look = (event: PointerEvent) => {
      if (surface.dragging) return
      const direction = companionLookDirection(
        { x: event.clientX, y: event.clientY },
        { x: surface.x + 48, y: surface.y + 52 },
      )
      if (surface.lookDirection !== direction) setSurface("lookDirection", direction)
    }
    const clearLook = () => setSurface("lookDirection", undefined)
    window.addEventListener("pointermove", look)
    window.addEventListener("blur", clearLook)
    document.documentElement.addEventListener("mouseleave", clearLook)
    const greeting = setTimeout(() => setSurface("greeting", false), 1_200)
    onCleanup(() => {
      window.removeEventListener("resize", resize)
      window.removeEventListener("pointermove", look)
      window.removeEventListener("blur", clearLook)
      document.documentElement.removeEventListener("mouseleave", clearLook)
      clearTimeout(greeting)
    })
    void loadBundledMolebyte()
      .then(setCompanion)
      .catch((error) => setImportError(error instanceof Error ? error.message : "Molebyte could not be loaded"))
  })

  onCleanup(
    sdk().event.on("session.idle", (event) => {
      if (event.type !== "session.idle") return
      setOutcomes(event.properties.sessionID, "completed")
    }),
  )
  onCleanup(
    sdk().event.on("session.error", (event) => {
      if (event.type !== "session.error") return
      if (!event.properties.sessionID) return
      setOutcomes(
        event.properties.sessionID,
        event.properties.error?.name === "MessageAbortedError" ? "cancelled" : "failed",
      )
      clear(event.properties.sessionID)
    }),
  )
  const allSessions = createMemo(() =>
    Object.values(sync().session.data.info)
      .flatMap((session): CompanionSession[] => {
        if (!session) return []
        const status = sync().session.data.session_status[session.id]?.type
        const permission = (sync().session.data.permission[session.id]?.length ?? 0) > 0
        const question = (sync().session.data.question[session.id]?.length ?? 0) > 0
        const runningTools = companionRunningTools(
          sync().session.data.message[session.id] ?? [],
          sync().session.data.part,
        )
        const outcome = status === "idle" && !permission && !question && !runningTools ? outcomes[session.id] : undefined
        const state = companionState({ status, permission, question, runningTools, outcome })
        return [
          {
            id: session.id,
            title: session.title,
            directory: session.directory,
            state,
            startedAt: session.time.created,
            updatedAt: session.time.updated,
            runningTools,
          },
        ]
      })
      .toSorted((a, b) => b.updatedAt - a.updatedAt),
  )
  const sessions = createMemo(() => sortCompanionSessions(allSessions().filter((session) => session.state !== "idle")))
  createEffect(() => {
    for (const session of allSessions()) {
      if (!dismissed[session.id] || session.state === "completed" || session.state === "idle") continue
      setDismissed(session.id, undefined)
    }
  })
  const visibleSessions = createMemo(() => sessions().filter((session) => !dismissed[session.id]))
  const cards = createMemo(() =>
    companionCards(
      visibleSessions(),
      allSessions().filter((session) => !dismissed[session.id]),
    ),
  )
  const lead = createMemo(() => visibleSessions()[0])
  const progress = createMemo(() => companionProgress(sync().session.data.todo[lead()?.id ?? ""] ?? []))
  const animationName = createMemo(() => {
    const item = companion()
    if (!item) return
    const active = lead()
    if (surface.dragging && surface.dragDirection && item.animations[surface.dragDirection])
      return surface.dragDirection
    if (active) return companionAnimation(active.state, item.animations)
    if (surface.hovering && item.animations.jumping) return "jumping"
    if (surface.greeting && item.animations.waving) return "waving"
    if (surface.lookDirection !== undefined) {
      const name = `look-${surface.lookDirection}` as CompanionAnimationName
      if (item.animations[name]) return name
    }
    return companionAnimation("idle", item.animations)
  })
  const animation = createMemo(() => companion()?.animations[animationName() ?? "idle"])
  const result = (sessionID: string) =>
    companionResult(sync().session.data.message[sessionID] ?? [], sync().session.data.part)
  createEffect(() => {
    if (!platform.companionOverlay) return
    const active = lead()
    platform.companionOverlay.publish({
      visible: settings.companion.enabled(),
      mode: settings.companion.mode() === "animated" ? "animated" : "orbit",
      animations: settings.companion.animations(),
      scale: settings.companion.scale(),
      leadState: active?.state ?? "idle",
      labels: {
        idle: language.t("companion.idle"),
        dismiss: language.t("companion.dismiss"),
        move: language.t("companion.move"),
        settings: language.t("companion.settings"),
      },
      sessions: cards().map((session) => {
        const description =
          (session.id === active?.id ? progress().current : result(session.id)) ??
          language.t(`companion.state.${session.state}`)
        return {
          id: session.id,
          title: session.title.slice(0, 200),
          state: session.state,
          description: description.slice(0, 2_000),
          href: `/${base64Encode(session.directory)}/session/${session.id}`,
        }
      }),
    })
  })
  createEffect(() => {
    for (const session of cards().slice(0, 3)) {
      if (sync().session.data.message[session.id] !== undefined) continue
      void sync()
        .session.sync(session.id, { messageLimit: 6 })
        .catch(() => {})
    }
  })
  const startDrag = (event: PointerEvent) => {
    if (event.button !== 0) return
    drag = {
      x: event.clientX - surface.x,
      y: event.clientY - surface.y,
      startX: event.clientX,
      startY: event.clientY,
    }
    setSurface({ dragging: true, moved: false, dragDirection: undefined })
    root.setPointerCapture(event.pointerId)
  }
  const move = (event: PointerEvent) => {
    if (!surface.dragging) return
    if (!surface.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return
    const next = clampCompanionPosition(
      { x: event.clientX - drag.x, y: event.clientY - drag.y },
      { width: window.innerWidth, height: window.innerHeight },
    )
    setSurface({
      x: next.x,
      y: next.y,
      moved: true,
      dragDirection:
        next.x === surface.x ? surface.dragDirection : next.x < surface.x ? "running-left" : "running-right",
    })
  }
  const stopDrag = (event: PointerEvent) => {
    if (!surface.dragging) return
    root.releasePointerCapture(event.pointerId)
    setSurface({
      dragging: false,
      dragDirection: undefined,
      lookDirection: companionLookDirection(
        { x: event.clientX, y: event.clientY },
        { x: surface.x + 48, y: surface.y + 52 },
      ),
    })
    if (surface.moved) settings.companion.setPosition({ x: surface.x, y: surface.y })
  }
  const importPack = async (files: FileList | null) => {
    if (!files?.length) return
    setImportError(undefined)
    try {
      const input = await companionInput([...files])
      const adapter = new LegacyAtlasCompanionAdapter()
      if (!adapter.detect(input)) throw new Error("No supported Companion Pack found")
      setCompanion(adapter.load(input))
      settings.companion.setMode("animated")
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Companion Pack could not be imported")
    } finally {
      picker.value = ""
    }
  }

  return (
    <Show when={settings.companion.enabled() && !platform.companionOverlay}>
      <div
        ref={root}
        class="fixed z-[9999] touch-none"
        classList={{ "cursor-grabbing": surface.dragging }}
        style={{ left: `${surface.x}px`, top: `${surface.y}px` }}
        data-companion-state={lead()?.state ?? "idle"}
        data-companion-animation={animationName()}
        onPointerMove={move}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      >
        <div
          class="task-companion-signal absolute w-[min(18rem,calc(100vw-1rem))] space-y-2 pointer-events-auto"
          classList={{
            "bottom-[112px]": surface.y >= 96,
            "top-[112px]": surface.y < 96,
            "left-0": surface.x < window.innerWidth / 2,
            "right-0": surface.x >= window.innerWidth / 2,
          }}
        >
          <div class="task-companion-scroll max-h-[181px] space-y-1.5 overflow-y-auto overscroll-contain pr-1">
            <For each={cards()}>
              {(session) => (
                <div class="task-companion-card w-full min-h-14 rounded-xl border border-border-base shadow-lg flex items-center gap-2">
                  <button
                    type="button"
                    class="min-w-0 flex-1 self-stretch px-3 py-2 text-left rounded-l-xl focus-visible:outline-2"
                    onClick={() => navigate(`/${base64Encode(session.directory)}/session/${session.id}`)}
                  >
                    <span class="block truncate text-12-medium text-text-strong">{session.title}</span>
                    <span class="block truncate text-12-regular text-text-weak">
                      {session.id === lead()?.id && progress().current
                        ? progress().current
                        : (result(session.id) ?? language.t(`companion.state.${session.state}`))}
                    </span>
                  </button>
                  <Show
                    when={session.state === "completed" || session.state === "idle"}
                    fallback={
                      <span
                        class="task-companion-status mr-3 shrink-0 size-7 rounded-full flex items-center justify-center text-12-medium"
                        classList={{
                          "task-companion-status-running": session.state === "thinking" || session.state === "working",
                          "bg-icon-critical-base/15 text-icon-critical-base": session.state === "failed",
                          "bg-surface-raised-base text-text-weak": session.state !== "failed",
                        }}
                        aria-label={language.t(`companion.state.${session.state}`)}
                      >
                        {session.state === "thinking" || session.state === "working" ? "" : symbol[session.state]}
                      </span>
                    }
                  >
                    <button
                      type="button"
                      class="task-companion-dismiss mr-3 shrink-0 size-7 rounded-full text-14-medium focus-visible:outline-2"
                      aria-label={language.t("companion.dismiss")}
                      onClick={() => setDismissed(session.id, true)}
                    >
                      <span class="task-companion-dismiss-idle" aria-hidden="true">○</span>
                      <span class="task-companion-dismiss-hover" aria-hidden="true">×</span>
                    </button>
                  </Show>
                </div>
              )}
            </For>
          </div>
          <Show when={!cards().length}>
            <div class="rounded-2xl border border-border-base bg-background-base/95 px-4 py-3 shadow-lg text-12-regular text-text-weak">
              {language.t("companion.idle")}
            </div>
          </Show>
          <div
            class="task-companion-signal-tail absolute right-6 size-2 rotate-45 bg-background-base"
            classList={{
              "-bottom-1 border-b border-r border-border-base": surface.y >= 96,
              "-top-1 border-l border-t border-border-base": surface.y < 96,
            }}
          />
        </div>
        <details class="group">
          <summary
            class="relative list-none cursor-grab w-24 h-[104px] rounded-lg flex items-center justify-center text-18-medium text-text-strong focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none"
            aria-label={language.t("companion.open")}
            onPointerDown={startDrag}
            onPointerEnter={() => setSurface("hovering", true)}
            onPointerLeave={() => setSurface("hovering", false)}
            onClick={(event) => {
              if (!surface.moved) return
              event.preventDefault()
              setSurface("moved", false)
            }}
          >
            <Show
              when={settings.companion.mode() === "animated" && companion()}
              fallback={
                <span
                  aria-hidden="true"
                  classList={{
                    "animate-pulse motion-reduce:animate-none": settings.companion.animations() && !!lead(),
                  }}
                >
                  {symbol[lead()?.state ?? "idle"]}
                </span>
              }
            >
              <span classList={{ "task-companion-active": !!lead() }}>
                <TaskCompanionSprite
                  companion={companion()!}
                  state={lead()?.state ?? "idle"}
                  animation={animationName()}
                  animated={settings.companion.animations()}
                  loop
                />
              </span>
            </Show>
            <Show when={sessions().length > 1}>
              <span class="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-icon-strong text-background-base text-10-medium flex items-center justify-center">
                {sessions().length}
              </span>
            </Show>
          </summary>
          <div class="absolute bottom-12 right-0 w-72 max-h-80 overflow-auto rounded-lg border border-border-base bg-background-base shadow-lg p-2">
            <div class="px-2 py-1 text-12-medium text-text-strong">{language.t("companion.title")}</div>
            <div class="flex gap-1 px-2 py-1">
              <button
                class="text-11-regular underline"
                type="button"
                onClick={() => settings.companion.setMode("orbit")}
              >
                Orbit Mode
              </button>
              <button class="text-11-regular underline" type="button" onClick={() => picker.click()}>
                Import Companion
              </button>
              <input
                ref={(element) => {
                  picker = element
                  element.setAttribute("webkitdirectory", "")
                }}
                class="hidden"
                type="file"
                multiple
                onChange={(event) => void importPack(event.currentTarget.files)}
              />
            </div>
            <Show when={companion()}>
              {(item) => (
                <div class="mx-2 mb-1 rounded border border-border-weak-base p-2 text-11-regular text-text-weak">
                  <div class="text-text-strong">{item().name}</div>
                  <div>{item().author ?? "Author not specified"}</div>
                  <div>{item().license ?? "License not specified"}</div>
                  <button type="button" class="mt-1 underline" onClick={() => settings.companion.setMode("animated")}>
                    Use Companion
                  </button>
                </div>
              )}
            </Show>
            <div class="mx-2 mb-1 rounded border border-border-weak-base px-2 py-1.5 text-10-regular text-text-weak">
              <div>
                Status: <span class="text-text-strong">{lead()?.state ?? "idle"}</span>
              </div>
              <div>
                Animation: <span class="text-text-strong">{animationName() ?? "idle"}</span>
                {animation() ? ` · row ${animation()!.row} · ${animation()!.frames} frames` : ""}
              </div>
              <div class="truncate">
                Step: <span class="text-text-strong">{progress().current ?? "No active step"}</span>
              </div>
            </div>
            <Show when={importError()}>
              {(message) => (
                <div role="alert" class="px-2 py-1 text-11-regular text-icon-critical-base">
                  {message()}
                </div>
              )}
            </Show>
            <Show
              when={sessions().length}
              fallback={<div class="px-2 py-3 text-12-regular text-text-weak">{language.t("companion.idle")}</div>}
            >
              <For each={sessions()}>
                {(session) => (
                  <button
                    type="button"
                    class="w-full rounded-md px-2 py-2 flex gap-2 text-left hover:bg-surface-raised-base-hover focus-visible:outline-2"
                    onClick={() => navigate(`/${base64Encode(session.directory)}/session/${session.id}`)}
                    aria-label={`${session.title}: ${language.t(`companion.state.${session.state}`)}`}
                  >
                    <span aria-hidden="true" class="text-14-medium">
                      {symbol[session.state]}
                    </span>
                    <span class="min-w-0">
                      <span class="block truncate text-12-medium text-text-strong">{session.title}</span>
                      <span class="block text-11-regular text-text-weak">
                        {language.t(`companion.state.${session.state}`)}
                      </span>
                    </span>
                  </button>
                )}
              </For>
            </Show>
          </div>
        </details>
      </div>
    </Show>
  )
}
