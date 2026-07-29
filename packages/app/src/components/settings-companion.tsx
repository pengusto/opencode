import { For, type Component, type JSX } from "solid-js"
import { Switch } from "@opencode-ai/ui/switch"
import { useSettings } from "@/context/settings"
import { useLanguage } from "@/context/language"
import { SettingsList } from "./settings-list"
import { SettingsListV2 } from "./settings-v2/parts/list"
import { SettingsRowV2 } from "./settings-v2/parts/row"
import { companionCatalog } from "./task-companion-renderer"

const Controls: Component<{ v2?: boolean }> = (props) => {
  const settings = useSettings()
  const language = useLanguage()
  const List = props.v2 ? SettingsListV2 : SettingsList
  const Row = props.v2 ? SettingsRowV2 : LegacyRow

  return (
    <div class={props.v2 ? "settings-v2-section" : "flex flex-col gap-1"}>
      <h2 class="text-16-medium text-text-strong pb-2">{language.t("settings.companion.title")}</h2>
      <div class="rounded-lg border border-border-weak-base overflow-hidden">
        <List>
          <Row title={language.t("settings.companion.mode.title")} description={language.t("settings.companion.mode.description")}>
            <div class="grid grid-cols-3 gap-2 w-[280px] max-w-full">
              <For each={companionCatalog}>
                {(pet) => (
                  <button
                    type="button"
                    class="min-w-0 rounded-lg border px-2 py-2 flex flex-col items-center gap-1.5 text-11-medium focus-visible:outline-2"
                    classList={{
                      "border-border-selected bg-surface-raised-base": settings.companion.pet() === pet.id,
                      "border-border-weak-base hover:bg-surface-raised-base-hover": settings.companion.pet() !== pet.id,
                    }}
                    aria-pressed={settings.companion.pet() === pet.id}
                    onClick={() => settings.companion.setPet(pet.id)}
                  >
                    {pet.spritesheet ? (
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
                  </button>
                )}
              </For>
            </div>
          </Row>
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
