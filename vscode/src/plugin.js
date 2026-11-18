import streamDeck from "@elgato/streamdeck";

import { helper } from "./helper.js";
import { svgImage, TitledAction, topLine } from "./titled-action.js";

const COLOR = "#3ea6f2";

// Windows virtual-key codes (left-hand modifiers specifically). These are VS Code's default shortcuts.
const LCTRL = 0xa2;
const LALT = 0xa4;
const B = 0x42;
const J = 0x4a;
const R = 0x52;
const F5 = 0x74;

// 28x28 line icons, drawn at 2x in the middle of the key.
const frame = `<rect x="3" y="5" width="22" height="18" rx="2.5"/>`;
export const GLYPHS = {
	left: `${frame}<path d="M10 5v18"/><path d="M5.5 9h2M5.5 12h2" stroke-width="1.6"/>`,
	right: `${frame}<path d="M18 5v18"/><path d="M20.5 9h2M20.5 12h2" stroke-width="1.6"/>`,
	panel: `${frame}<path d="M3 16h22"/><path d="M6.5 19.5h5" stroke-width="1.6"/>`,
	debug: `<path d="M9 5.5v17l13-8.5z" fill="${COLOR}" fill-opacity="0.25"/>`,
	recent: `<circle cx="14" cy="14" r="10"/><path d="M14 8v6l4 2.5"/>`,
};

const keyGlyph = (g) =>
	`<g transform="translate(44 48) scale(2)" fill="none" stroke="${COLOR}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${g}</g>`;

/** A key that acts on the focused VS Code window (or brings the most recent one forward first). */
class VSCodeAction extends TitledAction {
	busy = false;

	constructor({ manifestId, defaultTitle, glyph, run }) {
		super(manifestId, defaultTitle);
		this.glyph = glyph;
		this.run = run;
	}

	draw(action) {
		return action.setImage(svgImage(topLine(this.topText(action)) + keyGlyph(GLYPHS[this.glyph])));
	}

	async onKeyDown(ev) {
		if (this.busy) return;
		this.busy = true;
		try {
			await this.run();
		} catch (e) {
			streamDeck.logger.error(`${this.manifestId} failed: ${e.message}`);
			await ev.action.showAlert();
		} finally {
			this.busy = false;
		}
	}
}

/** Focus VS Code, then press a shortcut. */
const shortcut = (...keys) => async () => {
	await helper.call({ cmd: "focus" });
	await helper.call({ cmd: "keys", keys });
};

const ACTIONS = [
	{ id: "left-sidebar", defaultTitle: "Left Sidebar", glyph: "left", run: shortcut(LCTRL, B) }, // Toggle Primary Side Bar
	{ id: "right-sidebar", defaultTitle: "Right Sidebar", glyph: "right", run: shortcut(LCTRL, LALT, B) }, // Toggle Secondary Side Bar
	{ id: "panel", defaultTitle: "Panel", glyph: "panel", run: shortcut(LCTRL, J) }, // Toggle Panel
	{ id: "debug", defaultTitle: "Run & Debug", glyph: "debug", run: shortcut(F5) }, // Start Debugging (selected launch config)
	{
		id: "recent",
		defaultTitle: "Recent",
		glyph: "recent",
		// Open Recent, shown in a new empty window: whatever you pick opens in that window, i.e. a new one.
		run: async () => {
			await helper.call({ cmd: "newWindow" });
			await helper.call({ cmd: "keys", keys: [LCTRL, R] });
		},
	},
];

for (const { id, ...rest } of ACTIONS) {
	streamDeck.actions.registerAction(new VSCodeAction({ manifestId: `com.hoowan.vscode.${id}`, ...rest }));
}

await streamDeck.connect();
helper.start(); // compile the helper's C# now so the first key press is quick
