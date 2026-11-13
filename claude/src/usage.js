import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import streamDeck from "@elgato/streamdeck";

import { escapeXml, FONT, fitFont, svgImage, TitledAction, topLine } from "./titled-action.js";

const CREDENTIALS = join(homedir(), ".claude", ".credentials.json");
const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const POLL_MS = 180_000;
const MIN_FETCH_MS = 30_000; // key-press refreshes are throttled to this

// --- Shared usage store -------------------------------------------------------
// The 5h and weekly keys read the same response, so it's fetched once for both. The endpoint
// rate-limits hard (429 with a multi-minute Retry-After), which is honored before trying again.
let data;
let fetchedAt = 0;
let blockedUntil = 0;
let inflight;
const listeners = new Set();

/** Reads the OAuth token Claude Code keeps in ~/.claude/.credentials.json (refreshed by Claude Code). */
async function accessToken() {
	const { claudeAiOauth: oauth } = JSON.parse(await readFile(CREDENTIALS, "utf8"));
	if (!oauth?.accessToken) throw new Error("not logged in");
	if (oauth.expiresAt && oauth.expiresAt < Date.now()) throw new Error("token expired");
	return oauth.accessToken;
}

async function load(force) {
	const now = Date.now();
	if (data && now - fetchedAt < (force ? MIN_FETCH_MS : POLL_MS - 5_000)) return;
	if (blockedUntil > now) {
		if (data) return;
		throw new Error("rate limited");
	}
	const res = await fetch(USAGE_URL, {
		headers: {
			Authorization: `Bearer ${await accessToken()}`,
			"anthropic-beta": "oauth-2025-04-20",
			"Content-Type": "application/json",
		},
		signal: AbortSignal.timeout(15_000),
	});
	if (res.status === 429) {
		blockedUntil = now + (Number(res.headers.get("retry-after")) || 300) * 1000;
		if (data) return;
		throw new Error("rate limited");
	}
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	data = await res.json();
	fetchedAt = now;
	for (const fn of listeners) fn(data);
}

/** Refreshes the shared usage data if it's stale; listeners are notified when new data arrives. */
function refreshUsage(force = false) {
	inflight ??= load(force).finally(() => {
		inflight = undefined;
	});
	return inflight;
}
// -----------------------------------------------------------------------------

const color = (pct) => (pct >= 80 ? "#ef5350" : pct >= 50 ? "#ffb74d" : "#66bb6a");

function keyImage(top, state) {
	if (!state) return svgImage(topLine(top));
	if (state.error) {
		return svgImage(
			`${topLine(top)}<text x="72" y="86" ${FONT} font-size="${fitFont(state.error, 20)}" font-weight="600" fill="#ef5350">${escapeXml(state.error)}</text>`,
		);
	}
	const { pct, reset } = state;
	const fill = color(pct);
	const width = Math.round((Math.min(Math.max(pct, 0), 100) / 100) * 112);
	return svgImage(`${topLine(top)}
<text x="72" y="86" ${FONT} font-size="40" font-weight="700" fill="${fill}">${Math.round(pct)}%</text>
<rect x="16" y="98" width="112" height="8" rx="4" fill="#333"/>
<rect x="16" y="98" width="${width}" height="8" rx="4" fill="${fill}"/>
<text x="72" y="128" ${FONT} font-size="15" fill="#999">${escapeXml(reset)}</text>`);
}

/** A key showing one usage-limit window (e.g. `five_hour`) from the /api/oauth/usage response. */
export class UsageAction extends TitledAction {
	state = undefined; // { pct, reset } | { error }
	timer = undefined;

	constructor({ manifestId, defaultTitle, window, formatReset }) {
		super(manifestId, defaultTitle);
		this.window = window;
		this.formatReset = formatReset;
		listeners.add((d) => this.update(d));
	}

	update(d) {
		const w = d[this.window];
		this.state =
			w && typeof w.utilization === "number"
				? { pct: w.utilization, reset: w.resets_at ? `resets ${this.formatReset(new Date(w.resets_at))}` : "" }
				: { error: "no data" };
		return Promise.all(this.actions.map((a) => this.draw(a)));
	}

	draw(action) {
		return action.setImage(keyImage(this.topText(action), this.state));
	}

	async refresh(force = false) {
		if ([...this.actions].length === 0) {
			// No key visible any more; stop polling until one reappears.
			clearInterval(this.timer);
			this.timer = undefined;
			return;
		}
		try {
			await refreshUsage(force);
			if (data && (!this.state || this.state.error)) await this.update(data);
		} catch (e) {
			streamDeck.logger.warn(`usage fetch failed: ${e.message}`);
			// Keep showing the last good value on transient errors.
			if (!this.state || this.state.error) {
				this.state = { error: e.message };
				await Promise.all(this.actions.map((a) => this.draw(a)));
			}
		}
	}

	async onWillAppear(ev) {
		await super.onWillAppear(ev);
		this.timer ??= setInterval(() => this.refresh(), POLL_MS);
		await this.refresh();
	}

	// Press to refresh immediately.
	async onKeyDown() {
		await this.refresh(true);
	}
}
