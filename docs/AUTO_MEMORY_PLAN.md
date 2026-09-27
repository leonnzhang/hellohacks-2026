# Automatic memory plan

## Goal

When a user opts in, inspect newly visited ChatGPT, Claude, and Gemini conversations and save durable facts automatically. Pick relevant memories automatically for a handoff. Keep editing and deletion in the Memory tab, with the exact user quote available for audit.

The seven core categories, examples, exclusions, storage fields, and handoff rules are documented in [MEMORY_TEMPLATE.md](MEMORY_TEMPLATE.md). The application reads the canonical definitions from [`memory-policy.js`](../memory-policy.js).

## Flow

1. The content script waits for a supported chat page to settle, then sends its visible role-labelled messages to the extension service worker. It never uses the broad page-text fallback for automatic extraction.
2. The worker ignores an unchanged conversation snapshot. With the toggle enabled and an API key configured, it sends the snapshot to a small OpenAI model once. The request asks for at most three atomic core facts from the fixed category template, each grounded in an exact user-message quote. Assistant messages are context, not evidence.
3. The worker validates the core category, checks each quote against a user message, applies deterministic exclusions, removes duplicates, and saves qualifying facts directly in local memory with source URL, quote, and timestamp.
4. The Memory tab shows the category policy and each auto-saved fact with its category explanation and source quote. The user can edit or delete facts. Older pending suggestions from the previous version remain visible there until resolved.
5. A send can include all eligible separately selected core memories. Older noncore and unscoped records, plus automatic memories in retired categories, are excluded until the user edits and saves them as core. It shows the count and full prompt for inspection, without a memory-picking step.

## Data and privacy

- The feature is off by default. The toggle explains that chat text goes to OpenAI when enabled. Existing saved chats are not scanned in bulk. The template permits minimal, enduring allergy or accessibility needs, so the settings text also discloses that these may be saved and included in handoffs.
- The API key is supplied by the user and stored in `chrome.storage.local`, restricted to trusted extension contexts. This is suitable for a personal prototype. A public release needs a small server proxy, user accounts, spend limits, and a more thorough privacy review; a shared key must not be bundled in the extension.
- The request uses `store: false`. Provider abuse-monitoring retention still applies under its terms. The extension stores memories and snapshot fingerprints locally, not a second copy of each automatically read transcript.
- Turning the toggle off stops future requests. Removing the key prevents further processing. Already saved memories remain until deleted.

## Limits and follow-up

- Only messages currently rendered in newly visited supported tabs can be read. Service page changes may break capture, and older unloaded turns are unavailable.
- A settled page can change again later, so a conversation may incur another request after new messages arrive. Fingerprints prevent repeat calls for the same snapshot.
- Model output can be wrong even with source checks. The Memory tab exposes provenance and deletion, and the handoff context has a read-only preview. Evaluate quality with harmless example conversations, including jokes, corrections, temporary facts, and sensitive details.
- Facts tied to one task are intentionally excluded from core memory. The extension does not try to infer that they apply everywhere.

## Verification

- Unit test extraction validation, duplicate handling, opt-in gating, snapshot fingerprints, and local memory picking with a mocked API.
- Reload the unpacked extension and test opt-in, automatic saving, handoff selection, editing, deletion, and disabling on each supported service with harmless chats.
