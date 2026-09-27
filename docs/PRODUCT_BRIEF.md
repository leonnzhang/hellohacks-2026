# Relay Memory: product brief

## The idea

People use several AI chat services. When a conversation must move to another service, they have to reconstruct its context by hand. They also repeat durable facts and preferences in every new chat. Relay Memory is a Chrome extension with two adjacent actions:

1. **Conversation handoff:** capture the visible conversation and carry its context into a different chat service.
2. **Shared memory:** automatically save broadly useful core facts when enabled and include a few in each handoff.

The first action preserves the context of a particular conversation. The second preserves facts that remain useful after that conversation ends. Both feed the same destination draft.

## Core user journey

1. Open a conversation on ChatGPT, Claude, or Gemini and click **Transfer** beside the composer.
2. Choose ChatGPT, Claude, or Gemini as the destination. The extension captures visible messages and includes up to three core memories in an editable destination draft.
3. Review and send the context in the destination composer, then write your next request there. If filling fails, copy the prompt and paste it.
4. Open **Memory Center** from the Transfer menu or toolbar icon to review, add, edit, and delete memories. Automatic memory is opt-in and uses a personal API key.

The extension does not reconstruct the destination service's native message history. It gives the new chat an explicit context prompt.

## Hackathon success criteria

- The inline Transfer menu captures visible chat messages and opens an editable destination draft.
- A memory can be saved automatically or manually, edited, deleted, picked for a handoff, and reused with a different conversation.
- Memory Center shows saved facts and source quotes, plus manual and automatic memory controls.
- A handoff opens the chosen service with an intact draft or gives a clear copy-and-paste fallback.
- Saved data persists in the same Chrome profile without a backend, remote database, or account. Automatic extraction uses the user-supplied OpenAI API key when enabled.
- The user can inspect the content before it is sent to an AI service.

## Scope and boundaries

**In scope now:** inline capture, opt-in automatic memory from newly visited chats, manual memory management, automatic memory picking, prompt assembly, and composer filling or clipboard fallback for the three services.

**Outside the current build:** semantic search, automatic sending, native chat-history import, cross-device sync, and server storage. Running out of tokens is a motivating use case, but the extension does not detect token limits or switch services automatically.

The capture reads messages currently present in the page. Long chats may have unloaded earlier messages; users should review the destination draft. Prompt assembly limits the included transcript to 20,000 characters and keeps the beginning and end.

## Demo script

Use a short harmless conversation with a core preference such as “Please keep answers concise.” Open Memory Center from the inline Transfer menu and inspect the saved preference and its source quote. Choose another service from Transfer, inspect the filled draft, then send it manually. Demonstrate the clipboard fallback if that site's composer does not accept insertion.
