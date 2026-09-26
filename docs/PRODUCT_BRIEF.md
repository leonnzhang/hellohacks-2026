# Relay Memory: product brief

## The idea

People use several AI chat services. When a conversation must move to another service, they have to reconstruct its context by hand. They also repeat durable facts and preferences in every new chat. Relay Memory is a Chrome extension with two adjacent actions:

1. **Conversation handoff:** capture a conversation, review and save it, then carry its context and a new request into a different chat service.
2. **Shared memory:** automatically save broadly useful core facts when enabled and include a few in each handoff.

The first action preserves the context of a particular conversation. The second preserves facts that remain useful after that conversation ends. Both feed the same prompt preview.

## Core user journey

1. Open a conversation on ChatGPT, Claude, or Gemini and open the extension side panel.
2. Click **Capture current tab**. Review and edit the captured transcript. Click **Save conversation**; it should appear in the saved conversations dropdown and remain available when the panel reopens. A user can also paste a transcript manually.
3. Enable automatic core memory in the Memory tab with a personal API key, or save a broadly useful fact manually. Up to three core memories appear automatically in the prompt preview alongside the conversation.
4. Enter the next request, choose ChatGPT, Claude, or Gemini, and click **Open & fill**.
5. Review the draft in the destination composer and send it manually. If filling fails, copy the prompt and paste it.

The extension does not reconstruct the destination service's native message history. It gives the new chat an explicit context prompt.

## Hackathon success criteria

- A captured, reviewed conversation can be saved, found in the dropdown, reopened, edited, and deleted.
- A memory can be saved automatically or manually, edited, deleted, picked for a handoff, and reused with a different conversation.
- The preview clearly contains the picked memories, the conversation context, and the next request.
- A handoff opens the chosen service with an intact draft or gives a clear copy-and-paste fallback.
- Saved data persists in the same Chrome profile without a backend, remote database, or account. Automatic extraction uses the user-supplied OpenAI API key when enabled.
- The user can inspect the content before it is sent to an AI service.

## Scope and boundaries

**In scope now:** local capture and editing, saved conversations, opt-in automatic memory from newly visited chats, manual memory management, automatic memory picking, prompt assembly, and composer filling or clipboard fallback for the three services.

**Outside the current build:** semantic search, automatic sending, native chat-history import, cross-device sync, and server storage. Running out of tokens is a motivating use case, but the extension does not detect token limits or switch services automatically.

The capture reads messages currently present in the page. Long chats may have unloaded earlier messages; the fallback may capture unrelated visible page text. Users should review captures. Prompt assembly limits the included transcript to 20,000 characters and keeps the beginning and end; the edited saved transcript remains intact locally.

## Demo script

Use a short harmless conversation with a core preference such as “Please keep answers concise.” Capture it, save it, close and reopen the panel, and select it from the dropdown. Enable automatic memory with a personal API key, visit a new chat, and inspect the saved preference and its source quote in the Memory tab. Show that it appears in the prompt preview. Open a different service, inspect the filled draft, then send it manually. Demonstrate the clipboard fallback if that site's composer does not accept insertion.
