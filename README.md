# Relay

A Chrome extension for carrying chats and relevant saved context between AI services. Conversations and memories stay in `chrome.storage.local`; the optional semantic search index stays in local IndexedDB. There is no backend, account, or remote database. Optional automatic memory and semantic search send content to the OpenAI API only when enabled.

## Project docs

- [Core ideas](docs/CORE_IDEAS.md): the intended split between immediate transfer drafts and core memories checked on Send.
- [Product brief](docs/PRODUCT_BRIEF.md): objectives, user journeys, scope, and demo success criteria.
- [Demo guide](docs/DEMO_GUIDE.md): full setup, synthetic seed memories, sample retrieval questions, and a repeatable walkthrough.
- [Developer handoff](docs/DEVELOPER_HANDOFF.md): architecture, data flow, verification status, and next steps.
- [Automatic memory plan](docs/AUTO_MEMORY_PLAN.md): opt-in flow, privacy choices, limits, and verification.
- [Core memory template](docs/MEMORY_TEMPLATE.md): the seven allowed categories, examples, exclusions, storage, and handoff rules.
- [UI direction](docs/UI_DIRECTION.md): the chat-native transfer button, quick flow, and shared styling with Memory Center.
- [Privacy notice](docs/PRIVACY.md): what stays in Chrome and when chat text is sent to another service.

## Install locally

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this directory.
4. Pin **Relay**. On a supported chat tab, click its icon to open Memory Center in the page.

## Demo

For a complete rehearsal, including a clean-profile setup, copy-ready synthetic memories, and suggested narration, see the [demo guide](docs/DEMO_GUIDE.md).

1. Open a ChatGPT, Claude, or Gemini conversation and click **Transfer** beside the composer.
2. Choose a destination. Relay opens a new chat and immediately inserts the captured conversation into its composer. Review or edit it, then add your request after `CURRENT REQUEST`.
3. Click **Send**. Relay checks core memories against your request at that moment and adds eligible context to the outgoing message.
4. Open **Memory Center** from the Transfer menu or extension icon. Use the left sidebar to see an overview, manage saved memories, review memory rules, and read Privacy & data. You can also save selected text with the page's right-click menu.
5. To enable automatic memory or semantic search, open **Privacy & data**, save your own OpenAI API key under **OpenAI connection**, and turn on **Automatic memory** or **Context search**. Each switch saves immediately. Semantic search embeds saved conversations and eligible memories, then retrieves relevant context when you send. Text and vectors stay in this browser; queries are sent to OpenAI for embeddings.

For an auto-save demo, state a lasting fact or preference in a supported chat, wait for the assistant's reply, then watch for the on-page saved-memory notification. Relay checks later turns in the same conversation too. One-time requests and facts already saved may produce no new memory.

The **Memory Center** link and toolbar icon open the same centered overlay on supported chat tabs. Transfer stays beside the chat composer.

## Design notes

- The extension reads messages currently present in the page DOM. Some services may unload older messages from long chats, so review captured text before handoff.
- Capture can inject its reader into a chat tab that was open before you loaded the extension. If site-specific message selectors fail, it saves visible text from the page's main area for you to review.
- Site layouts change. Capture and composer selectors live in `content.js` and can be updated independently of the saved data.
- The handoff prompt includes up to 20,000 characters of transcript, retaining the beginning and end when a chat is longer. The full edited transcript remains saved locally.
- Pending transfer context is kept for one tab in `chrome.storage.session` for up to 30 minutes. It appears in the destination composer immediately and is removed after the first successful send or when the tab closes. Core memories are checked on Send. The combined message appears in the destination chat history.
- The reusable handoff wording lives in `prompts/handoff.json`. It is sent as a user prompt; this extension has no model system prompt. Technique templates are not part of the current codebase.
- `chrome.storage.local` belongs to the current Chrome profile; it does not sync saved context to other devices.
- Automatic memory is off by default. When it saves a fact, a small notification shows the fact, its source quote, and why it may help later. A bar drains from right to left during the 10-second Undo window. The extension reads only messages currently rendered on newly visited supported chats and sends those messages to OpenAI after the chat settles. It makes another request if that conversation changes later. The user-supplied key is stored locally; do not bundle a shared key in this extension.
- Semantic search is off by default. When enabled, saved conversation and eligible memory text is sent to OpenAI to create embeddings; the index and searchable text remain in local IndexedDB. Disabling search clears the index.
