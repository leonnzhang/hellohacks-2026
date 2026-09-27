# Core memory template

Relay Memory has **one memory shelf**: short facts about the user that are likely to help across unrelated chats. The extension stores one fact per record, not a running summary or a copy of the whole conversation. The machine-readable rules are in [`memory-policy.js`](../memory-policy.js).

Automatic memory is opt-in. For each changed conversation, the model may return up to three facts from these seven categories:

| Category | Save when the user explicitly says… | Good example | Do not treat as this category |
| --- | --- | --- | --- |
| **Preferred name** | What name they want to be called. | “Call me Sam.” | An assistant guesses their name. |
| **Role and background** | A stable role or background useful across chats. | “I am a computer science student.” | A temporary role in a hypothetical scenario. |
| **Answer style** | A lasting preference for tone, length, format, or language. | “Please keep answers concise.” | “Use bullets in this answer.” |
| **Workflow preference** | How they want an assistant to collaborate repeatedly. | “Show me a plan before changing code.” | A one-time instruction for the current task. |
| **Tools and environment** | Their usual personal platform or tools across tasks. | “I use macOS and VS Code.” | A tool chosen only for one assignment. |
| **Hobbies and interests** | A lasting hobby or recurring personal interest. | “I enjoy hiking on weekends.” | A one-time activity or hypothetical interest. |
| **Health and accessibility context** | An enduring allergy or accessibility need that should change practical advice. Save the minimum useful detail. | “I have a peanut allergy.” | A diagnosis, symptom, medication, test result, or health detail that does not affect future advice. |

## Save rule

The model must return a concise, atomic fact, one category, and a short **verbatim quote from a user message**. For example:

```json
{"text":"The user prefers concise answers.","category":"answer_style","quote":"I prefer concise answers"}
```

The extension checks that the category is on the allowlist, the quote appears in a user message, and the fact is not an exact normalized duplicate. It rejects age-related text. The model is instructed to skip temporary details, jokes, uncertain or implausible statements, assistant-only claims, contact details, credentials, financial details, and facts tied to just one task. Health and accessibility context is deliberately narrow: an explicit, enduring allergy or accessibility need that changes practical advice. The model must skip diagnoses, symptoms, medications, test results, and other medical detail. It can still misjudge meaning or durability; the user can edit or delete any saved fact. Automatic extraction is opt-in and health facts, like other saved memories, can appear in handoff prompts.

## Stored record

An auto-saved record contains `id`, `text`, `category`, `scope: "global"`, `sourceUrl`, `sourceTitle`, `sourceQuote`, `createdAt`, and `origin: "automatic"`. These records live in `chrome.storage.local` in the current Chrome profile. The Memory tab shows the category, a fixed reason why that type of fact is useful, the source quote, and edit/delete actions. The model does not generate the explanation.

Older records created before this core-only template stay in local storage. Records without a core scope are visible but excluded from handoffs. Automatically saved records in retired categories, including standing constraints and ongoing goals, remain visible but are excluded from handoffs. Editing and saving one explicitly converts it to an uncategorized manual core memory; deleting it removes it.

## Handoff rule

A send can include up to seven core records, selected separately from transfer context. With semantic search off, selection uses recency. When semantic search is enabled, relevant records can be retrieved from the local index for review. If an older fact matters more, the user can edit the saved memories. Conflicting facts are not automatically reconciled; the model is asked to skip conflicts and the user can correct an existing record.
