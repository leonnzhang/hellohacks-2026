# Relay: core ideas and interaction contract

This document is the product direction for transfer and memory behavior. Keep the implementation, interface text, demo guide, and privacy notice consistent with it.

## Two kinds of context

**Transfer context** is the visible conversation the user explicitly chooses to carry into a new chat. Choosing a destination inserts the captured conversation into that destination's composer immediately as an editable draft. The draft ends with an empty `CURRENT REQUEST` section. The user can inspect or edit the context, then add a new request before sending. Relay must never insert a placeholder that could be sent as if it were the user's request.

**Core memories** are durable facts and preferences saved separately in Memory Center. Opening a destination must not inject them into the draft. When the user clicks Send, Relay checks eligible core memories against the new request, adds the selected memories to the outgoing message, and sends through the chat site's normal control. With semantic search enabled, the local index retrieves relevant memories and saved excerpts. With search disabled or unavailable, the current fallback includes all eligible core memories; improving that local relevance fallback is future work.

## Transfer lifecycle

1. Capture role-labelled messages from the source chat. Exclude chat controls, ratings, navigation, composer content, and extension UI. If messages cannot be identified, show an error instead of transferring page text as a conversation.
2. Assemble a bounded handoff prompt and store it for one destination tab in `chrome.storage.session`. Store it before navigating the tab, so the destination content script can read it on first load.
3. Insert the transfer draft into an empty destination composer immediately. Preserve unrelated user drafts. Never nest a prior Relay placeholder draft into a new transfer.
4. Keep the destination's Send action under user control. Require a nonempty `CURRENT REQUEST`; clicking Send is the point where relevant core memories and optional retrieved excerpts are added. Preserve edits the user made to the transfer context.
5. Clear the pending transfer only after the destination visibly accepts the outgoing message. If insertion or sending fails, keep the context available and show a recoverable error.

The first sent message contains an explicit transfer section and any selected memory section. Relay does not create native historical messages in the destination service. Later messages in that chat should send normally unless another explicit memory feature is introduced.

## Trust and privacy

Saved conversations and memories stay in the current Chrome profile until a transfer or enabled API feature uses them. Relay inserts transfer context into the destination composer without clicking Send, though the destination site may save or sync drafts according to its own behavior. The user sends the message by clicking Send. Automatic memory extraction and semantic search are separate opt-in features that may call OpenAI with the user's API key; their data flow is described in [PRIVACY.md](PRIVACY.md).

Use harmless, synthetic conversations in tests and demos. Verify the actual destination composer and the resulting sent message on ChatGPT, Claude, and Gemini after site changes. The test must cover both button clicks and Enter, and must confirm that a transfer is inserted before Send while memories are added only on Send.
