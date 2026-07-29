import byteManifest from "@/assets/companions/byte/pet.json?raw"
import byteSpritesheet from "@/assets/companions/byte/spritesheet.webp"
import { loadLegacyAtlas } from "./task-companion-package"

export { TaskCompanionSprite } from "./task-companion-sprite"
export { companionAnimation, type CompanionAnimationName, type LoadedCompanion } from "./task-companion-package"

export async function loadBundledByte() {
  const response = await fetch(byteSpritesheet)
  if (!response.ok) throw new Error("Byte could not be loaded")
  const image = await response.blob()
  const dimensions = await createImageBitmap(image)
  const bytes = new Uint8Array(await image.arrayBuffer())
  return loadLegacyAtlas({
    files: [
      {
        name: "pet.json",
        size: byteManifest.length,
        type: "application/json",
        bytes: new TextEncoder().encode(byteManifest),
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
