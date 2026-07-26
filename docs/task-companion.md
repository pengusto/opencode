# Task Companion

Task Companion reads live OpenCode session status, permission requests, and questions. It does not poll or simulate state.

## Desktop overlay

OpenCode Desktop renders Task Companion in one transparent native window instead of clipping it to the app viewport. The companion can be dragged between physical displays, restores its last valid display position, stays above normal and fullscreen windows, and remains visible while OpenCode is minimized or running in the background.

The last-focused OpenCode window supplies the live session summaries. Clicking a card restores that window and opens the selected session. Transparent areas pass pointer input through on macOS and Windows; Linux uses Electron's available compositor behavior and may have reduced click-through or always-on-top support on Wayland.

The browser build keeps the in-page companion.

## Display modes

- **Disabled** hides Task Companion.
- **Orbit Mode** uses OpenCode's built-in geometric symbols.
- **Companion Mode** animates a user-imported Companion Pack. Without a valid import it safely falls back to Orbit Mode.

Open the lower-right companion with pointer or keyboard. Sessions requiring action sort first; selecting one opens that session. Completed sessions remain visible until their green status circle is hovered into an X and dismissed. Failure and cancellation remain visible for eight seconds. Settings use the existing `settings.v3` store.

## Import Companion

Open Task Companion and choose **Import Companion**, then select a pack directory:

```text
my-companion/
├── pet.json
└── spritesheet.webp
```

The compatibility adapter accepts an 8-column by 9-row WebP atlas: 1536 × 1872 pixels, with 192 × 208 pixel cells. `pet.json` may provide `id`, `name`, `author`, `license`, and an HTTPS `source`. Unknown fields are ignored. Missing optional metadata gets safe display defaults.

It also accepts custom v2 packs such as the bundled user-created **Molebyte** example: an 8-column by 11-row atlas at 1536 × 2288 pixels with `spriteVersionNumber: 2`, `displayName`, and 16 look directions. Task Companion supports all v2 rows: idle, directional dragging, waving, jumping, failed, waiting, running, review, and the 16 clockwise cursor-look poses. Per-frame v2 durations are preserved.

Status mapping and fallback order:

```text
idle                   -> idle
thinking               -> working -> idle
working                -> working -> idle
waiting_for_permission -> attention -> idle
waiting_for_user       -> attention -> idle
completed              -> celebrate -> idle
failed                 -> error -> idle
cancelled              -> idle
```

For v2 packs, thinking uses `review`, active tool calls use `running`, permission and user questions use `waiting`, completion uses `jumping`, failure uses `failed`, and the initial greeting uses `waving`. Dragging selects `running-left` or `running-right`. While idle, cursor position selects one of rows 9–10 outside a neutral deadzone.

## OpenCode Companion Format

`opencode-companion-v1` is reserved for a future flexible format using `companion.json` and separate PNG or WebP animations. It will support variable dimensions, frame counts, FPS, loops, explicit state mappings, previews, authorship, license, and version metadata. The current MVP defines the format name but imports only the legacy atlas format.

## Security boundaries

Imports are treated as untrusted data. The importer:

- parses JSON only and never executes JavaScript, HTML, shell commands, or package content;
- never loads remote resources;
- rejects absolute, parent-traversing, and backslash paths;
- limits manifests to 64 KiB and images to 16 MiB;
- verifies PNG/WebP magic bytes rather than trusting extensions;
- requires exact legacy atlas dimensions;
- restricts IDs and truncates display metadata;
- accepts only HTTPS source metadata and never opens it automatically.

The browser directory picker does not expose symlink targets. Packs currently remain in renderer memory and disappear after reload; no untrusted file is copied outside the picker sandbox.

## Creating a pack

Create a 1536 × 1872 WebP atlas with 8 frames per row. Rows 0–4 represent `idle`, `working`, `attention`, `celebrate`, and `error`. Add a small `pet.json`:

```json
{
  "id": "my-companion",
  "name": "My Companion",
  "author": "Your Name",
  "license": "CC0-1.0",
  "source": "https://example.com/my-companion"
}
```

## Assets, rights, and affiliation

OpenCode includes the user-created Molebyte example with the creator's permission and no separate public license. Its provenance is recorded beside the asset. Other imported assets come from the user. A missing license is displayed as **License not specified** and is never treated as permission to reuse an asset.

OpenCode can import compatible custom companion packages created for other applications. OpenCode does not include or distribute third-party companion assets and is not affiliated with or endorsed by OpenAI. Users are responsible for ensuring that imported assets may legally be used.

**Companion Forge** is a future local authoring workflow. It is not implemented and will not call an external image model without explicit user action.
