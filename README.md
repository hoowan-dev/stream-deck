# Stream Deck Plugins

My collection of personal Stream Deck plugins.

These are small plugins built on the [Stream Deck SDK](https://docs.elgato.com/streamdeck/sdk/introduction/getting-started/) (Node.js, SDK v3), made for my own setup. Feel free to use or adapt them, but they're tuned for my hardware and aren't official Elgato products.

Every key draws its own image: a top line of text plus the key's content. The top line is whatever you type in the key's **Title** field, or a default if the field is left empty. Stream Deck's own title rendering is off by default. If you turn **Show Title** back on, Stream Deck draws your title in its own style and the plugin leaves its top line blank.

## Plugins

### TV Switcher (`tv-switcher/`)

A key that toggles between my desk monitor and the TV using my [`tv-switcher`](https://github.com/hoowan-dev/tv-switcher) CLI.

| Line | Shows |
| --- | --- |
| Top | `TV Switcher:` (or your Title) |
| Bottom | `Desktop` (blue) or `TV` (amber) |

- Pressing it runs `tv-switcher 0` or `tv-switcher 1`, and the key shows `...` while the switch runs.
- The current mode comes from `tv-switcher status`: if the TV is the primary display it's `TV`, otherwise `Desktop`. The key checks this on appear, after each press and every 20 s, so switches made from a terminal show up too.

### Claude Usage (`claude-5h/`, `claude-w/`)

Two keys showing my Claude usage-limit utilization: one for the 5-hour window, one for the week.

| Line | Shows |
| --- | --- |
| Top | `Claude 5h:` / `Claude week:` (or your Title) |
| Middle | Usage %, coloured green < 50%, amber < 80%, red ≥ 80% |
| Bottom | Progress bar and reset time (`resets 5:20 PM` / `resets Wed 11 PM`) |

- Data comes from the endpoint behind Claude Code's `/usage`. It's authenticated with the token Claude Code stores in `~/.claude/.credentials.json`. The plugins only read that token and never refresh it, so if a key shows "token expired", run `claude` once.
- The endpoint rate-limits hard, so both plugins share one cached response (`%TEMP%\streamdeck-claude-usage.json`) and make one request between them. They refresh every 3 minutes, and pressing a key refreshes it (at most every 30 s). After a `429` they wait out the `Retry-After` period and keep showing the last good value.

### Launchers (`terminal/`, `claude-open/`)

| Plugin | Does |
| --- | --- |
| Open Terminal | Opens a new Windows Terminal window (default profile) in your home folder |
| Open Claude | Opens a new Windows Terminal window in your home folder running `claude` |

Both launch Windows Terminal through its `wt.exe` app-execution alias, and both work inside multi-actions.

## Install

Each plugin is its own npm project. For each folder:

```
cd <plugin>
npm install
npm run build                                     # bundles src/plugin.js -> *.sdPlugin/bin/plugin.js
npx streamdeck dev                                # once: enables developer mode
npx streamdeck link com.hoowan.<plugin>.sdPlugin  # once
npx streamdeck restart com.hoowan.<plugin>        # after each rebuild
```

Then drag the action onto a key from its category in the Stream Deck app. Logs go to `<plugin>/com.hoowan.<plugin>.sdPlugin/logs/`.

## Layout

```
<plugin>/
├── src/plugin.js                 plugin source (all of the logic)
├── rollup.config.js              bundles the SDK into bin/plugin.js
└── com.hoowan.<plugin>.sdPlugin/ the plugin Stream Deck loads
    ├── manifest.json
    ├── imgs/                     plugin, category, action and default key icons
    └── bin/                      build output (git-ignored)
```

## Requirements

- Windows 10/11
- Stream Deck 7.1 or newer
- Node.js (for building only; Stream Deck runs the plugins on its bundled Node 24)
- [`tv-switcher`](https://github.com/hoowan-dev/tv-switcher) (TV Switcher only)
- Claude Code, logged in (Claude Usage and Open Claude only)
- Windows Terminal (launchers only)
