# Stream Deck: Focussed Volume

Three keys under the **Focussed Volume** category that control the volume of whichever app owns the
focused window. It's the same per-app volume as in Windows' Volume Mixer.

| Key | Does |
| --- | --- |
| Volume Up | Raises the app's volume by the key's increment and unmutes it |
| Volume Down | Lowers the app's volume by the key's increment |
| Toggle Mute | Mutes the app, or unmutes it if it's muted |

- **Increment:** Volume Up and Volume Down have an **Increment** field in the key's settings
  (1–100 percentage points, default 10). The default title shows it, e.g. `Vol +10%`.
- **Live status:** the bottom line shows the focused app and its volume (`Spotify 40%`), or
  `Spotify muted` in red. You can see which app a press will change before you press.
- **No audio:** an app only gets a volume once it has played sound since it started. Until then the
  key shows `no audio` and pressing it shows an alert.

## How it works

Node can't reach Windows' audio APIs, so the plugin keeps one hidden PowerShell process running
(`com.hoowan.focussed-volume-control.sdPlugin/helper/volume.ps1`). It compiles a little C# once at
startup, then answers the plugin's commands over stdin. For each command it:

1. Finds the process that owns the foreground window. Store apps are hosted by
   `ApplicationFrameHost.exe`, so for those it uses the process of the inner window.
2. Collects that app's audio sessions on every active output device. A session belongs to the
   app if it's the same process, a child of it, or another process of the same program. That's
   needed because browsers, Discord and Spotify play audio from a helper process.
3. Reads or changes their volume and mute with `ISimpleAudioVolume`. If the sessions differ, the
   loudest one counts as the app's volume, and a change sets them all to the new level.

While any key is visible the plugin asks for the state every 1.5 s to keep the bottom line current.

## Build / install
```
npm install
npm run build
npx streamdeck link com.hoowan.focussed-volume-control.sdPlugin   # once
npx streamdeck restart com.hoowan.focussed-volume-control         # after each rebuild
```

## Top line / Title field
The top line of each key is whatever you type in the key's **Title** field (leave it empty for the
default). Stream Deck's own title rendering is off; if you turn **Show Title** back on, Stream Deck
draws your title with its own font settings and the plugin leaves its top line blank.
