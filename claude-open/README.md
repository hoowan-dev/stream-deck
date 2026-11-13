# Stream Deck: Open Claude

Key that opens a new Windows Terminal window (via the `wt.exe` app-execution alias) in your home
folder and starts Claude Code in it (`%USERPROFILE%\.local\bin\claude.exe`, falling back to
`claude` on PATH). Works inside multi-actions too.

## Build / install
```
npm install
npm run build
npx streamdeck link com.hoowan.claude-open.sdPlugin   # once
npx streamdeck restart com.hoowan.claude-open         # after each rebuild
```

## Top line / Title field
The top line of the key is whatever you type in the key's **Title** field (leave it empty for the
default). Stream Deck's own title rendering is off; if you turn **Show Title** back on, Stream Deck
draws your title with its own font settings and the plugin leaves its top line blank.
