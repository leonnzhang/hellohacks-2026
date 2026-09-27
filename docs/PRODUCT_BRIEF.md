# Relay: product brief

## The idea

People use several AI chat services. When a conversation must move to another service, they have to reconstruct its context by hand. They also repeat durable facts and preferences in every new chat. Relay is a Chrome extension with two adjacent actions:

1. **Conversation handoff:** capture the visible conversation and carry its context into a different chat service.
2. **Shared memory:** automatically save broadly useful core facts when enabled and check them when the user clicks Send.
3. **Semantic search:** optionally find relevant excerpts from saved conversations and memories, using a local vector index.

The first action preserves the context of a particular conversation and makes it visible in the destination composer immediately. The second preserves facts that remain useful after that conversation ends and is evaluated when the user sends. [Core ideas](CORE_IDEAS.md) is the interaction contract.

## Core user journey

1. Open a conversation on ChatGPT, Claude, or Gemini and click **Transfer** beside the composer.
2. Choose ChatGPT, Claude, or Gemini as the destination. Relay captures visible messages and inserts the transfer context into the new chat composer immediately, ending with a blank `CURRENT REQUEST` section.
3. Review or edit the transfer draft and write the next request. Clicking Send checks eligible core memories against that request, adds the selected memories, and sends the combined message.
4. Open **Memory Center** from the Transfer menu or toolbar icon to review, add, edit, and delete memories. Automatic memory and semantic search are opt-in and use a personal API key.

The extension does not reconstruct the destination service's native message history. The first message includes an explicit context section that appears in the destination chat history.

## Hackathon success criteria

- The inline Transfer menu captures visible chat messages and inserts an editable draft into the destination composer before Send.
- A memory can be saved automatically or manually, edited, deleted, picked for a handoff, and reused with a different conversation.
- Memory Center shows saved facts and source quotes, plus manual and automatic memory controls.
- A handoff makes transfer context visible before Send; core memories are considered only when Send is clicked.
- Saved data persists in the same Chrome profile without a backend, remote database, or account. Automatic extraction uses the user-supplied OpenAI API key when enabled.
- Semantic search keeps searchable text and vectors in local IndexedDB; it sends saved text and each query to OpenAI only when enabled.
- The user can inspect the content before it is sent to an AI service.

## Scope and boundaries

**In scope now:** inline capture, immediate transfer draft insertion, opt-in automatic memory from newly visited chats, manual memory management, memory selection on Send, opt-in local semantic search, and prompt assembly for the three services.

**Outside the current build:** native chat-history import, cross-device sync, and server storage. Running out of tokens is a motivating use case, but the extension does not detect token limits or switch services automatically.

The capture reads messages currently present in the page. Long chats may have unloaded earlier messages; users should review the outgoing message. Prompt assembly limits the included transcript to 20,000 characters and keeps the beginning and end.

## Demo script

Use a short harmless conversation with a core preference such as “Please keep answers concise.” Open Memory Center from the inline Transfer menu and inspect the saved preference and its source quote. Choose another service from Transfer and show that the conversation appears in the new composer before sending. Type a request after `CURRENT REQUEST`, then send and show that memory was added at that click. Demonstrate the auto-saved memory notification and Undo action.
