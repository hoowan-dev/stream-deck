import streamDeck from "@elgato/streamdeck";

import { OpenClaudeAction } from "./open.js";
import { UsageAction } from "./usage.js";

streamDeck.actions.registerAction(
	new UsageAction({
		manifestId: "com.hoowan.claude.usage-5h",
		defaultTitle: "Claude 5h:",
		window: "five_hour",
		formatReset: (d) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
	}),
);
streamDeck.actions.registerAction(
	new UsageAction({
		manifestId: "com.hoowan.claude.usage-week",
		defaultTitle: "Claude week:",
		window: "seven_day",
		formatReset: (d) => d.toLocaleString("en-US", { weekday: "short", hour: "numeric" }),
	}),
);
streamDeck.actions.registerAction(new OpenClaudeAction("com.hoowan.claude.open", "Open Claude"));

streamDeck.connect();
