# dsh-token-usage-heatmap

A token usage panel for the DSH Web GUI. It folds the session logs already on
disk into per-day buckets and draws them as a 26-week heatmap, a per-model bar
chart and a compact total in the header.

Nothing leaves the machine: the roll-up is computed by the host from local
session logs and served only to this machine's own loopback GUI.

## What it shows

**Overview tab**

- A 26-week calendar heatmap of daily token usage, one cell per day, four blue
  levels scaled to the busiest day in the current range. Cells are week-aligned:
  the grid is always 26 columns and only advances on Sundays, so it does not
  shift under the pointer as days pass.
- Six figures for the selected range: total tokens, messages, sessions, active
  days, peak hour, and most-used model.
- A "your usage is worth N copies of …" line comparing the total against the
  token count of well-known books.

**Models tab**

- A stacked daily bar chart plus a per-model ranking with session counts.
- The axis keeps exactly three ticks (0, half, peak) at every usage level, and
  the top tick is rounded *up* so a bar can never cross it.

**Ranges** — 全部 / 30 天 / 7 天. "全部" means every day on disk, not the 26
weeks the grid happens to draw. The bar chart uses a 30-day window for 全部 and
30 天, and a 7-day window for 7 天.

**Header chip** — a compact token total at the left of the session header. It
polls once a minute, refreshes on window focus, and retries briefly on a cold
start, so it does not stay frozen on the value it saw when the page loaded.

**Collapsible panel** — the full-width strip at the top of the panel collapses
it to a single bar that still shows the current total; the state is remembered.

## Theme support

Light and dark palettes are separate sets of opaque colours. The dark set is not
the light set at low opacity: a translucent step over the dark card surface reads
as a black square, so each level carries an explicit colour in both themes.

## Settings

The plugin adds three switches under **Settings → General**:

| Switch | Effect |
| --- | --- |
| Show the usage chip in the header | Hides the header chip |
| Show the statistics panel on a new session | Hides the panel on the blank new-session screen |
| Also show the statistics panel inside a conversation | When off, the panel appears only on the blank new-session screen |

The switches are stored in the Host configuration, so they apply to every
window of this profile.

## Install

Through the app: **Settings → Plugins**, then install `dsh-token-usage-heatmap`.

From a terminal:

```sh
dsh plugin --profile <profile> add dsh-token-usage-heatmap
```

Replace `<profile>` with the profile that runs your host (for DSH Desktop it is
managed by the app — install through **Settings → Plugins** there). Restart the
host after installing; a newly loaded JavaScript bundle needs it.

## How it works

- `lib/fold.js` reads session logs under `$DSH_HOME/sessions`, both plain
  `session*.jsonl` and multi-frame `session*.jsonl.zstd`, and folds each one into
  per-day, per-hour and per-model buckets.
- `lib/usage.js` merges the sessions into a roll-up and caches it at
  `$DSH_HOME/cache/token-usage-heatmap/usage.<pid>.json`, so a warm start does
  not re-read every log.
- `lib/index.js` registers one exact route, `/token-usage-heatmap/usage`, which
  answers JSON. It requires a loopback `Host` header, refuses
  `sec-fetch-site: cross-site`, and requires any `Origin` to match the host — a
  web page elsewhere must not be able to read your whole token history.
- `lib/client.js` is the browser half: the panel in `conversation.input.dock`,
  the chip in `conversation.header.leading`, and the switches in
  `settings.general.item`.

The plugin declares `dsh.bundle` with `cordis.patch.yml`, so it installs as a
bundle and its row can be switched on and off like any other plugin.

## Requirements

- A DSH host that serves the Web GUI and exposes `webServer` to plugins.
- Node 22.15 or newer, or any runtime whose `node:zlib` exports
  `zstdDecompressSync`. On an older runtime the plugin still loads and serves
  the route; only compressed session logs (`.jsonl.zstd`) are skipped, so plain
  `.jsonl` logs still count.
- No build step and no dependencies: the published package is plain JavaScript.

## Licence

MIT — see [LICENSE](LICENSE).
