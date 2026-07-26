import { describe, expect, test } from "bun:test"
import {
  clampCompanionBounds,
  companionCursorDelta,
  companionDragBounds,
  parseCompanionSnapshot,
  parseCompanionWindowPosition,
} from "./companion-window"

const snapshot = {
  visible: true,
  mode: "animated",
  animations: true,
  scale: 1,
  leadState: "working",
  sessions: [
    {
      id: "ses_123",
      title: "Build overlay",
      state: "working",
      description: "Running tests",
      href: "/workspace/session/ses_123",
    },
  ],
}

describe("companion window", () => {
  test("accepts the narrow overlay payload and rejects invalid navigation", () => {
    expect(parseCompanionSnapshot(snapshot)).toEqual(snapshot)
    expect(
      parseCompanionSnapshot({
        ...snapshot,
        sessions: [{ ...snapshot.sessions[0], href: "/workspace/session/ses_other" }],
      }),
    ).toBeUndefined()
  })

  test("keeps the pet recoverable while allowing the overlay partly off screen", () => {
    expect(
      clampCompanionBounds(
        { x: -2_500, y: -100, width: 350, height: 500 },
        { x: -1_920, y: 0, width: 1_920, height: 1_080 },
      ),
    ).toEqual({ x: -2_103, y: 0, width: 350, height: 500 })
  })

  test("pins the window vertically while the renderer moves the pet to display edges", () => {
    expect(
      clampCompanionBounds(
        { x: -170, y: -200, width: 350, height: 500 },
        { x: 0, y: 0, width: 1_920, height: 1_080 },
      ),
    ).toEqual({ x: -170, y: 0, width: 350, height: 500 })
    expect(
      clampCompanionBounds(
        { x: 100, y: 800, width: 350, height: 500 },
        { x: 0, y: 0, width: 1_920, height: 1_080 },
      ),
    ).toEqual({ x: 100, y: 604, width: 350, height: 500 })
  })

  test("uses native cursor DIPs so fullscreen scale changes cannot amplify dragging", () => {
    expect(companionCursorDelta({ x: 100, y: 200 }, { x: 110, y: 206 })).toEqual({ x: 10, y: 6 })
  })

  test("keeps the original grab point anchored for the whole drag", () => {
    const bounds = { x: 300, y: 200, width: 350, height: 500 }
    expect(companionDragBounds(bounds, { x: 350, y: 250 }, { x: 410, y: 280 })).toEqual({
      ...bounds,
      x: 360,
      y: 230,
    })
  })

  test("validates persisted display positions", () => {
    expect(parseCompanionWindowPosition({ displayId: 42, x: -300, y: 80 })).toEqual({
      displayId: 42,
      x: -300,
      y: 80,
    })
    expect(parseCompanionWindowPosition({ displayId: "42", x: 0, y: 0 })).toBeUndefined()
  })
})
