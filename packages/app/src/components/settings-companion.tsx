import { createMemo, createSignal, For, onCleanup, onMount, Show, type Component, type JSX } from "solid-js"
import { Switch } from "@opencode-ai/ui/switch"
import { useSettings } from "@/context/settings"
import { useLanguage } from "@/context/language"
import { SettingsList } from "./settings-list"
import { SettingsListV2 } from "./settings-v2/parts/list"
import { SettingsRowV2 } from "./settings-v2/parts/row"
import { companionCatalog } from "./task-companion-renderer"
import {
  companionLibraryChanged,
  importCompanion,
  listCompanions,
  removeCompanion,
} from "./task-companion-library"
import type { LoadedCompanion } from "./task-companion-package"

const Controls: Component<{ v2?: boolean }> = (props) => {
  const settings = useSettings()
  const language = useLanguage()
  const List = props.v2 ? SettingsListV2 : SettingsList
  const Row = props.v2 ? SettingsRowV2 : LegacyRow
  const [library, setLibrary] = createSignal<LoadedCompanion[]>([])
  const [error, setError] = createSignal<string>()
  let picker!: HTMLInputElement
  const refresh = () => void listCompanions().then(setLibrary).catch(() => setError(language.t("settings.companion.catalog.error")))
  const pets = createMemo(() => [
    ...companionCatalog.map((pet) => ({ ...pet, removable: false })),
    ...library().map((pet) => ({ ...pet, removable: true })),
  ])

  onMount(() => {
    refresh()
    window.addEventListener(companionLibraryChanged, refresh)
    onCleanup(() => window.removeEventListener(companionLibraryChanged, refresh))
  })

  const importPet = async (files: FileList | null) => {
    if (!files?.length) return
    setError()
    try {
      settings.companion.setPet((await importCompanion([...files])).id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : language.t("settings.companion.catalog.error"))
    } finally {
      picker.value = ""
    }
  }

  const removePet = async (pet: { id: string; name: string }) => {
    if (!confirm(language.t("settings.companion.catalog.removeConfirm", { name: pet.name }))) return
    setError()
    try {
      if (settings.companion.pet() === pet.id) settings.companion.setPet("byte")
      await removeCompanion(pet.id)
    } catch {
      setError(language.t("settings.companion.catalog.error"))
    }
  }

  return (
    <div class={props.v2 ? "settings-v2-section" : "flex flex-col gap-1"}>
      <h2 class="text-16-medium text-text-strong pb-2">{language.t("settings.companion.title")}</h2>
      <div class="rounded-lg border border-border-weak-base overflow-hidden">
        <div class="p-3 border-b border-border-weak-base">
          <div class="text-13-medium text-text-strong">{language.t("settings.companion.mode.title")}</div>
          <div class="text-12-regular text-text-weak">{language.t("settings.companion.mode.description")}</div>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
            <For each={pets()}>
              {(pet) => (
                <div class="relative min-w-0">
                  <button
                    type="button"
                    class="w-full min-w-0 rounded-lg border px-2 py-2 flex flex-col items-center gap-1.5 text-11-medium focus-visible:outline-2"
                    classList={{
                      "border-border-selected bg-surface-raised-base": settings.companion.pet() === pet.id,
                      "border-border-weak-base hover:bg-surface-raised-base-hover": settings.companion.pet() !== pet.id,
                    }}
                    aria-pressed={settings.companion.pet() === pet.id}
                    onClick={() => settings.companion.setPet(pet.id)}
                  >
                    {"image" in pet ? (
                      <StoredPetPreview companion={pet} />
                    ) : pet.spritesheet ? (
                      <span
                        aria-hidden="true"
                        class="block w-12 h-[52px] bg-no-repeat"
                        style={{
                          "background-image": `url(${pet.spritesheet})`,
                          "background-size": "384px 572px",
                          "image-rendering": "pixelated",
                        }}
                      />
                    ) : (
                      <span aria-hidden="true" class="w-12 h-[52px] flex items-center justify-center text-24-medium">◉</span>
                    )}
                    <span class="truncate max-w-full">{pet.name}</span>
                    <span class="truncate max-w-full text-10-regular text-text-weak">
                      {"image" in pet
                        ? `${pet.author ?? language.t("settings.companion.catalog.unknownAuthor")} · ${pet.license ?? language.t("settings.companion.catalog.noLicense")}`
                        : language.t("settings.companion.catalog.bundled")}
                    </span>
                  </button>
                  <Show when={pet.removable}>
                    <button
                      type="button"
                      class="absolute top-1 right-1 size-6 rounded-md bg-background-base/90 text-text-weak hover:text-icon-critical-base focus-visible:outline-2"
                      aria-label={language.t("settings.companion.catalog.remove", { name: pet.name })}
                      onClick={() => void removePet(pet)}
                    >
                      ×
                    </button>
                  </Show>
                </div>
              )}
            </For>
          </div>
          <div class="mt-3 flex items-center gap-2">
            <button type="button" class="text-12-medium underline" onClick={() => picker.click()}>
              {language.t("settings.companion.catalog.import")}
            </button>
            <input
              ref={(element) => {
                picker = element
                element.setAttribute("webkitdirectory", "")
              }}
              class="hidden"
              type="file"
              multiple
              onChange={(event) => void importPet(event.currentTarget.files)}
            />
            <Show when={error()}>{(message) => <span role="alert" class="text-11-regular text-icon-critical-base">{message()}</span>}</Show>
          </div>
        </div>
        <List>
          <Row
            title={language.t("settings.companion.show.title")}
            description={language.t("settings.companion.show.description")}
          >
            <Switch checked={settings.companion.enabled()} onChange={settings.companion.setEnabled} />
          </Row>
          <Row
            title={language.t("settings.companion.animations.title")}
            description={language.t("settings.companion.animations.description")}
          >
            <Switch
              checked={settings.companion.animations()}
              disabled={!settings.companion.enabled()}
              onChange={settings.companion.setAnimations}
            />
          </Row>
          <Row
            title={language.t("settings.companion.size.title")}
            description={language.t("settings.companion.size.description")}
          >
            <label class="flex items-center gap-2 text-12-regular">
              <input
                type="range"
                min="60"
                max="160"
                value={Math.round(settings.companion.scale() * 100)}
                onInput={(event) => settings.companion.setScale(Number(event.currentTarget.value) / 100)}
                aria-label={language.t("settings.companion.size.title")}
              />
              <span class="w-10 text-right">{Math.round(settings.companion.scale() * 100)}%</span>
            </label>
          </Row>
        </List>
      </div>
    </div>
  )
}

const StoredPetPreview: Component<{ companion: LoadedCompanion }> = (props) => {
  const url = URL.createObjectURL(new Blob([props.companion.image.bytes.slice().buffer], { type: props.companion.image.type }))
  onCleanup(() => URL.revokeObjectURL(url))
  return (
    <span
      aria-hidden="true"
      class="block w-12 h-[52px] bg-no-repeat"
      style={{
        "background-image": `url(${url})`,
        "background-size": `${props.companion.atlas.width / 4}px ${props.companion.atlas.height / 4}px`,
        "image-rendering": "pixelated",
      }}
    />
  )
}

const LegacyRow: Component<{
  title: string | JSX.Element
  description: string | JSX.Element
  children: JSX.Element
}> = (props) => (
  <div class="flex items-center justify-between gap-4 py-3 border-b border-border-weak-base last:border-b-0">
    <div class="min-w-0">
      <div class="text-13-medium text-text-strong">{props.title}</div>
      <div class="text-12-regular text-text-weak">{props.description}</div>
    </div>
    <div class="shrink-0">{props.children}</div>
  </div>
)

export const SettingsCompanion: Component = () => <Controls />
export const SettingsCompanionV2: Component = () => <Controls v2 />
