import { readFile, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import streamDeck, { SingletonAction } from "@elgato/streamdeck";

// --- per-key config -------------------------------------------------------
const ACTION_UUID = "com.hoowan.claude-5h.usage";
const DEFAULT_TITLE = "Claude 5h:";
const WINDOW = "five_hour"; // key in the /api/oauth/usage response
const formatReset = (d) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
// --------------------------------------------------------------------------

const CREDENTIALS = join(homedir(), ".claude", ".credentials.json");
const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const POLL_MS = 180_000;
const MIN_FETCH_MS = 30_000; // key-press refreshes are throttled to this

/** Reads the OAuth token Claude Code keeps in ~/.claude/.credentials.json (refreshed by Claude Code). */
async function accessToken() {
	const { claudeAiOauth: oauth } = JSON.parse(await readFile(CREDENTIALS, "utf8"));
	if (!oauth?.accessToken) throw new Error("not logged in");
	if (oauth.expiresAt && oauth.expiresAt < Date.now()) throw new Error("token expired");
	return oauth.accessToken;
}

// Both usage plugins (5h + weekly) share one cached response so they make a single request between
// them, and honor Retry-After: the endpoint rate-limits hard (429 with multi-minute Retry-After).
const CACHE = join(tmpdir(), "streamdeck-claude-usage.json");

async function readCache() {
	try {
		return JSON.parse(await readFile(CACHE, "utf8"));
	} catch {
		return {};
	}
}

const writeCache = (c) => writeFile(CACHE, JSON.stringify(c)).catch(() => {});

async function fetchUsage({ force = false } = {}) {
	const cache = await readCache();
	const now = Date.now();
	const fresh = cache.data && now - cache.fetchedAt < (force ? MIN_FETCH_MS : POLL_MS - 5_000);
	const blocked = cache.blockedUntil > now;
	let data = cache.data;
	if (!fresh && !blocked) {
		const res = await fetch(USAGE_URL, {
			headers: {
				Authorization: `Bearer ${await accessToken()}`,
				"anthropic-beta": "oauth-2025-04-20",
				"Content-Type": "application/json",
			},
			signal: AbortSignal.timeout(15_000),
		});
		if (res.status === 429) {
			const wait = (Number(res.headers.get("retry-after")) || 300) * 1000;
			await writeCache({ ...cache, blockedUntil: now + wait });
			if (!data) throw new Error("rate limited");
		} else if (!res.ok) {
			throw new Error(`HTTP ${res.status}`);
		} else {
			data = await res.json();
			await writeCache({ data, fetchedAt: now });
		}
	} else if (!data) {
		throw new Error("rate limited");
	}
	const w = data[WINDOW];
	if (!w || typeof w.utilization !== "number") throw new Error(`no ${WINDOW} data`);
	return { pct: w.utilization, resetsAt: w.resets_at ? new Date(w.resets_at) : undefined };
}

function escapeXml(s) {
	return s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]);
}

const color = (pct) => (pct >= 80 ? "#ef5350" : pct >= 50 ? "#ffb74d" : "#66bb6a");
const FONT = 'font-family="Segoe UI, Arial, sans-serif" text-anchor="middle"';

// --- Title field -> top line -------------------------------------------------
// The key's Title field sets the top line. The manifest hides Stream Deck's own title rendering;
// if the user turns "Show Title" back on, Stream Deck draws their title itself and we leave the
// top line blank so it isn't drawn twice. The title is mirrored into settings so it survives restarts.
const titles = new Map(); // action id -> { text, shown }

function topText(id) {
	const t = titles.get(id);
	if (t?.shown && t.text) return "";
	return t?.text || DEFAULT_TITLE;
}

const fitFont = (text, max) => Math.max(10, Math.min(max, Math.floor(128 / (text.length * 0.56))));
// -----------------------------------------------------------------------------

function keyImage(top, { pct, resetsAt, error }) {
	let body;
	if (error) {
		body = `<text x="72" y="86" ${FONT} font-size="${fitFont(error, 20)}" font-weight="600" fill="#ef5350">${escapeXml(error)}</text>`;
	} else {
		const fill = color(pct);
		const width = Math.round((Math.min(Math.max(pct, 0), 100) / 100) * 112);
		const reset = resetsAt ? `resets ${formatReset(resetsAt)}` : "";
		body = `<text x="72" y="86" ${FONT} font-size="40" font-weight="700" fill="${fill}">${Math.round(pct)}%</text>
<rect x="16" y="98" width="112" height="8" rx="4" fill="#333"/>
<rect x="16" y="98" width="${width}" height="8" rx="4" fill="${fill}"/>
<text x="72" y="128" ${FONT} font-size="15" fill="#999">${escapeXml(reset)}</text>`;
	}
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
<rect width="144" height="144" fill="#111"/>
<text x="72" y="36" ${FONT} font-size="${fitFont(top, 22)}" font-weight="600" fill="#ddd">${escapeXml(top)}</text>
${body}
</svg>`;
	return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}

class ClaudeUsage extends SingletonAction {
	manifestId = ACTION_UUID;
	state = undefined;
	timer = undefined;
	inflight = undefined;

	refresh(force = false) {
		if (this.inflight) return this.inflight;
		this.inflight = (async () => {
			if ([...this.actions].length === 0) {
				// No key visible any more; stop polling until one reappears.
				clearInterval(this.timer);
				this.timer = undefined;
				return;
			}
			try {
				this.state = await fetchUsage({ force });
			} catch (e) {
				streamDeck.logger.warn(`usage fetch failed: ${e.message}`);
				// Keep showing the last good value on transient errors.
				if (!this.state || this.state.error) this.state = { error: e.message };
			}
			await Promise.all(this.actions.map((a) => this.draw(a)));
		})().finally(() => {
			this.inflight = undefined;
		});
		return this.inflight;
	}

	draw(action) {
		return action.setImage(keyImage(topText(action.id), this.state));
	}

	async onWillAppear(ev) {
		if (!titles.has(ev.action.id)) titles.set(ev.action.id, { text: ev.payload.settings.title ?? "", shown: false });
		if (this.state) await this.draw(ev.action);
		this.timer ??= setInterval(() => this.refresh(), POLL_MS);
		await this.refresh();
	}

	async onTitleParametersDidChange(ev) {
		const { title, titleParameters, settings } = ev.payload;
		titles.set(ev.action.id, { text: title.replace(/\s*\n\s*/g, " ").trim(), shown: titleParameters.showTitle });
		if (settings.title !== title) await ev.action.setSettings({ ...settings, title });
		if (this.state) await this.draw(ev.action);
	}

	// Press to refresh immediately.
	async onKeyDown() {
		await this.refresh(true);
	}
}

streamDeck.actions.registerAction(new ClaudeUsage());
streamDeck.connect();
