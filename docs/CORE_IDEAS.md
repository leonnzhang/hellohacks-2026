# Relay: core ideas and interaction contract

This document is the product direction for transfer and memory behavior. Keep the implementation, interface text, demo guide, and privacy notice consistent with it.

## Two kinds of context

**Transfer context** is the visible conversation the user explicitly chooses to carry into a new chat. Choosing a destination automatically sends the captured context with a continuation request: answer the final user message if unanswered, otherwise acknowledge the context briefly and invite the next message. No additional prompt is required.

**Core memories** are durable facts and preferences saved separately in Memory Center. Before automatic or manual sending, Relay checks eligible core memories against the request, adds the selected memories to the outgoing message, and sends through the chat site's normal control. With semantic search enabled, the local index retrieves relevant memories and saved excerpts. With search disabled, unavailable, or an empty index, the current fallback includes all eligible core memories; improving that local relevance fallback is future work.

## Transfer lifecycle

1. Capture role-labelled messages from the source chat. Exclude chat controls, ratings, navigation, composer content, and extension UI. If messages cannot be identified, show an error instead of transferring page text as a conversation.
2. Assemble a bounded handoff prompt and store it for one destination tab in `chrome.storage.session`. Store it before navigating the tab, so the destination content script can read it on first load.
3. Insert the complete continuation draft into an empty destination composer. Preserve unrelated user drafts. Never nest a prior Relay placeholder draft into a new transfer.
4. Claim the automatic attempt in session storage before clicking Send. Add core memories and optional retrieved excerpts, then send once. Never automatically resend after refresh. Preserve user edits; changed drafts require manual Send.
5. Clear the pending transfer only after the destination visibly accepts the outgoing message. If insertion or sending fails, keep the context available and show a recoverable error.

The first sent message contains an explicit transfer section and any selected memory section. Relay does not create native historical messages in the destination service. Later messages in that chat should send normally unless another explicit memory feature is introduced.

## Trust and privacy

Saved conversations and memories stay in the current Chrome profile until a transfer or enabled API feature uses them. Choosing a destination authorizes Relay to send the captured conversation and selected memories there automatically. If sending cannot be confirmed, Relay leaves the draft available for manual Send. Automatic memory extraction and semantic search are separate opt-in features that may call OpenAI with the user's API key; their data flow is described in [PRIVACY.md](PRIVACY.md).

Use harmless, synthetic conversations in tests and demos. Verify the actual destination composer and the resulting sent message on ChatGPT, Claude, and Gemini after site changes. Live verification should cover both button clicks and Enter, and must confirm automatic continuation, manual fallback, preservation of existing drafts, and no duplicate automatic sends after refresh.
