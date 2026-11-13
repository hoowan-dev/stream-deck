# Stream Deck: Obsidian

Obsidian keys under the **Obsidian** category. Every key first makes sure Obsidian is open and in
front: if it isn't running, the key launches it and waits for its window; if it's minimized, the
key restores it. Then:

| Key | Does |
| --- | --- |
| Toggle Left Sidebar | Presses Ctrl+Alt+Left |
| Toggle Right Sidebar | Presses Ctrl+Alt+Right |
| Open Obsidian | Nothing more: opening and focusing Obsidian is the whole job |
| All Sidebars | Presses Ctrl+Left Shift+S, then again half a second later |
| Daily Note | Opens today's daily note, creating it from its template if needed |

The key shortcuts match the hotkeys set in my vault (`app:toggle-left-sidebar`,
`app:toggle-right-sidebar`, and Sidebar Resizer's `expand-both-sidebar-widths`). Daily Note uses
`obsidian://daily?vault=<open vault>`, the same "Open today's daily note" command as the ribbon
button, so it doesn't depend on a hotkey. The open vault is read from `%APPDATA%\obsidian\obsidian.json`.

If Obsidian can't be opened or brought to the front, the key shows Stream Deck's alert icon and
logs the reason.

## How it works

Windows blocks background processes from bringing other windows to the front, and Node can't send
keystrokes by itself. The plugin keeps one hidden PowerShell process running
(`com.hoowan.obsidian.sdPlugin/helper/win.ps1`) that compiles a little C# once at startup. It then
handles commands from the plugin over stdin: focus Obsidian, send a key combination (via
`SendInput`, with left-hand modifiers), or open a URI. It exits when the plugin does.

## Build / install
```
npm install
npm run build
npx streamdeck link com.hoowan.obsidian.sdPlugin   # once
npx streamdeck restart com.hoowan.obsidian         # after each rebuild
```

## Top line / Title field
The top line of each key is whatever you type in the key's **Title** field (leave it empty for the
default). Stream Deck's own title rendering is off; if you turn **Show Title** back on, Stream Deck
draws your title with its own font settings and the plugin leaves its top line blank.
