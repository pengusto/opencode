import byteManifest from "@/assets/companions/byte/pet.json?raw"
import byteSpritesheet from "@/assets/companions/byte/spritesheet.webp"
import molebyteManifest from "@/assets/companions/molebyte/pet.json?raw"
import molebyteSpritesheet from "@/assets/companions/molebyte/spritesheet.webp"
import { loadLegacyAtlas } from "./task-companion-package"

export { TaskCompanionSprite } from "./task-companion-sprite"
export { companionAnimation, type CompanionAnimationName, type LoadedCompanion } from "./task-companion-package"

const bundled = {
  byte: { manifest: byteManifest, spritesheet: byteSpritesheet },
  molebyte: { manifest: molebyteManifest, spritesheet: molebyteSpritesheet },
}

export function isBundledCompanion(id: string): id is keyof typeof bundled {
  return id === "byte" || id === "molebyte"
}

export const companionCatalog = [
  { id: "orbit", name: "Orbit" },
  { id: "byte", name: "Byte", spritesheet: byteSpritesheet },
  { id: "molebyte", name: "Molebyte", spritesheet: molebyteSpritesheet },
] satisfies { id: "orbit" | "byte" | "molebyte"; name: string; spritesheet?: string }[]

export async function loadBundledCompanion(id: "byte" | "molebyte") {
  const item = bundled[id]
  const response = await fetch(item.spritesheet)
  if (!response.ok) throw new Error(`${id === "byte" ? "Byte" : "Molebyte"} could not be loaded`)
  const image = await response.blob()
  const dimensions = await createImageBitmap(image)
  const bytes = new Uint8Array(await image.arrayBuffer())
  return loadLegacyAtlas({
    files: [
      {
        name: "pet.json",
        size: item.manifest.length,
        type: "application/json",
        bytes: new TextEncoder().encode(item.manifest),
      },
      {
        name: "spritesheet.webp",
        size: bytes.byteLength,
        type: "image/webp",
        bytes,
        width: dimensions.width,
        height: dimensions.height,
      },
    ],
  })
}
