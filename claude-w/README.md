# Stream Deck: Claude weekly usage

Key showing Claude's weekly usage-limit utilization (big %, progress bar, reset time). Green < 50%,
amber < 80%, red ≥ 80%. Refreshes every 3 min; press the key to refresh now (at most every 30 s).

Data comes from `https://api.anthropic.com/api/oauth/usage` (the endpoint behind Claude Code's
`/usage`), authenticated with the token Claude Code stores in `~/.claude/.credentials.json`.
The plugin only reads that file and never refreshes the token, so if the key shows
"token expired", run `claude` once to refresh it.
The endpoint rate-limits hard, so the 5h and weekly plugins share one cached response
(`%TEMP%\streamdeck-claude-usage.json`) and wait out any `Retry-After`, showing the last good
value meanwhile.

## Build / install
```
npm install
npm run build
npx streamdeck link com.hoowan.claude-w.sdPlugin   # once
npx streamdeck restart com.hoowan.claude-w         # after each rebuild
```

## Top line / Title field
The top line of the key is whatever you type in the key's **Title** field (leave it empty for the
default). Stream Deck's own title rendering is off; if you turn **Show Title** back on, Stream Deck
draws your title with its own font settings and the plugin leaves its top line blank.
