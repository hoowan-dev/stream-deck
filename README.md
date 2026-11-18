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

### Claude (`claude/`)

One plugin with three keys, all under the **Claude** category: **5-Hour Usage**, **Weekly Usage** and **Open Claude**.

#### Usage keys

Show my Claude usage-limit utilization: one for the 5-hour window, one for the week.

| Line | Shows |
| --- | --- |
| Top | `Claude 5h:` / `Claude week:` (or your Title) |
| Middle | Usage %, coloured green < 50%, amber < 80%, red ≥ 80% |
| Bottom | Progress bar and reset time (`resets 5:20 PM` / `resets Wed 11 PM`) |

- Data comes from the endpoint behind Claude Code's `/usage`. It's authenticated with the token Claude Code stores in `~/.claude/.credentials.json`. The plugin only reads that token and never refresh it, so if a key shows "token expired", run `claude` once.
- The endpoint rate-limits hard, so both keys share one in-memory copy of the response and make one request between them. They refresh every 3 minutes, and pressing a key refreshes it (at most every 30 s). After a `429` they wait out the `Retry-After` period and keep showing the last good value.

#### Open Claude

Opens a new Windows Terminal window in `C:\dev` (or your home folder if it doesn't exist) running `claude`. Works inside multi-actions.

### Open Terminal (`terminal/`)

Opens a new Windows Terminal window (default profile) in `C:\dev` (or your home folder if it doesn't exist). Works inside multi-actions.

Both launchers start Windows Terminal through its `wt.exe` app-execution alias.

### Topping (`topping/`)

Two keys for my TOPPING E2x2 audio interface, under the **Topping** category.

| Key | Toggles |
| --- | --- |
| Mic (IN1) | MON and 48V phantom power on IN1, together |
| Inst (IN2) | MON on IN2 |

- The icon is green when on, amber when only partly on (e.g. MON on but 48V off) and grey when off. A green ring marks a fully-on key, and the bottom line lights each setting's name.
- The plugin sends the same HID reports as TOPPING Professional Control Center, via [node-hid](https://github.com/node-hid/node-hid). The protocol notes come from [tpmix](https://gitlab.com/terrance_m/tpmix) plus watching the Control Center drive the E2x2.
- The E2x2 can't be asked for its settings, but it reports every change, so the keys also follow changes made in the Control Center. At startup they use whichever is newer: their own last-seen state, or the Control Center's saved profile (which it writes to the interface every time it starts).
- `node-hid` is a native module, so it isn't bundled. Run `npm install` in `topping/` before using the plugin.

### Obsidian (`obsidian/`)

Five keys under the **Obsidian** category. Each one first makes sure Obsidian is open and in front, launching or restoring it if needed. Then:

| Key | Does |
| --- | --- |
| Toggle Left Sidebar | Ctrl+Alt+Left |
| Toggle Right Sidebar | Ctrl+Alt+Right |
| Open Obsidian | Nothing more |
| All Sidebars | Ctrl+Left Shift+S, then again half a second later |
| Daily Note | Opens or creates today's daily note via `obsidian://daily` (same command as the ribbon button) |

- The shortcuts match the hotkeys set in my vault.
- Focusing windows and sending keystrokes is done by a small hidden PowerShell helper (`helper/win.ps1`) that the plugin keeps running.

### Alexa Lights (`alexa-lights/`)

Five keys under the **Alexa Lights** category that run my Alexa light routines: **Living Room Lights On/Off**, **Bedroom Lights On/Off** and **Mood Lights On**.

- Each press runs my `alexa-lights` CLI (`C:\dev\alexa\alexa-lights`) with the routine's phrase, e.g. `living room lights on`. The key shows `...` while it runs, then a check mark or an alert.
- The CLI must be installed and signed in (`alexa login`). If it isn't signed in, the key gives up after 30 s.

### Focussed Volume (`focussed-volume-control/`)

Three keys under the **Focussed Volume** category that change the volume of the app in the focused window, the same per-app volume as Windows' Volume Mixer.

| Key | Does |
| --- | --- |
| Volume Up | Raises the app's volume by the key's increment (default 10%) and unmutes it |
| Volume Down | Lowers the app's volume by the key's increment (default 10%) |
| Toggle Mute | Mutes or unmutes the app |

- The increment is set per key, in the key's **Increment** field.
- The bottom line shows the focused app and its volume (`Spotify 40%`), updated every 1.5 s. An app that hasn't played sound since it started shows `no audio`.
- Like the Obsidian plugin, it uses a small hidden PowerShell helper (`helper/volume.ps1`) to reach the Windows audio APIs.

### VS Code (`vscode/`)

Five keys under the **VS Code** category that act on the focused VS Code window. If the focused window isn't VS Code, the most recently used VS Code window is brought to the front first.

| Key | Does |
| --- | --- |
| Left Sidebar | Ctrl+B (Primary Side Bar) |
| Right Sidebar | Ctrl+Alt+B (Secondary Side Bar) |
| Panel | Ctrl+J (bottom panel) |
| Run & Debug | F5 (starts the selected launch configuration) |
| Recent | Opens a new empty window showing Open Recent (Ctrl+R); the workspace you pick opens in it |

- The shortcuts are VS Code's defaults.
- Like the Obsidian plugin, it uses a small hidden PowerShell helper (`helper/vscode.ps1`) for focusing windows and sending keystrokes.

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
├── src/                          plugin source (entry point: plugin.js)
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
- Claude Code, logged in (Claude only)
- Windows Terminal (launchers only)
- TOPPING E2x2 with the TOPPING Pro driver (Topping only)
- Obsidian, installed in `C:\Program Files\Obsidian` (Obsidian only)
- `alexa-lights` CLI in `C:\dev\alexa\alexa-lights`, signed in (Alexa Lights only)
- VS Code, installed for the current user (`%LOCALAPPDATA%\Programs\Microsoft VS Code`) (VS Code only)
