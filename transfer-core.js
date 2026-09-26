globalThis.RELAY_TRANSFER = (() => {
  const destinations = {
    ChatGPT: "https://chatgpt.com/",
    Claude: "https://claude.ai/new",
    Gemini: "https://gemini.google.com/app"
  };
  const maxTranscript = 20000;

  function pickMemories(memories, policy = globalThis.MEMORY_POLICY) {
    const active = new Set(policy.categories.map((entry) => entry.id));
    return memories.filter((memory) => memory.scope === "global" && !memory.project &&
      (memory.origin !== "automatic" || active.has(memory.category))).slice(0, 3);
  }

  function formatTranscript(messages) {
    return messages.map(({ role, text }) => `${role.toUpperCase()}:\n${text}`).join("\n\n");
  }

  function shortenTranscript(transcript, template) {
    if (transcript.length <= maxTranscript) return transcript;
    const head = transcript.slice(0, 3500);
    const tail = transcript.slice(-(maxTranscript - 3500));
    return `${head}\n\n${template.truncationNotice}\n\n${tail}`;
  }

  function buildPrompt({ transcript = "", nextRequest = "", memories = [], template }) {
    transcript = transcript.trim();
    nextRequest = nextRequest.trim();
    if (!transcript && !memories.length && !nextRequest) return "";
    const sections = [template.intro];
    if (memories.length) sections.push(template.memoryHeading + "\n" + memories.map((memory) => `- ${memory.text}`).join("\n"));
    if (transcript) sections.push(template.conversationHeading + "\n" + shortenTranscript(transcript, template));
    sections.push(`${template.nextRequestHeading}\n${nextRequest || template.emptyNextRequest}`);
    return sections.join(template.separator);
  }

  return { destinations, pickMemories, formatTranscript, buildPrompt };
})();
