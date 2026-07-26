import { describe, expect, test } from "bun:test"
import {
  companionCards,
  companionCardsBelow,
  companionPetY,
  clampCompanionPosition,
  companionProgress,
  companionResult,
  companionLookDirection,
  companionRunningTools,
  companionState,
  sortCompanionSessions,
  type CompanionSession,
} from "./task-companion-model"

describe("task companion", () => {
  test("flips cards only when their current side reaches the display edge", () => {
    expect(companionCardsBelow(false, { top: 100, bottom: 204 }, { top: 0, bottom: 900 })).toBe(true)
    expect(companionCardsBelow(true, { top: 400, bottom: 504 }, { top: 0, bottom: 900 })).toBe(true)
    expect(companionCardsBelow(true, { top: 700, bottom: 804 }, { top: 0, bottom: 900 })).toBe(false)
  })

  test("moves the pet inside the overlay when macOS pins the window to a display edge", () => {
    expect(companionPetY(0, { top: 0, bottom: 900 })).toBe(12)
    expect(companionPetY(100, { top: 0, bottom: 900 })).toBe(100)
    expect(companionPetY(200, { top: 0, bottom: 900 })).toBe(198)
    expect(companionPetY(400, { top: 0, bottom: 900 })).toBe(384)
    expect(companionPetY(0, { top: 0, bottom: 900 }, 1.5)).toBe(64)
  })
  test("maps real session signals and terminal outcomes", () => {
    expect(companionState({ status: "busy" })).toBe("thinking")
    expect(companionState({ status: "busy", runningTools: 1 })).toBe("working")
    expect(companionState({ status: "busy", permission: true })).toBe("waiting_for_permission")
    expect(companionState({ status: "busy", question: true })).toBe("waiting_for_user")
    expect(companionState({ outcome: "failed" })).toBe("failed")
    expect(companionState({ outcome: "completed" })).toBe("completed")
    expect(companionState({ outcome: "cancelled" })).toBe("cancelled")
  })

  test("puts required action first", () => {
    const session = (id: string, state: CompanionSession["state"]): CompanionSession => ({
      id,
      state,
      title: id,
      directory: "/tmp",
      startedAt: 1,
      updatedAt: 1,
      runningTools: 0,
    })
    expect(sortCompanionSessions([session("busy", "working"), session("ask", "waiting_for_user")])[0]?.id).toBe("ask")
    expect(
      companionCards(
        [session("busy", "working"), session("ask", "waiting_for_user")],
        [session("recent", "idle"), session("busy", "working"), session("ask", "waiting_for_user")],
      ).map((item) => item.id),
    ).toEqual(["busy", "ask", "recent"])
  })

  test("reports the current real todo and clamps dragging to the viewport", () => {
    expect(
      companionProgress([
        { content: "Inspect", status: "completed" },
        { content: "Implement", status: "in_progress" },
        { content: "Verify", status: "pending" },
      ]),
    ).toEqual({ current: "Implement", complete: 1, total: 3, percent: 33 })
    expect(clampCompanionPosition({ x: -20, y: 999 }, { width: 800, height: 600 })).toEqual({ x: 8, y: 488 })
  })

  test("reports the latest visible assistant result", () => {
    expect(
      companionResult(
        [
          { id: "user", role: "user" },
          { id: "assistant", role: "assistant" },
        ],
        {
          user: [{ type: "text", text: "Build it" }],
          assistant: [
            { type: "reasoning", text: "Hidden work" },
            { type: "text", text: "Implemented and verified." },
          ],
        },
      ),
    ).toBe("Implemented and verified.")
  })

  test("maps the pointer clockwise to all v2 look directions", () => {
    const companion = { x: 100, y: 100 }
    expect(companionLookDirection({ x: 100, y: 0 }, companion)).toBe(0)
    expect(companionLookDirection({ x: 200, y: 100 }, companion)).toBe(4)
    expect(companionLookDirection({ x: 100, y: 200 }, companion)).toBe(8)
    expect(companionLookDirection({ x: 0, y: 100 }, companion)).toBe(12)
    expect(companionLookDirection({ x: 120, y: 120 }, companion)).toBeUndefined()
    expect(companionLookDirection({ x: 436, y: 100 }, companion)).toBe(4)
    expect(companionLookDirection({ x: 437, y: 100 }, companion)).toBeUndefined()
  })

  test("counts only live tool calls", () => {
    expect(
      companionRunningTools([{ id: "message" }], {
        message: [
          { type: "tool", state: { status: "running" } },
          { type: "tool", state: { status: "completed" } },
          { type: "text" },
        ],
      }),
    ).toBe(1)
  })
})
