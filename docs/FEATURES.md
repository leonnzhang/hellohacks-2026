# Relay feature guide

This guide describes the current visible app. For a scripted walkthrough, use the [demo guide](DEMO_GUIDE.md).

## Requirements at a glance

| Feature | OpenAI key | Opt-in switch | Entry point |
| --- | --- | --- | --- |
| Transfer and automatic continuation | No | No; choosing the destination starts it | Transfer beside the chat composer |
| Manual memory and selected-text saving | No | No | Saved memories / right-click menu |
| Automatic memory extraction | Yes | Automatic memory | Privacy & data |
| Semantic retrieval | Yes | Context search | Privacy & data; Try a question |
| Overview, memory rules, editing and deletion | No | No | Memory Center |

Supported services are ChatGPT (including `chat.openai.com`), Claude, and Gemini. The toolbar action opens Memory Center only on supported chat pages. There is no Relay login; each service controls its own access.

## Transfer a conversation

1. Open **Transfer** beside the composer.
2. Choose ChatGPT, Claude, or Gemini under **Continue conversation in…**. The current service is also available for a fresh chat.
3. Relay opens the destination, brings the captured context, adds selected memory, and automatically uses the destination’s Send control.
4. If the source ends with a user message, the continuation request asks for an answer. If it ends with an assistant reply, it asks for a brief acknowledgment and invites the next message without repeating that reply.

The menu contains three single-line choices and a secondary Memory Center link. Click outside it, press Escape, or toggle Transfer to close it. Empty chats disable destinations and show guidance.

The source shows “Continuing in…” feedback. Destination notifications report preparation and sending. If automatic sending is unavailable or not confirmed, the complete draft remains available with **Press Send to continue** guidance. A one-time claim stored per destination tab prevents another automatic attempt after reload. A claim does not mean delivery succeeded; pending context is cleared only after visible send confirmation.

Existing drafts are not overwritten. Clear an unrelated draft to allow preparation. If you edit the generated draft before its automatic send, Relay leaves it for manual sending. Later messages in an established chat pass through normally.

**Limits:** the transfer is a context message, not a native conversation import. Only rendered messages can be captured; inline transfer rejects an unstructured page-text fallback. Individual messages are capped at 12,000 characters, and the assembled transcript is bounded to 20,000 characters plus the omission marker. No full archive is saved by this action. Pending context expires after 30 minutes or when the tab closes. Site UI changes, login screens, and disabled send controls can prevent automation.

## Memory Center

Open it from the pinned Relay icon on a supported chat or the Transfer menu. It follows the chat’s light/dark appearance, has labeled navigation, supports Escape to close, traps keyboard focus while open, and restores focus when closed.

### Overview

- **Saved memories:** total stored entries.
- **Ready for transfer:** entries eligible for outgoing memory context; this is not a promise that every entry will match a semantic search.
- **Saved automatically:** count of entries created by automatic extraction.
- **Memory map:** inspect eligible memory text by selecting a dot.
- **Try a question → Find context:** preview retrieval without sending a message to a chat service. With search enabled, OpenAI embeds the question and the browser ranks local vectors.
- **How memories were saved:** manual, automatic, and earlier entries, based on actual stored data.

After changing saved data, submit a preview question again; a previously displayed result is not itself a live query.

### Saved memories

Add a short reusable fact with **Save memory**. Use **Edit**, **Cancel**, and the save action to update an entry, or delete it. Automatic entries expose their source quote and category explanation. Manually saved entries are core memories and do not undergo the automatic extractor’s category validation.

Select text on a supported chat page and choose Relay’s memory action from the right-click menu to save it manually. Manual text is limited to 4,000 characters. Earlier suggestions are shown only when legacy suggestion records exist.

Older noncore/unscoped entries and automatic entries in retired categories remain visible but are excluded from outgoing memory context. Editing and saving one converts it to manual core memory. There is no bulk export, backup, or cross-device sync UI.

### Memory rules

The seven automatic categories are preferred name, role/background, answer style, workflow preference, tools/environment, hobbies/interests, and minimal enduring health/accessibility context. The rules also list exclusions. See [Memory template](MEMORY_TEMPLATE.md) for examples; these are extraction rules, not a guarantee of model correctness.

### Privacy & data

- **OpenAI connection → Save key:** stores the key in this Chrome profile. It does not enable any feature.
- **Remove key:** removes the key and disables automatic memory and context search; saved memories remain.
- **Automatic memory → Save useful facts from chats:** saves immediately when switched. Requires a saved key.
- **Context search → Find relevant saved context:** saves immediately when switched. Requires a saved key. Turning it off clears the local index, not saved memories.
- Read feature state and extraction/index errors here. “On” and “Ready” refer to different things: the switch enables search, while the status text reports index readiness.

## Automatic memory and notifications

With the feature enabled, Relay watches supported chat pages for changes. It requires role-labelled user and assistant messages, waits roughly five seconds after changes settle, and bounds the scheduling delay to 20 seconds during continuous changes. API latency adds to this; it is not a guaranteed save deadline or a precise generation-finished signal.

Up to three durable facts may be extracted from a changed snapshot. Each must have an allowed category and a quote from a user message. The worker validates and deduplicates before saving. Repeated unchanged snapshots are skipped. Failed scans of the same snapshot have a 60-second retry cooldown; busy scans are rescheduled. See [Automatic memory](AUTO_MEMORY_PLAN.md).

A successful save appears in the upper-right notification stack with the memory, source quote, category reason, and a bar draining right to left for **10 seconds of Undo**. **The memory is already saved when the notification appears.** Undo removes that new save; the timer is not a delayed commit. After it expires, deletion remains available in Saved memories.

Some repeated preferred-name statements show “already saved” feedback. Other duplicates and one-time requests may produce no new notification. Transfer notices can be dismissed without clearing the draft; Memory Center errors stay visible until dismissed.

## Context search and memory reuse

Search indexes eligible memories and any existing saved-conversation records. Embeddings use OpenAI; text and vectors are stored locally. Index updates follow saved-data changes. Ranking can return no matches.

Before a first/new-chat send or an automatic transfer send, Relay can retrieve matching memories and saved excerpts. With search off, unavailable, or an empty index, it falls back to all eligible core memories. This can include more context than necessary. Automatic transfers currently search using the generated continuation request rather than a transcript-specific query, so demonstrate precise retrieval separately with Try a question.

The legacy conversation capture/save/update/delete editor remains in the code but its Handoff view is hidden. Do not present it as a current navigation feature. Existing saved conversations may still participate in search.

## Troubleshooting

| Symptom | Check / next action |
| --- | --- |
| Relay missing after an update | Reload the extension, then reload the chat tab. Use a supported service with a visible composer. |
| Transfer choices disabled | Start a conversation; Relay needs identifiable user messages. |
| Destination opens but does not send | Check login/access, then use the prepared draft and press Send. Avoid repeatedly choosing a destination. |
| Draft is preserved instead of replaced | Clear the unrelated draft if you want the transfer inserted. |
| No automatic memory notification | Check saved key, Automatic memory, role-labelled user/assistant messages, and a genuinely new durable fact. Review errors in Privacy & data. |
| Search says On but is not Ready | Add eligible memory, allow indexing to complete, and inspect the index error text. |
| Deleted memory still appears in preview | Submit the question again after indexing catches up. Previously sent chat messages are not changed by deletion. |
| Missing earlier conversation turns | The service may have unloaded history. Relay cannot capture text absent from the DOM. |
| Source or destination behaves differently after a site update | Capture and send selectors may need maintenance; report the service and observed behavior. |
