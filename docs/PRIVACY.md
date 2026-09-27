# Relay Memory privacy notice

Relay Memory is a Chrome extension for transferring chat context and keeping reusable memories. This notice describes the current code in this repository.

## Data kept in Chrome

The extension stores saved memories, their source quotes when available, your automatic-saving setting, and a user-supplied OpenAI API key in `chrome.storage.local` in the current Chrome profile. Older versions may also have saved conversations and pending memory suggestions there. The extension has no Relay Memory account, sync service, or server database.

You can edit or delete memories in Memory Center and remove the API key there. Removing a memory from Relay Memory does not delete messages already sent to a chat service.

## When chat text leaves your browser

Automatic saving is off by default. If you enable it and supply an OpenAI API key, the extension sends messages currently visible in supported ChatGPT, Claude, and Gemini chats to the OpenAI API to extract lasting facts. The request sets `store: false`. The extension checks suggested facts against allowed categories and quotes from your own messages before saving them. This process may still save an incorrect fact; you can review, edit, or delete it in Memory Center. The allowed categories include a minimal, enduring allergy or accessibility need you explicitly state.

A transfer opens a new chat with an editable draft containing the captured conversation and up to three eligible memories. The extension does not send that draft for you. It reaches the destination chat service when you choose to send it there.

## Access

The extension requests access to supported chat sites, the OpenAI API, Chrome local storage, tabs, scripting, and the right-click selection menu. It uses those permissions for capture, optional extraction, memory management, and transfer. See `manifest.json` for the exact host patterns and permissions.

This notice describes the implementation; it does not claim certification or legal compliance. Review it before publishing the extension.
