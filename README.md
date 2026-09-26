# Relay Memory

A Chrome extension for two connected actions: carry a chat into another AI service, and reuse saved memories across chats. All saved data stays in `chrome.storage.local`. There is no backend, account, remote database, or model API call.

## Install locally

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this directory.
4. Pin **Relay Memory** and click its icon to open the side panel.

## Demo

1. Open a ChatGPT, Claude, or Gemini conversation and click **Capture current tab**. This creates an unsaved draft. Review it, then click **Save conversation** to add a new entry to the saved conversations dropdown. Select an existing entry to edit it with **Update conversation**. If a site's page layout prevents capture, paste the conversation into the editor.
2. In Step 2, type a durable fact and click **Save memory**. It is saved locally and selected for this handoff. You can also select text in the conversation editor and click **Use selected text**, manage memories in the **Memory** tab, or use **Save selection to Relay Memory** from a supported chat page's right-click menu.
3. In **Handoff**, select the conversation and any relevant memories, add the next question, and review the combined prompt.
4. Choose a destination and click **Open & fill**. The extension opens a new chat, fills its composer, and checks the resulting text. Review and send it yourself. If insertion is incomplete, the extension copies the prompt and tells you to replace the composer text by pasting it.

## Design notes

- The extension reads messages currently present in the page DOM. Some services may unload older messages from long chats, so review captured text before handoff.
- Capture can inject its reader into a chat tab that was open before you loaded the extension. If site-specific message selectors fail, it saves visible text from the page's main area for you to review.
- Site layouts change. Capture and composer selectors live in `content.js` and can be updated independently of the saved data.
- The handoff prompt includes up to 20,000 characters of transcript, retaining the beginning and end when a chat is longer. The full edited transcript remains saved locally.
- The reusable handoff wording lives in `prompts/handoff.json`. It is sent as a user prompt; this extension has no model system prompt. Technique templates are not part of the current codebase.
- `chrome.storage.local` belongs to the current Chrome profile; it does not sync saved context to other devices.
