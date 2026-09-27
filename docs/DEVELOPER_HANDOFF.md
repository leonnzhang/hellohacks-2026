# Relay Memory: developer handoff

## Current state

This is an unpacked Chrome Manifest V3 extension with no build step. Load the repository directory at `chrome://extensions` using **Developer mode → Load unpacked**. Reload the extension after code changes, then reload already-open chat tabs before retesting site integration.

The main product requirements are in [PRODUCT_BRIEF.md](PRODUCT_BRIEF.md). Keep all persistent user data in `chrome.storage.local`. Do not add a backend or remote database.

## File map

| File | Responsibility |
| --- | --- |
| `manifest.json` | MV3 permissions, supported hosts, service worker, toolbar action, content script. |
| `background.js`, `memory-policy.js` | Saves selected text, calls OpenAI for opt-in automatic memory, and defines the allowed categories. |
| `content.js` | Reads visible chat messages, places the chat-native transfer control, and samples theme values. |
| `transfer-review.js` | Intercepts the destination's first send, shows the complete message for approval, and fills the composer after approval. |
| `transfer-core.js` | Core memory selection and handoff prompt construction for the inline flow. |
| `sidepanel.html`, `sidepanel.css` | Memory Center split view, sidebar, chart, and privacy controls. |
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

`sidepanel.js` sends `CAPTURE` to the active supported tab. `content.js` extracts role/text pairs using service-specific DOM selectors, then falls back to visible page text when needed. The inline Transfer menu formats detected messages for a pending destination transfer. The older panel capture flow remains in code but its Handoff view is hidden for the demo. **Save conversation** creates a new entry; choosing an existing entry changes the action to **Update conversation**. Save writes to `chats`, reads it back, and checks the saved ID and transcript before reporting success.

Memories can be entered in Memory Center or by right-click selection on a supported page. With opt-in enabled, the content script sends a settled, visible conversation to the service worker. The worker asks OpenAI for facts in the fixed [core memory template](MEMORY_TEMPLATE.md), validates each category and user-message quote, and saves qualifying facts directly. The user can see the category reason and quote, then edit or delete the fact. Earlier pending suggestions from version 0.2 remain reviewable. Handoff includes up to three core memories. Older noncore or unscoped records and automatic records in retired categories remain visible but excluded until the user edits and saves one as core.

The legacy Handoff panel remains hidden in the current UI. Its read-only preview is assembled from `prompts/handoff.json`, automatically picked memories, and the current transcript. A transcript over 20,000 characters is shortened by retaining its beginning and end. The active inline Transfer flow opens a blank destination tab and stores pending context for its first send.

The [chat-native UI](UI_DIRECTION.md) adds a small Transfer button beside a detected composer. Its menu asks the service worker to assemble context and open a blank destination chat. The service worker stores that context under the destination tab ID in `chrome.storage.session`, restricted to the matching origin and 30 minutes. `transfer-review.js` intercepts the first send, shows the complete augmented message, and continues only after the user chooses an action. After approval, it verifies composer insertion before replaying the site's Send action. The Memory Center link and toolbar icon open the same centered overlay on supported chat tabs.

## Permissions and privacy

The extension uses `storage`, `tabs`, `contextMenus`, and `scripting`, with host access for ChatGPT, Claude, Gemini, and the OpenAI API listed in `manifest.json`. The service worker sets local-storage access to trusted extension contexts. Saved conversations and memories stay in the current Chrome profile; there is no sync. If automatic memory is enabled, visible chat messages are sent to OpenAI for extraction. Handoff content reaches a destination chat service only after the user reviews the exact outgoing message and chooses to send it. The user-facing data flow is summarized in [PRIVACY.md](PRIVACY.md).

## Verification status

- `node --test tests/*.test.js` passes mocked save and automatic extraction cases.
- Earlier manual checks exercised ChatGPT capture and Gemini prompt insertion with harmless content. Those checks do not cover every page layout or long conversation.
- The latest saved-conversation dropdown UX has automated coverage but should be checked again in a reloaded extension.
- Claude capture and insertion, Gemini capture, and end-to-end persistence across panel reopen still need live verification.

## Next checks and likely maintenance

1. Run the [product demo](PRODUCT_BRIEF.md#demo-script) in a freshly reloaded extension. Confirm that a newly saved chat appears in the dropdown and survives panel reopen.
2. Exercise capture and reviewed sends on all three services. Check click, Enter, Send with context, Send without context, Cancel, exact composer contents, and the sent chat history. Site DOM changes will most likely require updates in `content.js` or `transfer-review.js`.
3. Test long and partially loaded chats. If capture includes unrelated interface text or misses old turns, improve service selectors and keep the editable review step.
4. Check storage errors and large transcripts in Chrome. The current save flow reports a failed read-back; the app does not provide export or backup.

Use harmless sample content during verification. Do not put real secrets or private conversations into test fixtures or demo data.
