import { EventEmitter } from "node:events";
import { readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import streamDeck from "@elgato/streamdeck";

const HID = createRequire(import.meta.url)("node-hid");

// TOPPING E2x2 (USB 152A:8752) control protocol, as used by TOPPING Professional Control Center.
// Every message is 16 bytes: 22 33 20 01 01 <channel> <setting> <int32 BE value> 00 00 66 77 00
// (the device's reports put a checksum where we send 00 00). Windows needs a 0x00 report ID in
// front, so writes are 17 bytes. The device reports every *change* of a setting back to all
// open handles, whoever caused it (these keys, the Control Center, its startup push).
// Protocol notes: https://gitlab.com/terrance_m/tpmix (E4x4) plus observation of the E2x2.
const VID = 0x152a;
const PID = 0x8752;
const HEADER = [0x22, 0x33, 0x20, 0x01, 0x01];
const TAIL = [0x00, 0x00, 0x66, 0x77, 0x00];

export const IN1 = 0x21;
export const IN2 = 0x22;
export const MON = 0x01;
export const P48V = 0x02;
export const INST = 0x03;

const INPUTS = { IN1, IN2 };
const SETTINGS = { MONIEnable: MON, P48VEnable: P48V, INSTEnable: INST };
const key = (ch, setting) => ((ch << 8) | setting).toString(16);

// The Control Center pushes its saved profile to the device whenever it starts, rewriting that
// profile file as it does, so the file is the device state as of its modification time.
const CC_DIR = "C:/Program Files/TOPPING Pro/TOPPING Professional Control Center";

function readControlCenterProfile() {
	try {
		const ws = JSON.parse(readFileSync(join(CC_DIR, "sound_card_workspace_file.TPconfig"), "utf8"));
		const dir = ws.WS_DATA_PATH || CC_DIR;
		const file = join(dir, "TPwork", `E2X2_${ws.LastWorkspaceOpened}.TPwork`);
		const profile = JSON.parse(readFileSync(file, "utf8"));
		const state = {};
		for (const [name, ch] of Object.entries(INPUTS)) {
			for (const [field, setting] of Object.entries(SETTINGS)) {
				if (typeof profile[name]?.[field] === "boolean") state[key(ch, setting)] = profile[name][field];
			}
		}
		return { state, updatedAt: statSync(file).mtimeMs };
	} catch (e) {
		streamDeck.logger.warn(`could not read Control Center profile: ${e.message}`);
		return { state: {}, updatedAt: 0 };
	}
}

class ToppingDevice extends EventEmitter {
	hid = undefined;
	state = {}; // "2101" -> boolean
	updatedAt = 0;
	retry = undefined;

	get connected() {
		return this.hid !== undefined;
	}

	/** Loads the last known state (ours if newer than the Control Center's profile) and connects. */
	async start() {
		const saved = (await streamDeck.settings.getGlobalSettings()).topping;
		const profile = readControlCenterProfile();
		const best = saved?.updatedAt > profile.updatedAt ? saved : profile;
		this.state = { ...best.state };
		this.updatedAt = best.updatedAt;
		this.connect();
		this.retry = setInterval(() => this.connected || this.connect(), 5_000);
	}

	connect() {
		const info = HID.devices().find((d) => d.vendorId === VID && d.productId === PID);
		if (!info) return;
		try {
			this.hid = new HID.HID(info.path);
		} catch (e) {
			streamDeck.logger.warn(`could not open E2x2: ${e.message}`);
			return;
		}
		this.hid.on("data", (b) => this.onReport(b));
		this.hid.on("error", (e) => {
			streamDeck.logger.warn(`E2x2 disconnected: ${e.message}`);
			this.hid?.close();
			this.hid = undefined;
			this.emit("change");
		});
		streamDeck.logger.info("E2x2 connected");
		this.emit("change");
	}

	onReport(b) {
		if (b[0] !== 0x22 || (b[5] !== IN1 && b[5] !== IN2) || ![MON, P48V, INST].includes(b[6])) return;
		const k = key(b[5], b[6]);
		const on = b.readInt32BE(7) !== 0;
		if (this.state[k] === on) return;
		this.state[k] = on;
		streamDeck.logger.info(`${b[5] === IN1 ? "IN1" : "IN2"} ${{ 1: "MON", 2: "48V", 3: "INST" }[b[6]]} -> ${on ? "on" : "off"}`);
		this.updatedAt = Date.now();
		streamDeck.settings
			.setGlobalSettings({ topping: { state: this.state, updatedAt: this.updatedAt } })
			.catch(() => {});
		this.emit("change");
	}

	/** Last known on/off for a setting, or undefined if never seen. */
	get(ch, setting) {
		return this.state[key(ch, setting)];
	}

	set(ch, setting, on) {
		if (!this.hid) throw new Error("E2x2 not connected");
		const msg = [...HEADER, ch, setting, 0, 0, 0, on ? 1 : 0, ...TAIL];
		this.hid.write([0x00, ...msg]);
		// The device echoes real changes; record it now too in case it was already in that state.
		this.onReport(Buffer.from(msg));
	}
}

export const device = new ToppingDevice();
