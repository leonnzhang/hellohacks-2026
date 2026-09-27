(() => {
  if (globalThis.__relayTransferContext) return;
  globalThis.__relayTransferContext = true;

  let pending = null;
  let memories = [];
  let ragEnabled = false;
  let preparing = false;
  let replaying = false;

  const selectors = location.hostname === "claude.ai"
    ? ["[data-testid='chat-input'] [contenteditable='true']", ".ProseMirror[contenteditable='true']", "[contenteditable='true'][role='textbox']"]
    : location.hostname === "gemini.google.com"
      ? [".ql-editor[contenteditable='true']", "[contenteditable='true'][role='textbox']", "[contenteditable='true']"]
      : ["#prompt-textarea", "[data-testid='composer-text-input']", "[contenteditable='true'][role='textbox']"];

  function composer() {
    for (const selector of selectors) {
      const found = [...document.querySelectorAll(selector)].find((node) => node.getClientRects().length);
      if (found) return found;
    }
    return [...document.querySelectorAll("textarea")].find((node) => node.getClientRects().length) || null;
  }

  function inputText(input) {
    return input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement
      ? input.value : input.innerText || input.textContent || "";
  }

  function normalized(text) {
    return text.replace(/\u200b/g, "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  function sendButton(input) {
    const form = input.closest("form");
    const candidates = [...document.querySelectorAll("button")].filter((button) => {
      if (!button.getClientRects().length || button.disabled) return false;
      const label = [button.getAttribute("aria-label"), button.getAttribute("title"),
        button.getAttribute("data-testid"), button.textContent].filter(Boolean).join(" ");
      return /\bsend\b/i.test(label) || (button.type === "submit" && form?.contains(button));
    });
    return candidates.find((button) => form?.contains(button)) || candidates.find((button) => {
      const a = input.getBoundingClientRect();
      const b = button.getBoundingClientRect();
      return Math.abs(a.bottom - b.bottom) < 180 && Math.abs(a.right - b.right) < 260;
    }) || null;
  }

  async function insertText(input, text) {
    input.focus();
    if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
      const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value").set.call(input, text);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      const range = document.createRange();
      range.selectNodeContents(input);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      const clipboardData = new DataTransfer();
      clipboardData.setData("text/plain", text);
      input.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData }));
      await new Promise((resolve) => setTimeout(resolve, 150));
      if (normalized(inputText(input)) !== normalized(text)) {
        input.focus();
        range.selectNodeContents(input);
        selection.removeAllRanges();
        selection.addRange(range);
        const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        document.execCommand("insertHTML", false, escaped.split("\n").map((line) => `<p>${line || "<br>"}</p>`).join(""));
        input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertFromPaste", data: text }));
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
    return normalized(inputText(input)) === normalized(text);
  }

  function hasExistingMessages() {
    const selectors = ["[data-message-author-role]", "[data-testid^='conversation-turn-']",
      "[data-testid='user-message']", "[data-testid='assistant-message']", ".font-user-message",
      ".font-claude-response", ".query-text", "[data-test-id='user-query']", "message-content", ".model-response-text"];
    return selectors.some((selector) => [...document.querySelectorAll(selector)]
      .some((node) => (node.innerText || node.textContent || "").trim()));
  }

  function notice(message) {
    const toast = document.createElement("div");
    toast.setAttribute("role", "status");
    toast.style.cssText = "position:fixed;right:18px;bottom:82px;z-index:2147483646;padding:10px 12px;border-radius:10px;background:#26313d;color:#fff;box-shadow:0 8px 24px #0004;font:12px/1.4 system-ui,sans-serif";
    toast.textContent = message;
    document.body.append(toast);
    setTimeout(() => toast.remove(), 5000);
  }

  async function sendWithContext(input, original) {
    preparing = true;
    const transfer = pending;
    try {
      let selectedMemories = memories;
      let relatedConversations = [];
      try {
        const result = await chrome.runtime.sendMessage({ type: "RAG_RETRIEVE", query: original });
        if (result?.ragUsed) {
          selectedMemories = Array.isArray(result.memories) ? result.memories : memories;
          relatedConversations = Array.isArray(result.relatedConversations) ? result.relatedConversations : [];
        }
      } catch { /* Use locally available memories. */ }
      if (inputText(input).trim() !== original) {
        notice("Your message changed while Relay prepared context. Press Send again.");
        return;
      }
      const combined = globalThis.RELAY_TRANSFER.buildSendPrompt({
        memories: selectedMemories,
        transfer: transfer?.prompt || "",
        relatedConversations
      }, original);
      if (combined !== original && !await insertText(input, combined)) {
        await insertText(input, original);
        notice("Relay could not prepare context. Your message was not sent.");
        return;
      }
      if (transfer) {
        const result = await chrome.runtime.sendMessage({ type: "COMPLETE_PENDING_TRANSFER", id: transfer.id });
        if (!result?.ok) {
          if (combined !== original) await insertText(input, original);
          notice("The transfer expired. Please start it again.");
          return;
        }
        pending = null;
      }
      const button = sendButton(input);
      if (button) {
        replaying = true;
        button.click();
        setTimeout(() => { replaying = false; }, 500);
      } else notice("Context is in the composer. Press Send to finish.");
    } catch {
      notice("Relay could not prepare context. Your message was not sent.");
    } finally { preparing = false; }
  }

  function intercept(event) {
    if (replaying || (!pending && (hasExistingMessages() || (!memories.length && !ragEnabled)))) return;
    const input = composer();
    if (!input) return;
    let isSend = false;
    if (event.type === "click") isSend = event.target instanceof Element && event.target.closest("button") === sendButton(input);
    if (event.type === "submit") isSend = event.target instanceof HTMLFormElement && event.target.contains(input);
    if (event.type === "keydown") isSend = event.key === "Enter" && !event.shiftKey && !event.ctrlKey &&
      !event.metaKey && !event.altKey && !event.isComposing && (event.target === input || input.contains(event.target));
    if (!isSend) return;
    const original = inputText(input).trim();
    if (!original || globalThis.RELAY_TRANSFER.stripAugmentedPrompt(original) !== original) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!preparing) sendWithContext(input, original);
  }

  document.addEventListener("click", intercept, true);
  document.addEventListener("submit", intercept, true);
  document.addEventListener("keydown", intercept, true);

  async function refresh() {
    try {
      memories = await chrome.runtime.sendMessage({ type: "GET_CORE_MEMORIES" }) || [];
      pending = await chrome.runtime.sendMessage({ type: "GET_PENDING_TRANSFER" });
      const search = await chrome.runtime.sendMessage({ type: "RAG_STATUS" });
      ragEnabled = !!search?.enabled;
    } catch { /* Extension may have reloaded. */ }
  }
  refresh();
  setTimeout(refresh, 1000);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.memories || changes.ragEnabled)) refresh();
  });
})();
