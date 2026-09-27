# Relay demo guide

This guide sets up a repeatable demo with fictional memories. Use a dedicated Chrome profile so demo data stays separate from personal memories. Relay has no account or server database; its data belongs to the current Chrome profile.

## 1. Set up the demo profile

1. In Chrome, create or choose a profile for the demo.
2. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the Relay project folder.
3. Pin Relay. Open a ChatGPT, Claude, or Gemini chat and open **Memory Center** from the Relay icon or the **Transfer** menu.
4. Go to **Privacy & data**. Enter your own OpenAI API key and save settings. Keep the key out of screenshots, recordings, and this guide. API usage may incur charges.
5. Turn on **Automatic saving** and **Semantic search**. Confirm automatic saving says **On** and semantic search reaches **Ready** with searchable text sections. The index is built locally and may take a short moment after adding memories.

No Relay sign-in is needed. Sign into the chat service if its normal access requires it. The OpenAI key is stored in this Chrome profile; the demo profile's memories and search index are separate from other Chrome profiles.

## 2. Add synthetic starter memories

In **Saved memories**, add these one at a time. They describe a fictional demo persona and are safe to show on screen.

1. `I am a computer science student preparing a short hackathon demo.`
2. `I am building Relay, a browser extension that carries useful context between AI chat services.`
3. `I prefer concise explanations with one practical example.`
4. `For technical answers, I prefer runnable JavaScript or TypeScript examples.`
5. `I use Chrome on macOS when building browser extensions.`

Return to **Overview**. The memory map should show the saved memories. Select a dot to inspect its text. The overview counts should show saved memories and memories ready for transfer. Wait for Semantic search to report **Ready** before trying retrieval.

## 3. Demo retrieval with “Try a question”

Run these in **Overview → Try a question**:

| Question | What it should find |
| --- | --- |
| `What am I building for the hackathon?` | The Relay project and hackathon context. |
| `How should you explain a technical idea to me?` | The preference for concise explanations and an example. |
| `What language should code samples use?` | JavaScript or TypeScript, preferably runnable. |
| `What browser and computer do I use for extension work?` | Chrome on macOS. |

The preview shows relevant saved context; it does not send a chat message. The query is sent to OpenAI to create an embedding, while the searchable text and vectors remain in this browser. After editing or deleting a memory, submit the question again to refresh the preview.

## 4. Demo automatic saving and Undo

1. Open a fresh chat on one of the supported services. Keep the Relay-enabled page open.
2. Send a clear, lasting statement that is not already in the seed list: `Please call me Avery in future chats.`
3. Wait for the assistant reply and for Relay to inspect the settled conversation. A **Memory saved** notification should appear near the bottom-right of the chat with a 10-second **Undo** countdown.
4. For the Undo demonstration, click **Undo** before the countdown ends. The notification changes to **Memory removed** and the saved-memory count falls back. To keep the new fact instead, let the countdown expire and show it in **Saved memories** with its source quote.
5. If keeping the fact, try `What should you call me?` in the overview retrieval preview. It should retrieve Avery along with any other relevant preference.

Automatic saving is opt-in and requires the API key. Relay checks visible user and assistant messages after a chat settles, so keep the chat open briefly after the reply. One-time instructions are skipped, and an already saved fact is deduplicated; neither should increase the memory count.

## 5. Demo editing, deletion, and transfer

- In **Saved memories**, edit the concise-answer preference, save it, and show that the overview/map updates.
- Delete one synthetic memory, then re-run a retrieval question that used to match it. The next search should no longer return that memory. An already displayed preview stays visible until you submit another question.
- From a supported chat, click **Transfer** and choose a destination. Show the captured conversation already in the new composer, with a blank `CURRENT REQUEST` section and no placeholder text. Add a request and click Send; Relay checks core memories then and adds eligible ones to that outgoing message. Transfer context is one-time; later messages in the destination chat are sent normally.

## Suggested three-minute narration

1. “Relay keeps a small set of useful facts in this browser profile.” Show the Memory Center map and the saved/ready counts.
2. “Retrieval changes with the question.” Run one preference question and one project question.
3. “A new lasting fact can be saved from a chat.” Ask the chat to call the fictional user Avery, then show the saved notification and Undo countdown.
4. “The user stays in control.” Undo the save, or show the source quote and edit/delete controls if keeping it.
5. “The same relevant context can continue in another AI chat.” Use **Transfer** and send one message in the destination.

## Rehearsal checklist

- [ ] Use a dedicated Chrome profile and synthetic data.
- [ ] OpenAI key saved; automatic saving is **On**; semantic search is **Ready**.
- [ ] Seed memories appear in the map and the counts look right.
- [ ] Try a question returns the expected memory before the presentation.
- [ ] The selected chat service is signed in and the Relay extension is active.
- [ ] Keep the new-chat tab visible after the auto-save prompt so the short Undo timer is easy to demonstrate.
- [ ] Decide whether to click **Undo** or leave the fictional fact saved.

## Test notes

The current implementation was exercised in a live ChatGPT tab and a separate Chrome test profile: automatic saving created a memory and showed the timed Undo notification; a one-time question did not add a memory; repeating an already saved name did not create a duplicate. Manual add, edit, delete, and retrieval were also checked. After deletion, the previous retrieval preview remained on screen until the search was submitted again, then the deleted fact disappeared. The separate profile was able to auto-save while logged out of ChatGPT, with Relay enabled and an API key configured; Relay itself does not require a login.

The automated Node test suite passed all 21 tests during this verification. Live page markup and timing can change when ChatGPT, Claude, or Gemini update their interfaces, so rehearse the selected provider before presenting.
