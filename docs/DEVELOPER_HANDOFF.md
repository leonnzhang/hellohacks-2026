# Relay developer handoff

## Run locally

Unpacked Chrome Manifest V3 extension, minimum Chrome 116, no build step. Load the repository at `chrome://extensions`. Reload the extension after changes, then reload existing chat pages. Do not confuse an older injected content script with the current files.

[Features](FEATURES.md) describes visible UI; [Core ideas](CORE_IDEAS.md) is the interaction contract; [Demo guide](DEMO_GUIDE.md) has rehearsal cases. There is no backend or Relay account.

## File map

| File | Responsibility |
| --- | --- |
| `manifest.json` | Hosts, permissions, content-script order, toolbar action, service worker |
| `background.js` | Transfer tab creation/session lifecycle, one-time send claims, extraction, memory writes, search coordination, toolbar/right-click actions |
| `content.js` | Service-specific capture, composer-anchored Transfer menu, Memory Center iframe, theme detection, notification stack, auto-memory scheduling/Undo |
| `transfer-context.js` | Destination composer insertion, automatic continuation, first-send interception, retrieval, send verification and fallback |
| `transfer-core.js` | Eligibility, transcript formatting, bounded context and outgoing prompt assembly/parsing |
| `memory-policy.js` | Seven automatic categories, reasons, exclusions, extraction instructions |
| `rag-core.js` | Chunking, OpenAI embeddings, local IndexedDB synchronization, cosine ranking |
| `sidepanel.html`, `sidepanel.css`, `sidepanel.js`, `theme-init.js` | Memory Center UI and state; legacy hidden Handoff editor |
| `prompts/handoff.json` | Handoff wording sent as a user message, not a system prompt |
| `tests/*.test.js` | Node tests using mocked Chrome APIs/DOM and deterministic fixtures |

## Storage

| Location | Records |
| --- | --- |
| `chrome.storage.local` | `memories`, legacy `chats` and `memorySuggestions`; `autoMemorySettings: { enabled, apiKey }`; `autoMemoryProcessed`, `memoryDeletionEpoch`, `autoMemoryLastError`; `ragEnabled`, `ragLastError`, `ragChunkCount` |
| `chrome.storage.session` | `pendingTransfer:<tabId>` containing ID, prompt, continuation request, origin, creation time, `autoContinue`, `autoAttempted` |
| IndexedDB `relay-memory-rag` | Searchable text chunks, vectors, source metadata/hashes |

Memory records include ID/text, scope, origin, optional category, source URL/title/quote, and timestamps. Automatic records use `scope: "global"` and `origin: "automatic"`. Manual editing converts old/noncore records to manual core memory. Session entries expire after 30 minutes and are removed when the destination tab closes. Local storage access is restricted to trusted extension contexts.

## Transfer lifecycle

1. `content.js` captures role-labelled visible messages. Inline transfer rejects broad page-text capture.
2. `INLINE_TRANSFER` validates source/destination and caps individual message text at 12,000 characters. `transfer-core.js` bounds the transcript to 20,000 characters plus an omission marker, retaining head and tail.
3. The worker chooses the continuation request from the final message role: answer the final user message, or acknowledge an already answered conversation.
4. Create an inactive tab, write its pending entry, then navigate/activate it. Storing before navigation avoids a first-load race.
5. `transfer-context.js` loads pending context and core memories, inserts a complete draft into a suitable composer, and preserves unrelated drafts. It skips automatic preparation in an existing conversation.
6. `CLAIM_TRANSFER_SEND` serializes claims and persists `autoAttempted` before an automatic attempt. Refresh/reload cannot acquire another automatic claim.
7. Retrieve context, assemble the outgoing message, verify inserted content and absence of user edits, then use the site’s enabled Send button. Automatic sending waits briefly for the button to become available.
8. Clear pending context only after the composer clears and a message or navigation is observed. Otherwise retain the draft and manual-send guidance. Later messages in an established conversation pass through normally.

The extension sends one context message, not native history. A claim means “automatic attempt reserved,” not “delivered.” Do not add blind automatic retries after clicking Send. Existing pending entries without `autoContinue` retain the older manual flow for compatibility.

Manual click/Enter interception still supports first-send memory context. `replaying` prevents the synthetic Send click from recursively intercepting itself. Snapshot checks prevent sending a message changed while retrieval was running.

## Memory and search

Manual entry and selected-text saving need no API. Automatic extraction needs an explicitly enabled switch and saved key. Current extraction model: `gpt-6-luna`; embeddings: `text-embedding-3-small`. These are code configuration values, not promises about future model availability.

Automatic scans use role-labelled messages, normalized snapshots and duplicate validation. User text from Relay-augmented messages is stripped back to the current request so transferred history is not mined again as new user evidence. Successful saves include source provenance and trigger a 10-second Undo notice. See [Automatic memory](AUTO_MEMORY_PLAN.md) for timing and limits.

Search indexes eligible memories and existing saved conversations. Text/vectors remain in IndexedDB, but text and queries are sent to OpenAI for embeddings. Local changes queue synchronization; disabling search clears the index. A successful retrieval may return no matches. Disabled, empty, or failed search falls back to all eligible core memories.

Automatic continuation currently queries retrieval with its generated continuation request. Improving relevance with a source-specific query is a known opportunity; do not describe current transfer retrieval as transcript-aware semantic matching.

## Current versus legacy UI

The visible product has Transfer plus four Memory Center sections. The Handoff view is hidden in `sidepanel.html`; its conversation capture/save/update/delete, preview, copy, and Open & fill handlers remain in code and have some tests. Existing `chats` records remain searchable, but inline transfer does not write a full transcript archive. Do not document hidden controls as available navigation.

## Verification

Run:

```sh
node --test tests/*.test.js
node --check background.js
node --check content.js
node --check transfer-context.js
node --check sidepanel.js
git diff --check
```

Current suite: **40 passing tests**. Coverage includes prompt boundaries, eligibility, storage CRUD, opt-in settings, auto-memory validation/retry/Undo, transfer arming, serialized send claims, successful automatic sends, missing/ignored Send, refresh without resend, existing drafts/conversations, user edits during a claim, manual Send interception, and later-message pass-through.

Live evidence: synthetic ChatGPT → ChatGPT and ChatGPT → Gemini automatic continuation both sent and received brief acknowledgments. Earlier checks covered ChatGPT memory extraction/Undo, deduplication, manual CRUD, retrieval, light/dark mode, notification dismissal, and narrow navigation. Automated fixtures do not prove current provider DOM compatibility.

Remaining live checks: new automatic-send flow in Claude; Claude/Gemini source capture; all source/destination pairs; unanswered/streaming source cases; long/virtualized transcripts; blocked/auth-gated destinations; contenteditable manual fallback and reload timing. The hidden legacy editor has automated coverage, not a current full UI rehearsal.

## Maintenance priorities

- Keep user-visible copy aligned with automatic destination sending and one-time fallback behavior.
- Maintain source selectors in `content.js` and composer/send selectors in `transfer-context.js` as provider pages change.
- Test real editor acceptance: an attempted click or inserted DOM text alone is not send confirmation.
- Improve continuation retrieval specificity and assess streaming/incomplete assistant captures.
- Test storage/quota errors and large histories. There is no export/backup UI.

Use synthetic data; never commit keys or personal conversation fixtures. See [Privacy](PRIVACY.md) for current external data flows.
