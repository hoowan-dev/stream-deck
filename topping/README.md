# Stream Deck: Topping

Keys for my TOPPING E2x2 audio interface, under the **Topping** category:

| Key | Toggles |
| --- | --- |
| Mic (IN1) | MON and 48V phantom power on IN1, together |
| Inst (IN2) | MON on IN2 |

Each key shows a mic icon, coloured green when on, amber when only part of it is on
(e.g. MON on but 48V off) and grey when off. Below the icon, each setting's name is lit or dimmed,
and a green ring marks a fully-on key. A key that is fully on turns everything off when pressed;
otherwise it turns everything on. If the interface is unplugged the keys show "offline" and
reconnect on their own.

## How it talks to the E2x2

The plugin sends the same 16-byte HID reports as TOPPING Professional Control Center
(`22 33 20 01 01 <channel> <setting> <int32 value> 00 00 66 77 00`; channel `21`/`22` = IN1/IN2,
setting `01` MON, `02` 48V, `03` INST), via [node-hid](https://github.com/node-hid/node-hid).
The protocol notes come from [tpmix](https://gitlab.com/terrance_m/tpmix) (E4x4) and from
watching the Control Center drive the E2x2.

The E2x2 can't be asked for its current settings. Instead it reports every *change* to every app
that has it open, so the keys also follow changes made in the Control Center. At startup the plugin
takes whichever is newer: its own last-seen state, or the Control Center's saved profile. The
Control Center writes that whole profile to the interface (and re-saves it) every time it starts.

**Note:** the Control Center doesn't see changes made from these keys, and when it next starts
(e.g. at login) it resets the interface to its own saved settings. The keys follow along.

## Build / install
```
npm install
npm run build
npx streamdeck link com.hoowan.topping.sdPlugin   # once
npx streamdeck restart com.hoowan.topping         # after each rebuild
```

`node-hid` is a native module, so it isn't bundled. The plugin loads it from `topping/node_modules`
at runtime, which means `npm install` must have been run in this folder.

## Top line / Title field
The top line of each key is whatever you type in the key's **Title** field (leave it empty for the
default). Stream Deck's own title rendering is off; if you turn **Show Title** back on, Stream Deck
draws your title with its own font settings and the plugin leaves its top line blank.
