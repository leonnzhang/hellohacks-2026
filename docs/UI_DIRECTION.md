# Chat-native transfer and Memory Center

## Design direction

The Figma prototype is inspiration for the entry point: a quiet **Transfer** button beside the source chat composer opens a short destination menu. The extension samples the active chat's font, composer surface, text color, and light or dark treatment. Its inline control and side panel use the same theme values, with a neutral fallback outside supported chats. The extension keeps its own spacing and controls so they remain consistent across ChatGPT, Claude, and Gemini.

## Quick transfer flow

1. The content script places the button near the visible composer and keeps it in position as the page changes.
2. The menu shows ChatGPT, Claude, and Gemini, including the current service for a fresh same-service chat. It shows the number of core memories that will actually be included and links to **Memory Center** for review and editing.
3. Choosing a destination reads the visible, role-labelled messages, builds the same handoff prompt used by the side panel, and opens an editable draft at the destination. The extension never sends the message. If it cannot read the conversation, it directs the user to the side panel's reviewed capture flow. If insertion fails, the menu offers a copyable prompt.

## Memory Center

The existing Memory tab remains the detailed control surface. It shows the seven core categories, source quotes, automatic capture setting, API key, and edit/delete controls. It shares the active chat's theme values with the inline control. The larger Figma window is not copied as-is: its project and goal sections conflict with the current core-only memory policy.

## Styling contract

`content.js` samples a small theme object from the source composer and returns it through `GET_CHAT_THEME`. `sidepanel.js` maps that object to `--ui-*` CSS variables. The injected button and menu use equivalent `--rt-*` variables inside a shadow root, isolating them from each site's global CSS. Service accents help identify destinations while the surface, font, text, and border come from the current chat. The inline control anchors to the composer container and places its menu above or below according to available space. The side panel wraps narrow action rows instead of forcing controls onto one line. No model call is needed for styling or quick transfer.

## Verification

Automated checks cover prompt assembly, active core category selection, and opening a destination draft. Live checks are still needed on each supported site because composer markup and extension injection points can change. Check both light and dark site themes, narrow windows, long chats, opening Memory Center from the button, and destination insertion before release.
