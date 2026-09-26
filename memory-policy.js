globalThis.MEMORY_POLICY = {
  version: 2,
  maxPerConversation: 3,
  categories: [
    {
      id: "preferred_name", label: "Preferred name", scope: "global",
      saveWhen: "The user explicitly says what name they want to be called.",
      example: "Call me Sam.",
      why: "Useful when addressing the user in later chats."
    },
    {
      id: "role_background", label: "Role and background", scope: "global",
      saveWhen: "The user explicitly describes a stable role or background that matters across unrelated conversations.",
      example: "I am a computer science student.",
      why: "Helps tailor explanations to the user's background."
    },
    {
      id: "answer_style", label: "Answer style", scope: "global",
      saveWhen: "The user states an ongoing preference for response length, tone, format, or language.",
      example: "Please keep answers concise.",
      why: "Changes how future answers should be written."
    },
    {
      id: "workflow_preference", label: "Workflow preference", scope: "global",
      saveWhen: "The user states a recurring preference for how an assistant should collaborate or complete tasks.",
      example: "Show me a plan before changing code.",
      why: "Keeps future collaboration aligned with the user's process."
    },
    {
      id: "tool_environment", label: "Tools and environment", scope: "global",
      saveWhen: "The user states a default personal platform or tool used across many unrelated tasks, not just one project.",
      example: "I use macOS and VS Code.",
      why: "Makes future instructions fit the user's usual setup."
    },
    {
      id: "hobbies_interests", label: "Hobbies and interests", scope: "global",
      saveWhen: "The user explicitly describes a lasting hobby or recurring personal interest, not a one-time activity.",
      example: "I enjoy hiking on weekends.",
      why: "Helps make future suggestions relevant to the user's interests."
    },
    {
      id: "health_context", label: "Health and accessibility context", scope: "global",
      saveWhen: "The user explicitly states an enduring health or accessibility need that should change practical advice, such as an allergy or accessibility accommodation. Save only the minimum useful fact.",
      example: "I have a peanut allergy.",
      why: "Helps avoid advice that conflicts with a stated health or accessibility need."
    }
  ],
  skipRules: [
    "One-time questions, transient status, and facts likely to expire soon.",
    "Assistant claims that the user did not confirm.",
    "Hypotheticals, jokes, uncertain statements, and implausible values.",
    "Age, birth date, contact details, credentials, financial details, and sensitive medical details such as diagnoses, medications, symptoms, or test results. The health category allows only a concise, explicitly stated, enduring allergy or accessibility need that changes practical advice.",
    "Details, decisions, and tools that apply only to a single task or project.",
    "Duplicates or statements that conflict with saved memory; do not silently overwrite an earlier fact.",
    "Facts outside the seven core categories."
  ]
};
