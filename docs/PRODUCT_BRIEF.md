# Relay Memory: product brief

## The idea

People use several AI chat services. When a conversation must move to another service, they have to reconstruct its context by hand. They also repeat durable facts and preferences in every new chat. Relay Memory is a Chrome extension with two adjacent actions:

1. **Conversation handoff:** capture the visible conversation and carry its context into a different chat service.
2. **Shared memory:** automatically save broadly useful core facts when enabled and include a few in each handoff.
3. **Semantic search:** optionally find relevant excerpts from saved conversations and memories, using a local vector index.

The first action preserves the context of a particular conversation. The second preserves facts that remain useful after that conversation ends. Both can feed the destination's first outgoing message.

## Core user journey

1. Open a conversation on ChatGPT, Claude, or Gemini and click **Transfer** beside the composer.
2. Choose ChatGPT, Claude, or Gemini as the destination. The extension captures visible messages and prepares the captured conversation for the destination tab; up to seven core memories can be selected separately.
3. Write the next request in the destination chat. On send, review the exact combined message and choose whether to send with context, send without context, or cancel.
4. Open **Memory Center** from the Transfer menu or toolbar icon to review, add, edit, and delete memories. Automatic memory and semantic search are opt-in and use a personal API key.

The extension does not reconstruct the destination service's native message history. The reviewed first message includes an explicit context section that appears in the destination chat history.

## Hackathon success criteria

- The inline Transfer menu captures visible chat messages and opens a destination chat ready for the user's next request.
- A memory can be saved automatically or manually, edited, deleted, picked for a handoff, and reused with a different conversation.
- Memory Center shows saved facts and source quotes, plus manual and automatic memory controls.
- A handoff shows the exact combined outgoing message before the user approves sending it.
- Saved data persists in the same Chrome profile without a backend, remote database, or account. Automatic extraction uses the user-supplied OpenAI API key when enabled.
- Semantic search keeps searchable text and vectors in local IndexedDB; it sends saved text and each query to OpenAI only when enabled.
- The user can inspect the content before it is sent to an AI service.

## Scope and boundaries

**In scope now:** inline capture, opt-in automatic memory from newly visited chats, manual memory management, automatic memory picking, opt-in local semantic search, prompt assembly, and reviewed send-time injection for the three services.

**Outside the current build:** native chat-history import, cross-device sync, and server storage. Running out of tokens is a motivating use case, but the extension does not detect token limits or switch services automatically.

The capture reads messages currently present in the page. Long chats may have unloaded earlier messages; users should review the outgoing message. Prompt assembly limits the included transcript to 20,000 characters and keeps the beginning and end.

## Demo script

Use a short harmless conversation with a core preference such as “Please keep answers concise.” Open Memory Center from the inline Transfer menu and inspect the saved preference and its source quote. Choose another service from Transfer, type a new request, and inspect the review before choosing Send with context. Demonstrate Send without context and Cancel as alternatives.
