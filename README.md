# Relay

Carry a conversation between ChatGPT, Claude, and Gemini, and keep useful personal context across chats. Relay is a Chrome Manifest V3 extension with no build step, Relay account, backend, or cross-device sync.

**Choose a service → bring the conversation → continue automatically.** No extra prompt is required.

## Features

- **One-click continuation:** a compact, non-scrolling Transfer selector beside the composer opens a fresh destination chat, inserts the conversation, and sends a continuation request automatically. The menu offers the other two services.
- **Useful continuation:** answer the last user message if it is unanswered; otherwise briefly acknowledge the imported context and invite the next message.
- **Recoverable sending:** automatic sending is attempted once. A failed attempt leaves a prepared draft for manual Send. Existing drafts and user edits are preserved.
- **Memory Center:** Overview, Saved memories, Memory rules, and Privacy & data in a centered overlay. Open it from Transfer or the pinned extension icon on a supported chat.
- **Manual memory:** add, edit, delete, or save selected text from the right-click menu.
- **Optional automatic memory:** save durable user facts with a source quote and category explanation. A notification offers a 10-second Undo window.
- **Optional context search:** find relevant saved context through local vector search. Preview matches with **Overview → Try a question**.
- **Consistent appearance:** light/dark styling follows the chat, with shared colors and an upper-right notification stack.

See the [feature guide](docs/FEATURES.md) for controls, requirements, edge cases, and limitations.

## Install and try

1. Open `chrome://extensions` in Chrome 116 or newer; enable **Developer mode**.
2. Choose **Load unpacked** and select this repository directory. Pin **Relay**.
3. Open a supported chat and start a short conversation.
4. Click **Transfer**, then a service under **Continue conversation in…**. Selecting it sends the captured context to that service automatically.
5. Open **Memory Center → Saved memories** to add a reusable preference.

Transfer and manual memory work without an OpenAI API key. Chat services retain their own login and access requirements.

For automatic memory or context search, open **Privacy & data → OpenAI connection**, enter your own key, and click **Save key**. Enable **Automatic memory** and/or **Context search** separately. Use **Save changes** to apply the key and checkbox settings. The Overview **Pause saving / Turn on** button applies immediately. API charges may apply.

After changing extension code, reload Relay in `chrome://extensions`, then reload existing chat tabs.

## Data and limits

Memories, settings, and any legacy saved conversations live in this Chrome profile’s `chrome.storage.local`. The optional search index lives in IndexedDB. Automatic memory sends visible chat text to OpenAI for extraction; context search sends saved text and queries for embeddings. Selecting a transfer destination sends captured conversation context and selected memories to that chat service. See [Privacy](docs/PRIVACY.md).

Relay transfers context as one message, not native historical chat turns. It reads messages present in the page DOM; unloaded history is unavailable. Inline transfer caps each message at 12,000 characters and bounds the assembled transcript to 20,000 characters, retaining its beginning and end plus an omission marker. It does not save a full local conversation archive during transfer.

With context search off, unavailable, or empty, sending falls back to all eligible core memories. A successful search can return no matches. Automatic continuation searches using recent user messages from the source conversation.

## Documentation

| Guide | Contents |
| --- | --- |
| [Features](docs/FEATURES.md) | Full current app walkthrough and troubleshooting |
| [Demo guide](docs/DEMO_GUIDE.md) | Setup, synthetic data, demo cases, expected results, rehearsal checklist |
| [Product brief](docs/PRODUCT_BRIEF.md) | Product purpose, scope, and acceptance criteria |
| [Core ideas](docs/CORE_IDEAS.md) | Transfer and memory interaction contract |
| [Developer handoff](docs/DEVELOPER_HANDOFF.md) | Architecture, storage, tests, and known gaps |
| [Automatic memory](docs/AUTO_MEMORY_PLAN.md) | Current extraction timing, validation, Undo, and retry behavior |
| [Memory template](docs/MEMORY_TEMPLATE.md) | Seven automatic-memory categories and eligibility rules |
| [UI direction](docs/UI_DIRECTION.md) | Styling and notification behavior |
| [Privacy](docs/PRIVACY.md) | Storage and external data flows |

## Verification

Run `node --test tests/*.test.js` with Node.js. The suite covers transfer, memory, settings, and layout behavior. Live synthetic continuation has been verified into ChatGPT and Gemini; the new automatic-send flow still needs a live Claude check. See the [developer handoff](docs/DEVELOPER_HANDOFF.md#verification) for the scope of that evidence.

### Memory inclusion

**Privacy & data → Include saved memories in chats** controls whether Relay adds saved context. It defaults to on and works without an API key. When semantic search is off, lacks a key, has no index, or fails, Relay includes all eligible core memories. A successful search includes only its matches, which may be empty. Turn memory inclusion off and save changes to transfer only the conversation and omit saved context from new chats. Pausing automatic saving stops new memory extraction; it does not disable inclusion or delete existing memories.
