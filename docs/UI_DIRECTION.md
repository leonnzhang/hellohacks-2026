# Chat-native transfer and Memory Center

## Design direction

The Figma prototype is inspiration for the entry point: a quiet **Transfer** button beside the source chat composer opens a short destination menu. The extension detects the active chat's light or dark appearance. Its Transfer popup and Memory Center share Relay's neutral palette, blue accents, typography, rounded cards, and button styles.

## Quick transfer flow

1. The content script places the button near the visible composer and keeps it in position as the page changes.
2. The menu shows ChatGPT, Claude, and Gemini, including the current service for a fresh same-service chat. It links to **Memory Center** for review and editing.
3. Choosing a destination under **Continue conversation in…** brings the role-labelled conversation into a new chat and automatically sends it with a continuation request. An unanswered final user message is answered; an already answered conversation receives a brief acknowledgment.
4. Before sending, Relay checks core memories and adds selected context. It persists a one-time send claim to prevent duplicate automatic sends after refresh. If the automatic attempt fails, the complete draft remains with **Press Send to continue** guidance. Existing drafts and user edits are preserved.

## Memory Center

Memory Center opens as a wide centered overlay from the Transfer menu or toolbar icon on supported chat tabs. A left sidebar switches between Overview, Saved memories, Memory rules, and Privacy & data. Overview uses live counts and a small chart of manual, automatic, and earlier entries. Saved memories contains editing and manual entry; Privacy & data explains data flow and holds automatic capture settings. Project and goal sections from the design exploration are not part of the current core-only memory policy.

Later, if enough real categorized memories exist, the overview could show category trends over time. Keep the current chart tied to actual saved data and avoid invented confidence scores or project counts.

## Styling contract

`content.js` samples the active chat theme and returns it through `GET_CHAT_THEME`. `sidepanel.js` uses its light or dark setting; Memory Center has its own consistent palette. The injected button and menu use the same Relay palette through `--rt-*` variables inside a shadow root. The popup is a compact, non-scrolling destination selector with three single-line choices and a secondary Memory Center link. It shares Memory Center’s palette without repeating its full window header. The inline control anchors to the composer container and places its menu above or below according to available space. No model call is needed for styling or quick transfer.

## Verification

Automated checks cover prompt assembly, active core category selection, and arming the destination tab. Live checks are still needed on each supported site because composer markup and send controls can change. Check both light and dark site themes, narrow windows, long chats, opening Memory Center from the button, and the resulting outgoing message before release.

## UI consistency pass

Memory Center and on-page notifications follow the current chat's light or dark appearance, including modern `oklch` colors. The modal uses readable neutral surfaces, stronger secondary text, and labeled navigation at narrow widths. Keyboard focus stays inside the modal and returns to the previous control when it closes.

Privacy & data begins with the shared OpenAI connection. Saving a key is separate from enabling a feature; Automatic memory and Context search both use switches that save immediately. Editing a memory changes the editor title and accessible label to Edit memory.

Transfer feedback and automatic-memory notifications share a stack in the upper right, away from the composer. Transfer notices can be dismissed without clearing the draft. Memory notifications retain the source quote, reason, and 10-second Undo countdown after the successful save; the timer does not delay persistence. Errors inside Memory Center remain until dismissed. Empty chats show guidance and disable transfer destinations.

Live checks for this pass: ChatGPT in light and dark mode, memory editing and cancellation, context search returning the relevant test memory, transfer into a fresh ChatGPT composer and a successful follow-up response, dismissing the transfer notice, and labeled navigation at 250% zoom. System appearance and 100% zoom were restored after testing. The three previously failing transfer tests had stale fixtures (missing global memory scope and notification elements); those fixtures now match the current behavior.

Long transfers are submitted as context in the first message. If automatic sending fails, the raw context draft remains available for manual sending.

## Automatic continuation verification

The 40 automated tests cover continuation requests for answered and unanswered conversations, one-time send claims, manual fallback, and preserving user drafts and edits. Live synthetic transfers from ChatGPT to fresh ChatGPT and Gemini chats both sent automatically and received a brief context acknowledgment. Claude still needs a live check.
