# Relay Memory

A Chrome extension for two connected actions: carry a chat into another AI service, and reuse saved memories across chats. Saved data stays in `chrome.storage.local`. There is no backend, account, or remote database. Optional automatic memory sends newly visited chats to the OpenAI API when enabled.

## Project docs

- [Product brief](docs/PRODUCT_BRIEF.md): objectives, user journeys, scope, and demo success criteria.
- [Developer handoff](docs/DEVELOPER_HANDOFF.md): architecture, data flow, verification status, and next steps.
- [Automatic memory plan](docs/AUTO_MEMORY_PLAN.md): opt-in flow, privacy choices, limits, and verification.
- [Core memory template](docs/MEMORY_TEMPLATE.md): the seven allowed categories, examples, exclusions, storage, and handoff rules.
- [UI direction](docs/UI_DIRECTION.md): the chat-native transfer button, quick flow, and shared styling with Memory Center.
- [Privacy notice](docs/PRIVACY.md): what stays in Chrome and when chat text is sent to another service.

## Install locally

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this directory.
4. Pin **Relay Memory**. On a supported chat tab, click its icon to open Memory Center in the page.

## Demo

1. Open a ChatGPT, Claude, or Gemini conversation and click **Transfer** beside the composer.
2. Choose a destination. The extension opens a new chat with an editable context draft, including up to three core memories. Review and send it, then write your next message.
3. Open **Memory Center** from the Transfer menu or extension icon. Use the left sidebar to see an overview, manage saved memories, review memory rules, and read Privacy & data. You can also save selected text with the page's right-click menu.
4. To enable automatic memory, open **Privacy & data**, enter your own OpenAI API key, and turn on automatic saving. Core facts grounded in your messages are saved as supported chats settle.

The **Memory Center** link and toolbar icon open the same centered overlay on supported chat tabs. Transfer stays beside the chat composer.

## Design notes

- The extension reads messages currently present in the page DOM. Some services may unload older messages from long chats, so review captured text before handoff.
- Capture can inject its reader into a chat tab that was open before you loaded the extension. If site-specific message selectors fail, it saves visible text from the page's main area for you to review.
- Site layouts change. Capture and composer selectors live in `content.js` and can be updated independently of the saved data.
- The handoff prompt includes up to 20,000 characters of transcript, retaining the beginning and end when a chat is longer. The full edited transcript remains saved locally.
- The reusable handoff wording lives in `prompts/handoff.json`. It is sent as a user prompt; this extension has no model system prompt. Technique templates are not part of the current codebase.
- `chrome.storage.local` belongs to the current Chrome profile; it does not sync saved context to other devices.
- Automatic memory is off by default. The extension reads only messages currently rendered on newly visited supported chats and sends those messages to OpenAI after the chat settles. It makes another request if that conversation changes later. The user-supplied key is stored locally; do not bundle a shared key in this extension.
