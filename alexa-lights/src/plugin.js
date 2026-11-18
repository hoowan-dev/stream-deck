import { execFile } from "node:child_process";
import { join } from "node:path";

import streamDeck from "@elgato/streamdeck";

import { FONT, svgImage, TitledAction, topLine } from "./titled-action.js";

// The alexa-lights CLI (C:\dev\alexa\alexa-lights). It runs any Alexa routine by its voice phrase.
// It is run with Stream Deck's own Node, so it doesn't depend on node being on PATH.
const CLI = join(process.env.ALEXA_LIGHTS_DIR ?? "C:\\dev\\alexa\\alexa-lights", "src", "cli.js");
// Without a saved Amazon session the CLI would wait forever for a browser sign-in; give up instead.
const TIMEOUT_MS = 30_000;

const ON = "#ffd54f";
const MOOD = "#ba68c8";
const OFF = "#666";

// Light bulb, drawn at 2x in the middle of the key. `lit` adds rays around it.
const bulb = (color, lit) =>
	`<g transform="translate(44 40) scale(2)" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
	`<path d="M10 20c0-2-1-3-2.3-4.5A7 7 0 1 1 20.3 15.5C19 17 18 18 18 20z"${lit ? ` fill="${color}" fill-opacity="0.25"` : ""}/>` +
	`<path d="M10.5 23h7M11.5 26h5"/>` +
	(lit ? `<path d="M14 1v2M4 4.5l1.5 1.5M24 4.5l-1.5 1.5M1 12h2M25 12h2" stroke-width="1.6"/>` : "") +
	`</g>`;

const bottomLine = (text, color) =>
	`<text x="72" y="130" ${FONT} font-size="18" font-weight="700" fill="${color}">${text}</text>`;

/** Runs `node cli.js <phrase>`; rejects with the CLI's error line if it fails or times out. */
function runRoutine(phrase) {
	return new Promise((resolve, reject) => {
		execFile(
			process.execPath,
			[CLI, ...phrase.split(" ")],
			{ cwd: join(CLI, "..", ".."), timeout: TIMEOUT_MS, windowsHide: true },
			(err, stdout, stderr) => {
				if (!err) return resolve(stdout.trim());
				const msg = stderr.trim().split("\n").pop() || (err.killed ? "timed out (signed in? run `alexa login`)" : err.message);
				reject(new Error(msg));
			},
		);
	});
}

/** A key that runs one Alexa light routine. */
class RoutineAction extends TitledAction {
	busy = new Set(); // action ids with a routine running

	constructor({ manifestId, defaultTitle, phrase, label, color }) {
		super(manifestId, defaultTitle);
		this.phrase = phrase;
		this.label = label;
		this.color = color;
	}

	draw(action) {
		const busy = this.busy.has(action.id);
		const lit = this.color !== OFF;
		return action.setImage(
			svgImage(topLine(this.topText(action)) + bulb(this.color, lit) + bottomLine(busy ? "..." : this.label, busy ? "#ddd" : this.color)),
		);
	}

	async onKeyDown(ev) {
		if (this.busy.has(ev.action.id)) return;
		this.busy.add(ev.action.id);
		await this.draw(ev.action);
		try {
			const out = await runRoutine(this.phrase);
			streamDeck.logger.info(`${this.phrase}: ${out}`);
			await ev.action.showOk();
		} catch (e) {
			streamDeck.logger.error(`${this.phrase} failed: ${e.message}`);
			await ev.action.showAlert();
		} finally {
			this.busy.delete(ev.action.id);
			await this.draw(ev.action);
		}
	}
}

const ACTIONS = [
	{ id: "living-room-on", defaultTitle: "Living Room", phrase: "living room lights on", label: "ON", color: ON },
	{ id: "living-room-off", defaultTitle: "Living Room", phrase: "living room lights off", label: "OFF", color: OFF },
	{ id: "bedroom-on", defaultTitle: "Bedroom", phrase: "bedroom lights on", label: "ON", color: ON },
	{ id: "bedroom-off", defaultTitle: "Bedroom", phrase: "bedroom lights off", label: "OFF", color: OFF },
	{ id: "mood-on", defaultTitle: "Mood", phrase: "mood lights on", label: "ON", color: MOOD },
];

for (const { id, ...rest } of ACTIONS) {
	streamDeck.actions.registerAction(new RoutineAction({ manifestId: `com.hoowan.alexa-lights.${id}`, ...rest }));
}

await streamDeck.connect();
