# Chat-native transfer and Memory Center

## Design direction

The Figma prototype is inspiration for the entry point: a quiet **Transfer** button beside the source chat composer opens a short destination menu. The extension samples the active chat's font, composer surface, text color, and light or dark treatment. Its inline control and Memory Center use the same theme values, with a neutral fallback outside supported chats.

## Quick transfer flow

1. The content script places the button near the visible composer and keeps it in position as the page changes.
2. The menu shows ChatGPT, Claude, and Gemini, including the current service for a fresh same-service chat. It shows how many core memories are available for the Send check and links to **Memory Center** for review and editing.
3. Choosing a destination reads the visible, role-labelled messages, builds the handoff context, and inserts it into the new destination composer immediately. The draft ends with a blank `CURRENT REQUEST` section; the user can inspect or edit it before sending.
4. Clicking Send checks core memories against the new request and adds the selected memories to the outgoing message. Transfer context is already in the composer; no placeholder request is inserted.

## Memory Center

Memory Center opens as a wide centered overlay from the Transfer menu or toolbar icon on supported chat tabs. A left sidebar switches between Overview, Saved memories, Memory rules, and Privacy & data. Overview uses live counts and a small chart of manual, automatic, and earlier entries. Saved memories contains editing and manual entry; Privacy & data explains data flow and holds automatic capture settings. The larger Figma window is condensed for the demo; its project and goal sections are not in the current core-only memory policy.

Later, if enough real categorized memories exist, the overview could show category trends over time. Keep the current chart tied to actual saved data and avoid invented confidence scores or project counts.

## Styling contract

`content.js` samples the active chat theme and returns it through `GET_CHAT_THEME`. `sidepanel.js` uses its light or dark setting; Memory Center has its own consistent palette. The injected button and menu use `--rt-*` variables inside a shadow root. The inline control anchors to the composer container and places its menu above or below according to available space. No model call is needed for styling or quick transfer.

## Verification

Automated checks cover prompt assembly, active core category selection, and arming the destination tab. Live checks are still needed on each supported site because composer markup and send controls can change. Check both light and dark site themes, narrow windows, long chats, opening Memory Center from the button, and the resulting outgoing message before release.

## UI consistency pass

Memory Center and on-page notifications follow the current chat's light or dark appearance, including modern `oklch` colors. The modal uses readable neutral surfaces, stronger secondary text, and labeled navigation at narrow widths. Keyboard focus stays inside the modal and returns to the previous control when it closes.

Privacy & data begins with the shared OpenAI connection. Saving a key is separate from enabling a feature; Automatic memory and Context search both use switches that save immediately. Editing a memory changes the editor title and accessible label to Edit memory.

Transfer feedback and automatic-memory notifications share a stack in the upper right, away from the composer. Transfer notices can be dismissed without clearing the draft. Memory notifications retain the source quote, reason, and 10-second Undo countdown. Errors inside Memory Center remain until dismissed. Empty chats show guidance and disable transfer destinations.

Live checks for this pass: ChatGPT in light and dark mode, memory editing and cancellation, context search returning the relevant test memory, transfer into a fresh ChatGPT composer and a successful follow-up response, dismissing the transfer notice, and labeled navigation at 250% zoom. System appearance and 100% zoom were restored after testing. The three previously failing transfer tests had stale fixtures (missing global memory scope and notification elements); those fixtures now match the current behavior.

Further design work: long transfers still fill the composer with a large raw context draft. An expandable context preview with a clearly separate request field would reduce that friction, while preserving review before Send. Cross-service live checks on Claude and Gemini remain necessary.
