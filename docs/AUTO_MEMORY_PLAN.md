# Automatic memory: current behavior

Despite the historical filename, this describes the implemented feature. The canonical category definitions live in [`memory-policy.js`](../memory-policy.js); examples are in [Memory template](MEMORY_TEMPLATE.md).

## Enable it

Open Memory Center on a supported chat, then **Privacy & data → OpenAI connection → Save key**. Turn on **Automatic memory → Save useful facts from chats**. Saving the key alone does not enable extraction. Context search is an independent switch using the same key.

## When scans run

- Content scripts observe supported chat pages and schedule a scan after roughly five seconds of quiet. Continuous DOM changes bound the scheduling delay to 20 seconds; a periodic check also runs every 30 seconds when no scan timer is pending.
- Capture must contain both user and assistant messages with identifiable roles. Broad page-text fallback is rejected. This is a DOM-settling heuristic, not an exact assistant-generation completion signal.
- The worker verifies opt-in, key, and source origin. It strips Relay-augmented user messages to their current request, caps each message at 12,000 characters, and retains recent complete messages up to 50,000 characters.
- Successful/unchanged snapshots are skipped. Changed conversations can generate later requests; this is not a once-per-conversation feature or a bulk scan of saved chats.
- One scan per source URL runs at a time. Busy scans are rescheduled after 15 seconds. A failed same-snapshot scan has a 60-second retry cooldown and is eligible for a later scheduled check.

API latency is additional. These numbers are scheduling behavior, not a guaranteed notification time.

## Extraction and saving

The worker calls OpenAI’s Responses API using the configured `gpt-6-luna` model and `store: false`. It requests at most three atomic, durable facts from the seven categories, with exact quotes from user messages. Assistant messages provide context, not evidence.

Validation checks category, user quote, deterministic exclusions, and normalized duplicates against saved memories and older suggestions. Serialized writes recheck storage to avoid duplicate concurrent additions. Deletion epochs prevent an in-flight extraction started before a deletion from restoring that source’s removed memory.

Qualifying records are saved directly in `chrome.storage.local`, with source URL/title/quote, category, timestamp, and global scope. The explanation shown to the user is the category’s fixed reason, not a model-generated explanation of its decision. Older pending suggestions remain reviewable only when such records exist.

## Notification and Undo

A successful new save produces an upper-right notification containing the fact, source quote, reason, and **10-second Undo** countdown. The bar drains right to left.

**The write has already succeeded when the notification appears.** Expiration does not commit a delayed save. Undo removes only the new automatic records from that save/source; it does not undo other memories or messages sent to providers. The worker permits a short timing allowance for the Undo request. After the UI window expires, use Saved memories to delete or edit the record.

A repeated supported preferred-name statement may show “already saved.” Other duplicates and one-time requests may produce no new notification. API failures produce a brief notice, with details available in Privacy & data. Silent no-op cases do not prove that extraction is broken.

## Controls and data flow

Turning Automatic memory off stops future scans from being authorized; it does not remove saved records. Removing the key disables both API features and clears the search index through the search-disable path. Existing requests may already be in flight when settings change; do not promise retroactive cancellation.

The key and saved records stay in the current Chrome profile; visible chat text is sent to OpenAI when extraction is enabled. Relay does not automatically archive the full scanned transcript locally. The automatic policy permits minimal enduring allergies/accessibility needs. Never bundle a shared key. See [Privacy](PRIVACY.md).

## Limits

Unloaded history is unavailable. DOM changes can break capture. Source quotes establish textual grounding, not truth or permanence. Jokes, corrections, conflicting facts, and temporary instructions need evaluation; conflicts are not automatically reconciled. Manual entry is separate and does not enforce the automatic allowlist.

Before transfer or first-send memory inclusion, only eligible core records are considered. Search off/unavailable/empty falls back to all eligible records; enabled search can select a subset or no matches. Choosing a transfer destination now starts automatic continuation—there is no required extra request before using saved memory.

## Verification

The Node suite covers opt-in gating, grounding/category checks, duplicate handling, snapshot reuse, retry cooldown, deletion/Undo, notification content/countdown, and stripping transferred context from extraction input. Prior live ChatGPT checks confirmed saving, timed Undo, duplicate-name behavior, and skipping a one-time request. Rehearse with synthetic data on each intended service; model behavior and site timing are not deterministic. See [Demo cases 4 and 7](DEMO_GUIDE.md#case-4--automatic-memory-reason-and-undo).
