import { readFileSync } from "node:fs";
import { basename, join } from "node:path";

import streamDeck from "@elgato/streamdeck";

import { helper } from "./helper.js";
import { svgImage, TitledAction, topLine } from "./titled-action.js";

const EXE = join(process.env.ProgramFiles ?? "C:/Program Files", "Obsidian", "Obsidian.exe");
const COLOR = "#a78bfa";

// Windows virtual-key codes (left-hand modifiers specifically).
const LCTRL = 0xa2;
const LSHIFT = 0xa0;
const LALT = 0xa4;
const LEFT = 0x25;
const RIGHT = 0x27;
const S = 0x53;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The vault Obsidian has open (per its own obsidian.json), for obsidian:// URIs. */
function openVaultName() {
	const { vaults } = JSON.parse(readFileSync(join(process.env.APPDATA, "obsidian", "obsidian.json"), "utf8"));
	const list = Object.values(vaults);
	const vault = list.find((v) => v.open) ?? list.sort((a, b) => b.ts - a.ts)[0];
	if (!vault) throw new Error("no Obsidian vault found");
	return basename(vault.path);
}

// 28x28 line icons, drawn at 2x in the middle of the key.
const panel = (x) => `<path d="M${x} 5v18"/>`;
export const GLYPHS = {
	left: `<rect x="3" y="5" width="22" height="18" rx="2.5"/>${panel(10)}<path d="M5.5 9h2M5.5 12h2" stroke-width="1.6"/>`,
	right: `<rect x="3" y="5" width="22" height="18" rx="2.5"/>${panel(18)}<path d="M20.5 9h2M20.5 12h2" stroke-width="1.6"/>`,
	both: `<rect x="3" y="5" width="22" height="18" rx="2.5"/>${panel(9)}${panel(19)}`,
	open: `<rect x="3" y="5" width="22" height="18" rx="2.5"/><path d="M3 10h22"/><path d="M11 19l7-6M13 13h5v5"/>`,
	daily: `<rect x="4" y="6" width="20" height="18" rx="2.5"/><path d="M4 11h20M10 3.5v5M18 3.5v5"/><rect x="15" y="15" width="4" height="4" rx="0.8" fill="${COLOR}"/>`,
};

const keyGlyph = (g) =>
	`<g transform="translate(44 48) scale(2)" fill="none" stroke="${COLOR}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${g}</g>`;

/** A key that brings Obsidian to the front (launching it if needed), then runs `run()`. */
export class ObsidianAction extends TitledAction {
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
			await helper.call({ cmd: "focus", exe: EXE });
			await this.run();
		} catch (e) {
			streamDeck.logger.error(`${this.manifestId} failed: ${e.message}`);
			await ev.action.showAlert();
		} finally {
			this.busy = false;
		}
	}
}

export const ACTIONS = [
	{
		manifestId: "com.hoowan.obsidian.left-sidebar",
		defaultTitle: "Left Sidebar",
		glyph: "left",
		run: () => helper.call({ cmd: "keys", keys: [LCTRL, LALT, LEFT] }),
	},
	{
		manifestId: "com.hoowan.obsidian.right-sidebar",
		defaultTitle: "Right Sidebar",
		glyph: "right",
		run: () => helper.call({ cmd: "keys", keys: [LCTRL, LALT, RIGHT] }),
	},
	{
		manifestId: "com.hoowan.obsidian.open",
		defaultTitle: "Obsidian",
		glyph: "open",
		run: async () => {}, // bringing it to the front is the whole job
	},
	{
		manifestId: "com.hoowan.obsidian.all-sidebars",
		defaultTitle: "All Sidebars",
		glyph: "both",
		run: async () => {
			await helper.call({ cmd: "keys", keys: [LCTRL, LSHIFT, S] });
			await sleep(500);
			await helper.call({ cmd: "keys", keys: [LCTRL, LSHIFT, S] });
		},
	},
	{
		manifestId: "com.hoowan.obsidian.daily-note",
		defaultTitle: "Daily Note",
		glyph: "daily",
		// Same as the "Open today's daily note" button: creates the note from its template if needed.
		run: () => helper.call({ cmd: "uri", uri: `obsidian://daily?vault=${encodeURIComponent(openVaultName())}` }),
	},
];
