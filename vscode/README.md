# Stream Deck: VS Code

Five keys under the **VS Code** category. They act on the VS Code window in front. If the focused
window isn't VS Code, the key first brings the most recently used VS Code window to the front.

| Key | Does |
| --- | --- |
| Left Sidebar | Toggles the Primary Side Bar (Ctrl+B) |
| Right Sidebar | Toggles the Secondary Side Bar (Ctrl+Alt+B) |
| Panel | Toggles the bottom panel (Ctrl+J) |
| Run & Debug | Starts the configuration selected in Run and Debug (F5) |
| Recent | Opens a new, empty window with VS Code's **Open Recent** list (Ctrl+R) |

The shortcuts are VS Code's defaults. If you rebind those commands in VS Code, change the keys in
`src/plugin.js` to match.

**Recent:** pick a workspace from the list (type to filter) and it opens in the new window, so your
current windows stay as they are. Press Escape and you're left with the empty window, which you can
close. Opening the new window takes a couple of seconds, because the list can only be shown once
the window has finished loading.

If VS Code isn't open or can't be brought to the front, the key shows Stream Deck's alert icon and
logs the reason.

## How it works

Like the Obsidian plugin, it keeps one hidden PowerShell process running
(`com.hoowan.vscode.sdPlugin/helper/vscode.ps1`) that compiles a little C# once at startup. The
helper finds VS Code's windows (visible top-level windows of `Code.exe`, front-most first), brings
one to the front, and sends shortcuts with `SendInput`, using left-hand modifiers. For Recent it
starts `Code.exe --new-window` and waits for the new window before pressing Ctrl+R.

## Build / install
```
npm install
npm run build
npx streamdeck link com.hoowan.vscode.sdPlugin   # once
npx streamdeck restart com.hoowan.vscode         # after each rebuild
```

## Top line / Title field
The top line of each key is whatever you type in the key's **Title** field (leave it empty for the
default). Stream Deck's own title rendering is off; if you turn **Show Title** back on, Stream Deck
draws your title with its own font settings and the plugin leaves its top line blank.
