# OpenCode Pets: paused work

Status: paused on 2026-10-14. This fork is retained on GitHub; the local development checkout was scheduled for removal to free disk space. No new feature work or fresh runtime acceptance was performed during this handoff.

## Saved implementation

The starting implementation is commit `9b35324bf1643eaf18a3da211f6d968f43862ea6` on `dev`: companion catalog, separate visibility switch, imported companion persistence and locale fallbacks. Read [Task Companion](task-companion.md) for behavior, format, security and asset provenance.

Main files are under `packages/app/src/components/`: `settings-companion.tsx`, `task-companion.tsx`, `task-companion-library.ts`, `task-companion-package.ts`, the renderer/model and related tests. Desktop overlay integration lives in `packages/desktop`.

## Resume

```sh
git clone --branch dev git@github.com:pengusto/opencode.git opencode-pets
cd opencode-pets
git remote rename origin fork
git remote add origin git@github.com:anomalyco/opencode.git
```

Read root `AGENTS.md`, `packages/app/AGENTS.md` and `docs/task-companion.md`. Use the pinned Bun version from `package.json` (currently 1.3.14), preserving `bun.lock`; do not migrate upstream tooling as part of resuming this work. Install dependencies with `bun install --frozen-lockfile`.

Before feature work, run `bun run typecheck` and `bun run test:unit` from `packages/app`, then verify catalog selection, visibility, imports surviving reload, removal, desktop overlay and locale fallbacks in the actual UI. Root tests intentionally refuse to run. Keep implemented behavior separate from fresh visual acceptance.

## Remaining work and retained data

- Re-establish browser and native desktop acceptance before claiming a release-ready feature.
- Reconcile the future `opencode-companion-v1` format with the currently supported atlas adapters; update documentation only when implemented and tested.
- Preserve the independent visibility setting and selectable Orbit/Byte/Molebyte catalog.
- Review asset permissions and provenance before any further distribution; a code license does not automatically license companion artwork.
- Local ignored pet-generation drafts, prompts and QA images were archived separately and verified before checkout removal. They are intentionally not published with this handoff. Browser IndexedDB imports/settings are outside the checkout and are not removed by checkout cleanup.

No upstream PR or release is created by this pause/handoff.
