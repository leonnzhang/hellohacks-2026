# Relay Memory: developer handoff

## Current state

This is an unpacked Chrome Manifest V3 extension with no build step. Load the repository directory at `chrome://extensions` using **Developer mode → Load unpacked**. Reload the extension after code changes, then reload already-open chat tabs before retesting site integration.

The main product requirements are in [PRODUCT_BRIEF.md](PRODUCT_BRIEF.md). Keep all persistent user data in `chrome.storage.local`. Do not add a backend or remote database.

## File map

| File | Responsibility |
| --- | --- |
| `manifest.json` | MV3 permissions, supported hosts, service worker, side panel, content script. |
| `background.js` | Opens the side panel from the toolbar action; saves selected text through the context menu. |
| `content.js` | Reads visible chat messages and fills a destination composer. |
| `sidepanel.html`, `sidepanel.css` | Conversation, memory, and handoff interface. |
| `sidepanel.js` | UI state, storage, prompt assembly, tab messaging, and destination flow. |
| `prompts/handoff.json` | Wording for the generated **user** prompt. It is not a model system prompt. |
| `tests/save-conversation.test.js` | Mocked Chrome-storage tests for creating and updating a conversation. |

## Data and flow

`chrome.storage.local` has two persistent keys:

```js
chats: [{ id, title, service, sourceUrl, transcript, createdAt, updatedAt? }]
memories: [{ id, text, project, sourceUrl, createdAt, updatedAt? }]
```

`sidepanel.js` sends `CAPTURE` to the active supported tab. `content.js` extracts role/text pairs using service-specific DOM selectors, then falls back to visible page text when needed. The panel formats the result into an editable, unsaved draft. **Save conversation** creates a new entry; choosing an existing entry changes the action to **Update conversation**. Save writes to `chats`, reads it back, and checks the saved ID and transcript before reporting success.

Memories are explicit user entries: the quick form in Step 2, the Memory tab, or a right-click selection on a supported page. The quick form selects the saved memory for the current handoff. Memories are not inferred or automatically retrieved. The user chooses them with checkboxes.

The preview is assembled from `prompts/handoff.json`, selected memories, the current transcript, and the next request. A transcript over 20,000 characters is shortened in the preview by retaining its beginning and end. **Open & fill** creates a destination tab and sends `INSERT_PROMPT` to its content script. The script locates a composer, inserts text, and checks its content. On an incomplete fill, the panel offers a clipboard fallback. Sending the message remains a user action.

## Permissions and privacy

The extension uses `storage`, `tabs`, `sidePanel`, `contextMenus`, and `scripting`, with host access limited to ChatGPT, Claude, and Gemini domains listed in `manifest.json`. The service worker sets local-storage access to trusted extension contexts. Saved conversations and memories stay in the current Chrome profile; there is no sync. Handoff content reaches a chat service only when the user sends the filled prompt there.

## Verification status

- `node --test tests/save-conversation.test.js` passes the mocked create/update storage cases.
- Earlier manual checks exercised ChatGPT capture and Gemini prompt insertion with harmless content. Those checks do not cover every page layout or long conversation.
- The latest saved-conversation dropdown UX has automated coverage but should be checked again in a reloaded extension.
- Claude capture and insertion, Gemini capture, and end-to-end persistence across panel reopen still need live verification.

## Next checks and likely maintenance

1. Run the [product demo](PRODUCT_BRIEF.md#demo-script) in a freshly reloaded extension. Confirm that a newly saved chat appears in the dropdown and survives panel reopen.
2. Exercise capture and insertion on all three services. Check the captured roles and text, the exact composer contents, and the fallback message. Site DOM changes will most likely require updates in `content.js`.
3. Test long and partially loaded chats. If capture includes unrelated interface text or misses old turns, improve service selectors and keep the editable review step.
4. Check storage errors and large transcripts in Chrome. The current save flow reports a failed read-back; the app does not provide export or backup.

Use harmless sample content during verification. Do not put real secrets or private conversations into test fixtures or demo data.
