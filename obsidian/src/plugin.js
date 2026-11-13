import streamDeck from "@elgato/streamdeck";

import { ACTIONS, ObsidianAction } from "./actions.js";
import { helper } from "./helper.js";

for (const action of ACTIONS) streamDeck.actions.registerAction(new ObsidianAction(action));

await streamDeck.connect();
helper.start(); // compile the helper's C# now so the first key press is quick
