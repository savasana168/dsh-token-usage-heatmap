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

**Click-to-open panel** — the chip is the button. Clicking it drops the full
panel below it as a floating card; the same click, the panel's × button, a
click outside, or Escape closes it again. The card is rendered through a React
portal on `document.body`, so it is never squeezed by the composer's flex
layout, and on a short window only the card's own body scrolls. Its open state
is remembered between sessions.

## Theme support

Light and dark palettes are separate sets of opaque colours. The dark set is not
the light set at low opacity: a translucent step over the dark card surface reads
as a black square, so each level carries an explicit colour in both themes.

## Settings

The plugin adds three switches under **Settings → General**:

| Switch | Effect |
| --- | --- |
| Show the usage chip in the header | Hides the header chip, and with it the panel's only entry point |
| Open the panel from the chip on a new session | When off, the new-session chip shows the total but opens nothing |
| Open the panel from the chip inside a conversation | When off, the in-conversation chip shows the total but opens nothing |

The switches are stored in the Host configuration, so they apply to every
window of this profile.

## Install

Through the app: **Settings → Plugins**, then install `dsh-token-usage-heatmap`.

From GitHub, against a named profile:

```sh
dsh plugin --profile <name> add github:savasana168/dsh-token-usage-heatmap
```

From this folder before it is published:

```sh
dsh plugin --profile <name> add "file:$PWD"
```

Restart the host after installing; a newly loaded JavaScript bundle needs it.
For DSH Desktop the profile is managed by the app, so use **Settings → Plugins**
there rather than the command line.

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
- `lib/client.js` is the browser half: one entry in
  `conversation.header.leading` that renders both the chip and the panel, plus
  the switches in `settings.general.item`. The panel is a popper portalled to
  `document.body`, so it is positioned under the chip and never squeezed by the
  composer's flex layout; click the chip, its × button, or press Escape to
  close it. The `conversation.input.dock` slot is intentionally unused.

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
