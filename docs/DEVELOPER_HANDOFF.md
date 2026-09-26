# Relay Memory: developer handoff

## Current state

This is an unpacked Chrome Manifest V3 extension with no build step. Load the repository directory at `chrome://extensions` using **Developer mode → Load unpacked**. Reload the extension after code changes, then reload already-open chat tabs before retesting site integration.

The main product requirements are in [PRODUCT_BRIEF.md](PRODUCT_BRIEF.md). Keep all persistent user data in `chrome.storage.local`. Do not add a backend or remote database.

## File map

| File | Responsibility |
| --- | --- |
| `manifest.json` | MV3 permissions, supported hosts, service worker, side panel, content script. |
| `background.js`, `memory-policy.js` | Opens the side panel, saves selected text, calls OpenAI for opt-in automatic memory, and defines the allowed categories. |
| `content.js` | Reads visible chat messages, places the chat-native transfer control, samples theme values, and fills a destination composer. |
| `transfer-core.js` | Shared core memory selection and handoff prompt construction for the inline flow and side panel. |
| `sidepanel.html`, `sidepanel.css` | Conversation, memory, and handoff interface. |
| `sidepanel.js` | UI state, storage, prompt assembly, tab messaging, and destination flow. |
| `prompts/handoff.json` | Wording for the generated **user** prompt. It is not a model system prompt. |
| `tests/save-conversation.test.js` | Mocked Chrome-storage tests for creating and updating a conversation. |

## Data and flow

`chrome.storage.local` has two persistent keys:

```js
chats: [{ id, title, service, sourceUrl, transcript, createdAt, updatedAt? }]
memories: [{ id, text, scope?, category?, origin?, sourceUrl, sourceQuote?, sourceTitle?, createdAt, updatedAt?, project? /* older records only */ }]
memorySuggestions: [{ id, text, quote, sourceUrl, sourceTitle, createdAt }]
autoMemorySettings: { enabled, apiKey }
autoMemoryProcessed: { [sourceUrl]: snapshotHash }
autoMemoryLastError: string
```

`sidepanel.js` sends `CAPTURE` to the active supported tab. `content.js` extracts role/text pairs using service-specific DOM selectors, then falls back to visible page text when needed. The panel formats the result into an editable, unsaved draft. **Save conversation** creates a new entry; choosing an existing entry changes the action to **Update conversation**. Save writes to `chats`, reads it back, and checks the saved ID and transcript before reporting success.

Memories can be entered in the Memory tab or by right-click selection on a supported page. With opt-in enabled, the content script sends a settled, visible conversation to the service worker. The worker asks OpenAI for facts in the fixed [core memory template](MEMORY_TEMPLATE.md), validates each category and user-message quote, and saves qualifying facts directly. The user can see the category reason and quote, then edit or delete the fact. Earlier pending suggestions from version 0.2 remain reviewable. Handoff includes up to three core memories. Older noncore or unscoped records and automatic records in retired categories remain visible but excluded until the user edits and saves one as core.

The preview is assembled from `prompts/handoff.json`, automatically picked memories, the current transcript, and the next request. A transcript over 20,000 characters is shortened in the preview by retaining its beginning and end. **Open & fill** creates a destination tab and sends `INSERT_PROMPT` to its content script. The script locates a composer, inserts text, and checks its content. On an incomplete fill, the panel offers a clipboard fallback. Sending the message remains a user action.

The [chat-native UI](UI_DIRECTION.md) adds a small Transfer button beside a detected composer. Its menu asks the service worker to assemble the same prompt and open an editable destination draft. The Memory Center link opens the side panel on its Memory tab. The content script samples theme values from the active chat, and the panel uses them as CSS variables.

## Permissions and privacy

The extension uses `storage`, `tabs`, `sidePanel`, `contextMenus`, and `scripting`, with host access for ChatGPT, Claude, Gemini, and the OpenAI API listed in `manifest.json`. The service worker sets local-storage access to trusted extension contexts. Saved conversations and memories stay in the current Chrome profile; there is no sync. If automatic memory is enabled, visible chat messages are sent to OpenAI for extraction. Handoff content reaches a destination chat service only when the user sends the filled prompt there.

## Verification status

- `node --test tests/*.test.js` passes mocked save and automatic extraction cases.
- Earlier manual checks exercised ChatGPT capture and Gemini prompt insertion with harmless content. Those checks do not cover every page layout or long conversation.
- The latest saved-conversation dropdown UX has automated coverage but should be checked again in a reloaded extension.
- Claude capture and insertion, Gemini capture, and end-to-end persistence across panel reopen still need live verification.

## Next checks and likely maintenance

1. Run the [product demo](PRODUCT_BRIEF.md#demo-script) in a freshly reloaded extension. Confirm that a newly saved chat appears in the dropdown and survives panel reopen.
2. Exercise capture and insertion on all three services. Check the captured roles and text, the exact composer contents, and the fallback message. Site DOM changes will most likely require updates in `content.js`.
3. Test long and partially loaded chats. If capture includes unrelated interface text or misses old turns, improve service selectors and keep the editable review step.
4. Check storage errors and large transcripts in Chrome. The current save flow reports a failed read-back; the app does not provide export or backup.

Use harmless sample content during verification. Do not put real secrets or private conversations into test fixtures or demo data.
