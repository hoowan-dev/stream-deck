import streamDeck from "@elgato/streamdeck";

import { device, IN1, IN2, MON, P48V } from "./device.js";
import { ToggleAction } from "./toggle.js";

streamDeck.actions.registerAction(
	new ToggleAction({
		manifestId: "com.hoowan.topping.mic",
		defaultTitle: "Mic (IN1)",
		channel: IN1,
		settings: [
			{ id: MON, label: "MON" },
			{ id: P48V, label: "48V" },
		],
		glyph: "mic",
	}),
);
streamDeck.actions.registerAction(
	new ToggleAction({
		manifestId: "com.hoowan.topping.inst",
		defaultTitle: "Inst (IN2)",
		channel: IN2,
		settings: [{ id: MON, label: "MON" }],
		glyph: "mic",
	}),
);

await streamDeck.connect();
await device.start();
device.emit("change");
