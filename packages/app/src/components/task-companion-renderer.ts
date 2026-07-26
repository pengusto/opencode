import molebyteManifest from "@/assets/companions/molebyte/pet.json?raw"
import molebyteSpritesheet from "@/assets/companions/molebyte/spritesheet.webp"
import { LegacyAtlasCompanionAdapter } from "./task-companion-package"

export { TaskCompanionSprite } from "./task-companion-sprite"
export { companionAnimation, type CompanionAnimationName, type LoadedCompanion } from "./task-companion-package"

export async function loadBundledMolebyte() {
  const response = await fetch(molebyteSpritesheet)
  if (!response.ok) throw new Error("Molebyte could not be loaded")
  const image = await response.blob()
  const dimensions = await createImageBitmap(image)
  const bytes = new Uint8Array(await image.arrayBuffer())
  return new LegacyAtlasCompanionAdapter().load({
    files: [
      {
        name: "pet.json",
        size: molebyteManifest.length,
        type: "application/json",
        bytes: new TextEncoder().encode(molebyteManifest),
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
