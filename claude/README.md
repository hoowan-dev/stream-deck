# Stream Deck: Claude

One plugin with three keys under the **Claude** category:

| Key | Does |
| --- | --- |
| 5-Hour Usage | Claude 5-hour usage-limit %, progress bar and reset time. Press to refresh. |
| Weekly Usage | The same for the weekly limit. |
| Open Claude | Opens a new Windows Terminal window in your home folder running `claude`. |

Usage is green < 50%, amber < 80%, red ≥ 80%. It refreshes every 3 min, and a key press refreshes
it (at most every 30 s).

Data comes from `https://api.anthropic.com/api/oauth/usage` (the endpoint behind Claude Code's
`/usage`), authenticated with the token Claude Code stores in `~/.claude/.credentials.json`.
The plugin only reads that file and never refreshes the token, so if a key shows "token expired",
run `claude` once. The endpoint rate-limits hard, so both usage keys share one in-memory response
and wait out any `Retry-After`, showing the last good value meanwhile.

Open Claude starts Windows Terminal via its `wt.exe` app-execution alias, running
`%USERPROFILE%\.local\bin\claude.exe` (or `claude` on PATH).

## Source
- `src/plugin.js`: registers the three actions
- `src/usage.js`: shared usage store and the usage key
- `src/open.js`: Open Claude
- `src/titled-action.js`: base class that turns the Title field into the key's top line

## Build / install
```
npm install
npm run build
npx streamdeck link com.hoowan.claude.sdPlugin   # once
npx streamdeck restart com.hoowan.claude         # after each rebuild
```

## Top line / Title field
The top line of each key is whatever you type in the key's **Title** field (leave it empty for the
default). Stream Deck's own title rendering is off; if you turn **Show Title** back on, Stream Deck
draws your title with its own font settings and the plugin leaves its top line blank.
