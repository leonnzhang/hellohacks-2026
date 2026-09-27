# Relay demo guide

Use a dedicated Chrome profile and harmless synthetic content. These are rehearsal cases with expected results, not claims that every case has been live-tested. Current evidence is listed at the end.

## Setup

1. Load the repository as an unpacked extension at `chrome://extensions`; pin Relay.
2. Open the source and intended destination service. Complete any normal sign-in before presenting.
3. Open **Memory Center** from Relay’s toolbar icon on a supported chat, or from Transfer.
4. For the basic transfer demo, no OpenAI API key is needed.
5. For memory extraction and retrieval, open **Privacy & data → OpenAI connection**, enter your own key, and click **Save key**. Keep credentials out of recordings.
6. Turn on **Automatic memory** and **Context search** separately. These switches save immediately. Saving a key does not enable them. API charges may apply.
7. Add the seed memories below. Wait for Context search’s status text to say **Ready** with searchable text sections.
8. After code changes, reload the extension and the test chat tabs. Rehearse before going live.

## Synthetic seed memories

Add each in **Saved memories → Add a memory → Save memory**:

- `I am a computer science student.`
- `I prefer concise explanations with one practical example.`
- `For technical answers, I prefer runnable JavaScript examples.`
- `I use Chrome on macOS when building browser extensions.`
- `I enjoy hiking on weekends.`

These describe a fictional demo persona. Do not seed the preferred name used in the auto-memory case. Manual facts are allowed independently of the automatic category validator; the examples above also fit the core policy.

## Three-minute presentation

| Time | Action | Narration |
| --- | --- | --- |
| 0:00–0:45 | Run Case 1: transfer a short fictional conversation to another service. | “Choose where to continue. Relay brings the conversation and starts the new chat without another prompt.” |
| 0:45–1:15 | Open Overview, select a memory-map dot, show the counts. | “Useful personal context stays in this browser profile.” |
| 1:15–1:45 | Run two retrieval questions from Case 3. | “The question changes which saved context matches.” |
| 1:45–2:35 | Run Case 4, show the source quote/reason and click Undo. | “Optional automatic memory explains what it saved and lets me undo it.” |
| 2:35–3:00 | Show Privacy & data and separate switches. | “Transfer works without a Relay account. Extraction and search are optional API features.” |

Allow extra time for provider/API latency. Have the manual-memory and retrieval cases ready if automatic extraction is slow. Do not promise that every submitted fact will be saved.

## Case 1 — Continue an answered conversation

**Purpose:** demonstrate the main flow without asking for a new prompt.

1. In ChatGPT, send: `For a synthetic transfer test: suggest one name for a fictional moon cafe.`
2. Wait for the answer.
3. Click **Transfer → Continue conversation in… → Gemini** (or another rehearsed destination).
4. Do not type a follow-up or click Send. Show the destination accepting the context and replying with a brief acknowledgment.
5. Send an ordinary follow-up such as `Suggest a two-word slogan for that cafe.`

**Expected:** a fresh destination chat contains one context message with a continuation request. It acknowledges the context without repeating the source answer. The follow-up uses that context and sends normally. The transfer notification disappears after send confirmation. Exact model wording varies.

**Variant:** select ChatGPT as the destination to demonstrate a fresh same-service chat.

## Case 2 — An unanswered final message

**Purpose:** distinguish answering unfinished work from replaying an already answered conversation.

Use a source conversation whose final captured message is a user message, with no assistant turn after it. Transfer it to a rehearsed destination.

**Expected:** the continuation request asks the destination to answer that final message using earlier context. This branch is covered by automated tests. It can be hard to stage reliably live because source services may immediately begin an assistant turn; do not race a streaming response during the presentation or assume a partial response counts as unanswered.

## Case 3 — Inspect and retrieve memory

1. Show **Overview**: total, eligible, and automatic-memory counts; memory map; origin chart.
2. Select a map dot to inspect a fact.
3. Run the following through **Try a question → Find context**:

| Question | Expected relevant context |
| --- | --- |
| `How should you explain a technical idea to me?` | Concise explanations and one practical example |
| `What language should code examples use?` | Runnable JavaScript |
| `What browser and computer do I use?` | Chrome on macOS |
| `What do I like to do on weekends?` | Hiking |

**Expected:** relevant saved context appears without sending a message to the chat service. Ranking is model-dependent; do not promise exactly one result. With Context search enabled, OpenAI receives the query for embedding; matching happens against the local index.

**Fallback demonstration:** turn Context search off in the dedicated demo profile and repeat a question. Explain that disabled/unavailable/empty search falls back to eligible memories, rather than claiming precise semantic filtering. Restore the setting if later cases need it.

## Case 4 — Automatic memory, reason, and Undo

**Preconditions:** a saved key, Automatic memory on, and the preferred-name fact not already saved.

1. Send in a fresh supported chat: `Please call me Avery in future chats.`
2. Wait for the assistant reply and Relay’s scan. Timing includes the settling delay and API latency.
3. Show the **upper-right** memory notification: fact, source quote, category reason, and right-to-left countdown bar.
4. Click **Undo** within 10 seconds. Show the removal feedback and confirm the entry is absent from Saved memories.

**Expected:** the memory is already saved when the notification appears. Undo removes it; the countdown is not a delayed save. If the timer expires, delete it later in Saved memories.

**Keep variant:** use a different fictional name in a separate rehearsal, let the notification expire, then find it in Saved memories and inspect the quote.

**Duplicate variant:** repeat the same name while it is still saved. Expect no additional record; the supported preferred-name duplicate path may show “already saved.”

**Negative case:** ask `What is 2 + 2?` or `Use bullets for this answer only.` There should be no new durable memory. If the extractor surprises you, inspect the source and Undo/delete rather than presenting the result as guaranteed correctness.

## Case 5 — Manual add, edit/cancel, delete, and selected text

1. Add `I prefer metric units in examples.` in Saved memories.
2. Edit the entry, change the wording, then **Cancel**. Confirm the original remains.
3. Edit again and save. Confirm the updated text and Overview counts.
4. Select a harmless fact in a supported chat and use Relay’s right-click memory action. Confirm it appears as manual memory.
5. Delete a synthetic memory, then submit a matching retrieval question again after indexing updates.

**Expected:** the edited or deleted record is reflected in new results. A previously displayed retrieval preview can remain until rerun. Deletion does not retract content already sent to a provider. There is no general Undo for manual deletion; only delete expendable demo records.

## Case 6 — Controls and appearance

- Show all four Memory Center sections and the policy examples in Memory rules.
- Show **Save key**, **Remove key**, and the two independent switches. Keep the password field masked.
- Verify light and dark appearance during rehearsal and restore the presenter’s preferred setting.
- At a narrow window or increased zoom, check that navigation labels remain usable.
- Close Memory Center with Escape and confirm focus returns to the prior control.
- Show that the Transfer selector has three compact choices, no scroll area, and a small Memory Center link.

**Expected:** saving a key alone leaves both API features off; switches persist independently. Memory Center and Transfer share a neutral palette and blue accents.

## Case 7 — Failure and recovery rehearsal

| Situation | Expected behavior / recovery |
| --- | --- |
| Empty source chat | Destinations disabled; start a conversation first. |
| Existing destination draft | Preserve it; clear it to allow transfer preparation. |
| User edits the prepared transfer before auto-send | Stop automatic sending; use manual Send. |
| Send button unavailable or automatic click ignored | Keep the complete draft, show manual-send guidance; no repeated automatic clicks. |
| Reload after an automatic attempt | Do not automatically send the same pending transfer again. |
| API error during extraction | Show feedback; inspect Privacy & data. Same-snapshot retry waits through a 60-second cooldown. |
| Search indexing error | Show the index issue; sending can fall back to eligible core memories. |
| Extension code reloaded while chat was open | Reload that chat tab before continuing. |

Use automated fixtures for deterministic timing failures rather than deliberately disrupting the presentation. A logged-out destination may require sign-in; provider access is not controlled by Relay.

## Case 8 — Boundaries worth explaining

- The first destination message contains context; Relay does not create native historical turns.
- Long or virtualized chats can have missing DOM history, and transferred text is length-bounded.
- Transfer does not create a full local conversation archive.
- The old Handoff conversation editor is hidden. Do not plan a visible Capture/Save conversation demo.
- Automatic continuation currently retrieves using a generic continuation request. Use Try a question to demonstrate targeted semantic matching.
- Automatic memory is limited to seven durable categories; extraction can make mistakes.
- Storage is per Chrome profile. There is no sync, export/backup UI, or Relay account.

## Rehearsal checklist

- [ ] Dedicated profile; only synthetic source messages and memory records.
- [ ] Latest extension and chat pages reloaded.
- [ ] Intended source/destination services accessible; selected route rehearsed.
- [ ] Key saved if needed; Automatic memory on; Context search Ready.
- [ ] Seed facts visible; two retrieval questions checked.
- [ ] Preferred-name demo fact is not already saved.
- [ ] Presenter ready to click Undo within 10 seconds.
- [ ] Manual fallback understood; no repeated destination clicks while waiting.
- [ ] Credentials absent from screenshots and recordings.
- [ ] Light/dark or zoom changes restored after rehearsal.

## Verification evidence

As of the current implementation, all **40 Node tests** pass. They cover automatic continuation, one-time claims, failure fallback, preservation of drafts/edits, memory extraction/Undo, settings, and existing send behavior.

Live synthetic transfers **ChatGPT → ChatGPT** and **ChatGPT → Gemini** both sent automatically and received context acknowledgments without an extra prompt. Prior live checks covered ChatGPT automatic memory, timed Undo, duplicate/one-time cases, manual CRUD, retrieval, light/dark appearance, and narrow navigation. The new automatic-send flow has **not yet been live-verified in Claude**, nor have all source/destination pairs. Site updates can change behavior; rehearse the exact route you will present.
