# Relay privacy notice

Relay is a Chrome extension for transferring chat context and keeping reusable memories. This notice describes the current code in this repository.

## Data kept in Chrome

The extension stores saved memories, saved conversations, settings, and a user-supplied OpenAI API key in `chrome.storage.local` in the current Chrome profile. When semantic search is enabled, searchable text and its vectors are stored in local IndexedDB. The extension has no Relay account, sync service, or server database.

You can edit or delete memories and remove the API key in Memory Center. The legacy saved-conversation editor is hidden in the current UI; existing saved-conversation records can still be indexed. There is no export/backup or bulk data-management UI. Removing a memory from Relay does not delete messages already sent to a chat service. Turning semantic search off clears its local index; removing the API key disables both API features.

## When chat text leaves your browser

Automatic saving and semantic search are off by default. If you enable automatic saving and supply an OpenAI API key, the extension sends messages currently visible in supported ChatGPT, Claude, and Gemini chats to the OpenAI API to extract lasting facts. The request sets `store: false`; this does not assert that the provider has no other retention. The extension checks suggested facts against allowed categories and quotes from your own messages before saving them. This process may still save an incorrect fact; an on-page notification offers Undo for 10 seconds after the memory has been saved, and you can review, edit, or delete the fact later in Memory Center. The allowed categories include a minimal, enduring allergy or accessibility need you explicitly state.

If you enable semantic search, saved conversation text and eligible memories are sent to OpenAI's embeddings API when the local index is built or updated. A query is sent for an embedding when Relay retrieves context. The searchable text and vectors remain in local IndexedDB. Disabling search deletes this index.

A transfer opens a new chat, keeps the captured conversation in that tab's extension session storage for up to 30 minutes, and inserts it into the destination composer immediately. Choosing a destination sends the conversation there automatically with a continuation request. Relay checks eligible core memories and, when search is enabled, relevant saved chat excerpts against that request before sending. If automatic sending fails, the draft remains for manual Send. The destination site may save or sync drafts according to its own behavior. The combined message appears in the destination chat history. Transfer does not create a full local conversation archive.

## Access

The extension requests access to supported chat sites, the OpenAI API, Chrome local storage, tabs, scripting, and the right-click selection menu. It uses those permissions for capture, optional extraction, memory management, and transfer. See `manifest.json` for the exact host patterns and permissions.

This notice describes the implementation; it does not claim certification or legal compliance. Review it before publishing the extension.
