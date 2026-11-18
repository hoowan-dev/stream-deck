# Stream Deck: Alexa Lights

Five keys under the **Alexa Lights** category, each running one of my Alexa light routines:

| Key | Runs the routine |
| --- | --- |
| Living Room Lights On | `living room lights on` |
| Living Room Lights Off | `living room lights off` |
| Bedroom Lights On | `bedroom lights on` |
| Bedroom Lights Off | `bedroom lights off` |
| Mood Lights On | `mood lights on` ("turn on chill lights") |

Each key shows a bulb: yellow (purple for Mood) with `ON`, or grey with `OFF`. While the routine
runs the bottom line shows `...`; then the key flashes a check mark, or an alert if it failed
(the reason is in the plugin log).

## How it works

A key press runs my `alexa-lights` CLI (`C:\dev\alexa\alexa-lights`) with Stream Deck's bundled Node:
`node C:\dev\alexa\alexa-lights\src\cli.js living room lights on`. The CLI matches the phrase to the
routine and runs it on the default Echo, using the Amazon session saved in `C:\dev\alexa\.alexa-cookie.json`.

- The CLI has to be installed (`npm install` in `C:\dev\alexa\alexa-lights`) and signed in (`alexa login`).
- If you're not signed in, the CLI would wait for a browser sign-in, so the key gives up after 30 s and shows an alert.
- Set `ALEXA_LIGHTS_DIR` to use a CLI somewhere other than `C:\dev\alexa\alexa-lights`.

## Build / install
```
npm install
npm run build
npx streamdeck link com.hoowan.alexa-lights.sdPlugin   # once
npx streamdeck restart com.hoowan.alexa-lights         # after each rebuild
```

## Top line / Title field
The top line of each key is whatever you type in the key's **Title** field (leave it empty for the
default). Stream Deck's own title rendering is off; if you turn **Show Title** back on, Stream Deck
draws your title with its own font settings and the plugin leaves its top line blank.
