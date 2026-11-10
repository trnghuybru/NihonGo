# Learning data archive — 2026-11-10

Snapshot of tracked local source data at commit `6e1f5f6` plus the VPS `imports/` directory.

- Local vocabulary, reading, video, game datasets: `backend/data/`.
- Tracked skill/prompt documents stay at their original paths, including `backend/reading/resources/reading-skill.md`.
- VPS import sources, helper scripts and original transfer bundles: `archive/vps/imports/`.
- VPS SHA-256 inventory and cleanup decisions: `archive/vps/manifest.json`.

No database dumps, accounts, learning history, recordings, environment files or credentials are included. Database/recording backups remain on the VPS. Playlist state and cached captions for the paused import are kept on the VPS so it can resume. Old reading import bundles and the superseded playlist report can be removed after this snapshot is pushed.

This is a storage branch; do not merge it back into staging. Restore individual paths with `git restore --source=origin/archive/learning-data-2026-11-10 -- PATH`.
