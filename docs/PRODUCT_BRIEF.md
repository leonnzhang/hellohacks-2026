# Relay product brief

## Purpose

People move between AI chat services and repeatedly explain the same context. Relay brings an active conversation to another service and keeps a small reusable memory shelf in the current browser profile.

There are three capabilities:

1. **Conversation continuation:** choose a destination; Relay transfers context and automatically starts the new chat.
2. **Shared memory:** manually save useful facts or opt into extraction with source evidence and Undo.
3. **Context search:** optionally retrieve relevant saved context using local vectors and OpenAI embeddings.

## Primary journey

Open Transfer beside a supported chat composer and choose **Continue conversation in… → ChatGPT / Claude / Gemini**. Relay opens a fresh chat, inserts context and selected memory, and attempts Send once. An unanswered final user message gets a continuation request for an answer; an answered conversation gets a brief acknowledgment request. No new user prompt is required. If sending fails, retain a complete draft for manual Send.

Memory Center provides Overview, Saved memories, Memory rules, and Privacy & data. A saved OpenAI key and separate switches enable automatic memory and context search. Transfer and manual memory need no OpenAI key.

## Acceptance criteria

- The destination selector is compact and does not scroll.
- Selecting a service clearly starts automatic continuation, including fresh chats on the same service.
- Only structured conversation messages are transferred; no broad page-text fallback is silently sent.
- An automatic attempt is claimed once per transfer; reloads do not cause automatic retries.
- Existing drafts and user edits are preserved. Pending context clears only after send confirmation.
- Automatic memory shows its fact, source quote, reason, and a 10-second Undo window after saving.
- Manual memory supports add, edit/cancel, delete, and selected-text saving.
- Retrieval previews explain which saved context matches a question without sending a chat message.
- Both API features start disabled; saving a key alone does not enable them.
- User-facing privacy text explains automatic destination sending and OpenAI data flows.

## Scope

Implemented: three-service DOM capture and composer integration; automatic continuation; first-send memory inclusion; centered Memory Center; manual and automatic memory; local semantic index; shared notifications and light/dark styling.

Not implemented: native historical-message import, token-limit detection, automatic provider switching, attachments migration, cross-device sync, Relay accounts, a backend, bulk export/backup, or a visible saved-conversation archive editor. The legacy Handoff editor remains hidden in code.

A transfer contains only rendered messages and is length-bounded. It is not a lossless archive. Search-disabled/error fallback includes all eligible memories; automatic continuation’s generic retrieval query is a known relevance limitation.

See [Features](FEATURES.md) for the complete app reference and [Demo guide](DEMO_GUIDE.md) for executable scenarios. Verification status belongs in [Developer handoff](DEVELOPER_HANDOFF.md#verification), rather than implying equal live coverage on all services.
