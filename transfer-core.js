globalThis.RELAY_TRANSFER = (() => {
  const destinations = {
    ChatGPT: "https://chatgpt.com/",
    Claude: "https://claude.ai/new",
    Gemini: "https://gemini.google.com/app"
  };
  const maxTranscript = 20000;
  const contextStart = "[Relay transfer context — start]";
  const contextEnd = "[Relay transfer context — end]";

  function isEligibleMemory(memory, policy = globalThis.MEMORY_POLICY) {
    const active = new Set(policy.categories.map((entry) => entry.id));
    return memory.scope === "global" && !memory.project &&
      (memory.origin !== "automatic" || active.has(memory.category));
  }

  function pickMemories(memories, policy = globalThis.MEMORY_POLICY) {
    return memories.filter((memory) => isEligibleMemory(memory, policy)).slice(0, 3);
  }

  function formatTranscript(messages) {
    return messages.map(({ role, text }) => `${role.toUpperCase()}:\n${role === "user" ? stripAugmentedPrompt(text) : text}`).join("\n\n");
  }

  function shortenTranscript(transcript, template) {
    if (transcript.length <= maxTranscript) return transcript;
    const head = transcript.slice(0, 3500);
    const tail = transcript.slice(-(maxTranscript - 3500));
    return `${head}\n\n${template.truncationNotice}\n\n${tail}`;
  }

  function buildPrompt({ transcript = "", memories = [], template }) {
    transcript = transcript.trim();
    if (!transcript && !memories.length) return "";
    const sections = [template.intro];
    if (memories.length) sections.push(template.memoryHeading + "\n" + memories.map((memory) => `- ${memory.text}`).join("\n"));
    if (transcript) sections.push(template.conversationHeading + "\n" + shortenTranscript(transcript, template));
    return sections.join(template.separator);
  }

  function buildAugmentedPrompt(context, userMessage) {
    const request = userMessage.trim();
    if (!request) return "";
    if (!context.trim()) return request;
    return `${contextStart}\n${context.trim()}\n${contextEnd}\n\nCURRENT REQUEST\n${request}`;
  }

  function stripAugmentedPrompt(text) {
    if (!text.startsWith(`${contextStart}\n`)) return text;
    const marker = `${contextEnd}\n\nCURRENT REQUEST\n`;
    const index = text.indexOf(marker);
    return index < 0 ? text : text.slice(index + marker.length);
  }

  return { destinations, isEligibleMemory, pickMemories, formatTranscript, buildPrompt,
    buildAugmentedPrompt, stripAugmentedPrompt };
})();
