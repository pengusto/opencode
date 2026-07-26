import { createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import type { CompanionState } from "./task-companion-model"
import { companionAnimation, type CompanionAnimationName, type LoadedCompanion } from "./task-companion-package"

export function TaskCompanionSprite(props: {
  companion: LoadedCompanion
  state: CompanionState
  animation?: CompanionAnimationName
  animated: boolean
  loop?: boolean
}) {
  const [frame, setFrame] = createSignal(0)
  const [visible, setVisible] = createSignal(document.visibilityState === "visible")
  const reduced = matchMedia("(prefers-reduced-motion: reduce)")
  const url = URL.createObjectURL(
    new Blob([props.companion.image.bytes.slice().buffer], { type: props.companion.image.type }),
  )
  const name = createMemo(
    () => props.animation ?? companionAnimation(props.state, props.companion.animations) ?? "idle",
  )
  const animation = createMemo(() => props.companion.animations[name()])
  const visibility = () => setVisible(document.visibilityState === "visible")
  document.addEventListener("visibilitychange", visibility)

  createEffect(() => {
    setFrame(0)
    const value = animation()
    if (!value || !props.animated || reduced.matches || !visible() || value.frames < 2) return
    let current = 0
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      timer = setTimeout(
        () => {
          if (!(props.loop ?? value.loop) && current === value.frames - 1) return
          current = props.loop ?? value.loop ? (current + 1) % value.frames : current + 1
          setFrame(current)
          tick()
        },
        value.durations?.[current] ?? 1000 / value.fps,
      )
    }
    tick()
    onCleanup(() => clearTimeout(timer))
  })

  onCleanup(() => {
    document.removeEventListener("visibilitychange", visibility)
    URL.revokeObjectURL(url)
  })

  return (
    <span
      aria-hidden="true"
      class="block w-24 h-[104px] bg-no-repeat"
      style={{
        "background-image": `url(${url})`,
        "background-size": `${props.companion.atlas.width / 2}px ${props.companion.atlas.height / 2}px`,
        "background-position": `${-(((animation()?.startFrame ?? 0) + frame()) * props.companion.atlas.cellWidth) / 2}px ${-((animation()?.row ?? 0) * props.companion.atlas.cellHeight) / 2}px`,
        "image-rendering": "pixelated",
      }}
    />
  )
}
