# Stream Deck: Open Terminal

Key that opens a new Windows Terminal window (its default profile) in your home folder, via the
`wt.exe` app-execution alias. Works inside multi-actions too.

## Build / install
```
npm install
npm run build
npx streamdeck link com.hoowan.terminal.sdPlugin   # once
npx streamdeck restart com.hoowan.terminal         # after each rebuild
```

## Top line / Title field
The top line of the key is whatever you type in the key's **Title** field (leave it empty for the
default). Stream Deck's own title rendering is off; if you turn **Show Title** back on, Stream Deck
draws your title with its own font settings and the plugin leaves its top line blank.
