import { describe, expect, test } from "bun:test"
import { companionAnimation, LegacyAtlasCompanionAdapter, type CompanionFile } from "./task-companion-package"

const manifest = (value = '{"id":"demo","name":"Demo","unknown":true}') => ({
  name: "pack/pet.json",
  size: value.length,
  type: "application/json",
  bytes: new TextEncoder().encode(value),
})
const atlas = (input: Partial<CompanionFile> = {}): CompanionFile => ({
  name: "pack/spritesheet.webp",
  size: 12,
  type: "image/webp",
  bytes: new TextEncoder().encode("RIFF0000WEBP"),
  width: 1536,
  height: 1872,
  ...input,
})

describe("legacy companion pack", () => {
  const adapter = new LegacyAtlasCompanionAdapter()
  test("detects and loads an 8 by 9 atlas while ignoring unknown fields", () => {
    const input = { files: [manifest(), atlas()] }
    expect(adapter.detect(input)).toBe(true)
    expect(adapter.load(input).name).toBe("Demo")
  })
  test("loads Molebyte-style 8 by 11 v2 packs", () => {
    const value = JSON.stringify({ id: "molebyte", displayName: "Molebyte", spriteVersionNumber: 2 })
    const loaded = adapter.load({ files: [manifest(value), atlas({ height: 2288 })] })
    expect(loaded.format).toBe("legacy-8x11-atlas")
    expect(loaded.name).toBe("Molebyte")
    expect(
      ["idle", "running-right", "running-left", "waving", "jumping", "failed", "waiting", "running", "review"].map(
        (name) => loaded.animations[name as keyof typeof loaded.animations]?.row,
      ),
    ).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
    expect(loaded.animations.idle?.frames).toBe(6)
    expect(loaded.animations.idle?.durations).toEqual([280, 110, 110, 140, 140, 320])
    expect(loaded.animations["look-0"]).toMatchObject({ row: 9, startFrame: 0, frames: 1 })
    expect(loaded.animations["look-15"]).toMatchObject({ row: 10, startFrame: 7, frames: 1 })
  })
  test("rejects missing, damaged, oversized, traversing, and incorrectly sized input", () => {
    expect(() => adapter.load({ files: [atlas()] })).toThrow("Missing pet.json")
    expect(() => adapter.load({ files: [manifest("{"), atlas()] })).toThrow("Invalid JSON")
    expect(() => adapter.load({ files: [manifest(), atlas({ size: 17 * 1024 * 1024 })] })).toThrow("16 MiB")
    expect(() => adapter.load({ files: [{ ...manifest(), name: "../pet.json" }, atlas()] })).toThrow("unsafe path")
    expect(() => adapter.load({ files: [manifest(), atlas({ width: 1 })] })).toThrow("1536 × 1872")
  })
  test("falls back when an animation is missing", () => {
    expect(companionAnimation("thinking", { idle: { row: 0, frames: 1, fps: 1, loop: true } })).toBe("idle")
  })
})
