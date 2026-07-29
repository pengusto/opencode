import type { CompanionState } from "./task-companion-model"

type LookDirection = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15
export type CompanionAnimationName =
  | "idle"
  | "running-right"
  | "running-left"
  | "waving"
  | "jumping"
  | "failed"
  | "waiting"
  | "running"
  | "review"
  | "working"
  | "attention"
  | "celebrate"
  | "error"
  | `look-${LookDirection}`
export type CompanionPackageFormat = "opencode-companion-v1" | "legacy-8x9-atlas" | "legacy-8x11-atlas"
export type CompanionFile = {
  name: string
  size: number
  type: string
  bytes: Uint8Array
  width?: number
  height?: number
}
export type CompanionPackageInput = { files: CompanionFile[] }
export type LoadedCompanion = {
  id: string
  name: string
  author?: string
  license?: string
  source?: string
  format: CompanionPackageFormat
  image: CompanionFile
  animations: Partial<
    Record<
      CompanionAnimationName,
      { row: number; frames: number; fps: number; loop: boolean; startFrame?: number; durations?: number[] }
    >
  >
  warnings: string[]
  atlas: typeof legacy
}

const manifestLimit = 64 * 1024
const imageLimit = 16 * 1024 * 1024
const legacy = { columns: 8, rows: 9, width: 1536, height: 1872, cellWidth: 192, cellHeight: 208 }
const legacyV2 = { ...legacy, rows: 11, height: 2288 }
const safePath = (name: string) => !name.startsWith("/") && !name.includes("..") && !name.includes("\\")

function file(input: CompanionPackageInput, name: string) {
  return input.files.find((item) => item.name.split("/").at(-1) === name)
}

function json(input: CompanionPackageInput, name: string) {
  const target = file(input, name)
  if (!target) throw new Error(`Missing ${name}`)
  if (target.size > manifestLimit) throw new Error(`${name} exceeds 64 KiB`)
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(target.bytes))
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error()
    return Object.fromEntries(Object.entries(parsed))
  } catch {
    throw new Error(`Invalid JSON in ${name}`)
  }
}

function image(input: CompanionPackageInput, name: string) {
  const target = file(input, name)
  if (!target) throw new Error(`Missing ${name}`)
  if (target.size > imageLimit) throw new Error(`${name} exceeds 16 MiB`)
  const webp =
    target.bytes.length >= 12 &&
    new TextDecoder().decode(target.bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(target.bytes.slice(8, 12)) === "WEBP"
  const png =
    target.bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => target.bytes[index] === byte)
  if (!webp && !png) throw new Error(`${name} is not a valid PNG or WebP image`)
  return target
}

function validatePaths(input: CompanionPackageInput) {
  if (input.files.some((item) => !safePath(item.name))) throw new Error("Companion Pack contains an unsafe path")
}

export function loadLegacyAtlas(input: CompanionPackageInput): LoadedCompanion {
  validatePaths(input)
  const manifest = json(input, "pet.json")
  const atlas = image(input, "spritesheet.webp")
  const version = manifest.spriteVersionNumber === 2 ? legacyV2 : legacy
  if (atlas.width !== version.width || atlas.height !== version.height)
    throw new Error(
      `spritesheet.webp must be ${legacy.width} × ${legacy.height} pixels or ${legacyV2.width} × ${legacyV2.height} pixels for v2`,
    )
  const id =
    typeof manifest.id === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/.test(manifest.id)
      ? manifest.id
      : "imported-companion"
  return {
    id,
    name:
      typeof manifest.displayName === "string"
        ? manifest.displayName.slice(0, 80)
        : typeof manifest.name === "string"
          ? manifest.name.slice(0, 80)
          : "Imported Companion",
    author: typeof manifest.author === "string" ? manifest.author.slice(0, 120) : undefined,
    license: typeof manifest.license === "string" ? manifest.license.slice(0, 80) : undefined,
    source: typeof manifest.source === "string" && manifest.source.startsWith("https://") ? manifest.source : undefined,
    format: version.rows === 11 ? "legacy-8x11-atlas" : "legacy-8x9-atlas",
    image: atlas,
    animations:
      version.rows === 11
          ? {
              idle: { row: 0, frames: 6, fps: 6, loop: true, durations: [280, 110, 110, 140, 140, 320] },
              "running-right": {
                row: 1,
                frames: 8,
                fps: 8,
                loop: true,
                durations: [120, 120, 120, 120, 120, 120, 120, 220],
              },
              "running-left": {
                row: 2,
                frames: 8,
                fps: 8,
                loop: true,
                durations: [120, 120, 120, 120, 120, 120, 120, 220],
              },
              waving: { row: 3, frames: 4, fps: 7, loop: false, durations: [140, 140, 140, 280] },
              jumping: { row: 4, frames: 5, fps: 7, loop: false, durations: [140, 140, 140, 140, 280] },
              failed: { row: 5, frames: 8, fps: 7, loop: false, durations: [140, 140, 140, 140, 140, 140, 140, 240] },
              waiting: { row: 6, frames: 6, fps: 7, loop: true, durations: [150, 150, 150, 150, 150, 260] },
              running: { row: 7, frames: 6, fps: 8, loop: true, durations: [120, 120, 120, 120, 120, 220] },
              review: { row: 8, frames: 6, fps: 7, loop: true, durations: [150, 150, 150, 150, 150, 280] },
              ...Object.fromEntries(
                Array.from({ length: 16 }, (_, direction) => [
                  `look-${direction}`,
                  { row: direction < 8 ? 9 : 10, startFrame: direction % 8, frames: 1, fps: 1, loop: false },
                ]),
              ),
            }
          : {
              idle: { row: 0, frames: legacy.columns, fps: 6, loop: true },
              working: {
                row: 1,
                frames: legacy.columns,
                fps: 10,
                loop: true,
              },
              attention: {
                row: 2,
                frames: legacy.columns,
                fps: 8,
                loop: true,
              },
              celebrate: { row: 3, frames: legacy.columns, fps: 12, loop: false },
              error: { row: 4, frames: legacy.columns, fps: 8, loop: false },
            },
    warnings: [],
    atlas: version,
  }
}

const fallback: Record<CompanionState, CompanionAnimationName[]> = {
  idle: ["idle"],
  thinking: ["review", "working", "idle"],
  working: ["running", "working", "idle"],
  waiting_for_permission: ["waiting", "attention", "idle"],
  waiting_for_user: ["waiting", "attention", "idle"],
  completed: ["jumping", "waving", "celebrate", "idle"],
  failed: ["failed", "error", "idle"],
  cancelled: ["idle"],
}

export function companionAnimation(state: CompanionState, animations: LoadedCompanion["animations"]) {
  return fallback[state].find((name) => animations[name])
}

export async function companionInput(files: File[]): Promise<CompanionPackageInput> {
  return {
    files: await Promise.all(
      files.map(async (item) => {
        const bytes = new Uint8Array(await item.arrayBuffer())
        const dimensions =
          item.type === "image/webp" || item.type === "image/png" ? await createImageBitmap(item) : undefined
        return {
          name: item.webkitRelativePath || item.name,
          size: item.size,
          type: item.type,
          bytes,
          width: dimensions?.width,
          height: dimensions?.height,
        }
      }),
    ),
  }
}

export const legacyAtlas = legacy
