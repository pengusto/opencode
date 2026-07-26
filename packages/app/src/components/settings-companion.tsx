import type { Component, JSX } from "solid-js"
import { Switch } from "@opencode-ai/ui/switch"
import { useSettings } from "@/context/settings"
import { SettingsList } from "./settings-list"
import { SettingsListV2 } from "./settings-v2/parts/list"
import { SettingsRowV2 } from "./settings-v2/parts/row"

const Controls: Component<{ v2?: boolean }> = (props) => {
  const settings = useSettings()
  const List = props.v2 ? SettingsListV2 : SettingsList
  const Row = props.v2 ? SettingsRowV2 : LegacyRow

  return (
    <div class={props.v2 ? "settings-v2-section" : "flex flex-col gap-1"}>
      <h2 class="text-16-medium text-text-strong pb-2">Companion</h2>
      <List>
        <Row title="Companion mode" description="Choose the compact icon or animated companion.">
          <select
            class="rounded border border-border-base bg-background-base px-2 py-1 text-12-regular"
            value={settings.companion.mode()}
            onChange={(event) => {
              const mode = event.currentTarget.value
              if (mode === "disabled" || mode === "orbit" || mode === "animated") settings.companion.setMode(mode)
            }}
          >
            <option value="disabled">Disabled</option>
            <option value="orbit">Companion icon</option>
            <option value="animated">Animated companion</option>
          </select>
        </Row>
        <Row title="Show companion" description="Show active sessions next to the companion.">
          <Switch checked={settings.companion.enabled()} onChange={settings.companion.setEnabled} />
        </Row>
        <Row title="Companion animations" description="Animate the companion while tasks are active.">
          <Switch
            checked={settings.companion.animations()}
            disabled={!settings.companion.enabled()}
            onChange={settings.companion.setAnimations}
          />
        </Row>
        <Row title="Companion size" description="Resize the companion without changing session cards.">
          <label class="flex items-center gap-2 text-12-regular">
            <input
              type="range"
              min="60"
              max="160"
              value={Math.round(settings.companion.scale() * 100)}
              onInput={(event) => settings.companion.setScale(Number(event.currentTarget.value) / 100)}
              aria-label="Companion size"
            />
            <span class="w-10 text-right">{Math.round(settings.companion.scale() * 100)}%</span>
          </label>
        </Row>
      </List>
    </div>
  )
}

const LegacyRow: Component<{ title: string | JSX.Element; description: string | JSX.Element; children: JSX.Element }> =
  (props) => (
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
