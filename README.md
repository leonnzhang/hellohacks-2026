# Relay Memory

A Chrome extension for two connected actions: carry a chat into another AI service, and reuse saved memories across chats. Saved data stays in `chrome.storage.local`. There is no backend, account, or remote database. Optional automatic memory sends newly visited chats to the OpenAI API when enabled.

## Project docs

- [Product brief](docs/PRODUCT_BRIEF.md): objectives, user journeys, scope, and demo success criteria.
- [Developer handoff](docs/DEVELOPER_HANDOFF.md): architecture, data flow, verification status, and next steps.
- [Automatic memory plan](docs/AUTO_MEMORY_PLAN.md): opt-in flow, privacy choices, limits, and verification.
- [Core memory template](docs/MEMORY_TEMPLATE.md): the seven allowed categories, examples, exclusions, storage, and handoff rules.
- [UI direction](docs/UI_DIRECTION.md): the chat-native transfer button, quick flow, and shared styling with Memory Center.

## Install locally

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this directory.
4. Pin **Relay Memory** and click its icon to open the side panel.

## Demo

1. Open a ChatGPT, Claude, or Gemini conversation and click **Capture current tab**. This creates an unsaved draft. Review it, then click **Save conversation** to add a new entry to the saved conversations dropdown. Select an existing entry to edit it with **Update conversation**. If a site's page layout prevents capture, paste the conversation into the editor.
2. In **Memory**, enter your own OpenAI API key and enable automatic memory. Visit a supported chat and wait for it to settle. Core facts grounded in your messages are saved automatically; inspect, edit, or delete them in the Memory tab. You can also save a core fact manually or use **Save selection as core memory** from a supported page's right-click menu.
3. In **Handoff**, select the conversation, add the next question, and inspect the combined prompt. Up to three core memories are included automatically. Older noncore records stay visible for review but are excluded.
4. Choose a destination and click **Open & fill**. The extension opens a new chat, fills its composer, and checks the resulting text. Review and send it yourself. If insertion is incomplete, the extension copies the prompt and tells you to replace the composer text by pasting it.

On supported chat pages, a small **Transfer** button also appears beside the composer. It opens a compact destination menu and prepares a draft directly from visible, role-labelled messages. The **Memory Center** link opens the side panel for memory review and controls. The inline control and side panel follow the active chat's font and colors.

## Design notes

- The extension reads messages currently present in the page DOM. Some services may unload older messages from long chats, so review captured text before handoff.
- Capture can inject its reader into a chat tab that was open before you loaded the extension. If site-specific message selectors fail, it saves visible text from the page's main area for you to review.
- Site layouts change. Capture and composer selectors live in `content.js` and can be updated independently of the saved data.
- The handoff prompt includes up to 20,000 characters of transcript, retaining the beginning and end when a chat is longer. The full edited transcript remains saved locally.
- The reusable handoff wording lives in `prompts/handoff.json`. It is sent as a user prompt; this extension has no model system prompt. Technique templates are not part of the current codebase.
- `chrome.storage.local` belongs to the current Chrome profile; it does not sync saved context to other devices.
- Automatic memory is off by default. The extension reads only messages currently rendered on newly visited supported chats and sends those messages to OpenAI after the chat settles. It makes another request if that conversation changes later. The user-supplied key is stored locally; do not bundle a shared key in this extension.
