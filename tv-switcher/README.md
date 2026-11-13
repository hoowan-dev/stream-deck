# Stream Deck: TV Switcher

Stream Deck key that toggles [`tv-switcher`](../../tv-switcher) between mode `0` (desk monitor)
and mode `1` (TV). The key shows:

```
TV Switcher:
  Desktop      (or "TV")
```

The current mode is read from `tv-switcher status` (TV primary → `TV`, otherwise `Desktop`) on
appear, after every press, and every 20 s, so switches made from the terminal show up too.

## Build / install
```
npm install
npm run build                                   # bundles src/plugin.js -> *.sdPlugin/bin/plugin.js
npx streamdeck link com.hoowan.tv-switcher.sdPlugin   # once
npx streamdeck restart com.hoowan.tv-switcher         # after each rebuild
```

The plugin calls `%USERPROFILE%\.local\bin\tv-switcher.exe` (where `uv tool install` puts it),
falling back to `tv-switcher` on PATH. Logs: `com.hoowan.tv-switcher.sdPlugin/logs/`.

## Top line / Title field
The top line of the key is whatever you type in the key's **Title** field (leave it empty for the
default). Stream Deck's own title rendering is off; if you turn **Show Title** back on, Stream Deck
draws your title with its own font settings and the plugin leaves its top line blank.
