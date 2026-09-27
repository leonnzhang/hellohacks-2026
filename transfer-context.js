(() => {
  if (globalThis.__relayTransferContext) return;
  globalThis.__relayTransferContext = true;

  let pending = null;
  let pendingLoaded = false;
  let memories = [];
  let ragEnabled = false;
  let preparing = false;
  let replaying = false;
  let watchingSend = false;
  let clearingLegacyDraft = false;
  let pendingIndicator = null;
  let draftPreparedId = null;
  let draftAttempts = 0;
  let preparingDraft = false;

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

  function matchesInsertedText(input, text) {
    const actual = inputText(input);
    if (normalized(actual) === normalized(text)) return true;
    const expectedDraft = globalThis.RELAY_TRANSFER.parseTransferDraft(text);
    const actualDraft = globalThis.RELAY_TRANSFER.parseTransferDraft(actual);
    return !!expectedDraft && !!actualDraft &&
      normalized(actualDraft.transfer) === normalized(expectedDraft.transfer) &&
      normalized(actualDraft.request) === normalized(expectedDraft.request);
  }

  function isLegacyRelayDraft(text) {
    return text.trim().startsWith("I am continuing work from another AI chat.") &&
      /MY NEXT REQUEST\s*\[Add your next request here before sending\]\s*$/.test(text);
  }

  async function clearLegacyDraft(input) {
    if (clearingLegacyDraft) return;
    clearingLegacyDraft = true;
    try {
      input.focus();
      if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
        const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, "value").set.call(input, "");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      } else {
        const range = document.createRange();
        range.selectNodeContents(input);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand("delete", false);
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
      notice(inputText(input).trim()
        ? "An older Relay draft is in this composer. Clear it before sending a new request."
        : "Removed an older Relay draft. Enter your new request to transfer this chat.");
    } finally { clearingLegacyDraft = false; }
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
      // insertText goes through the editor's input handling on all three sites.
      // A synthetic paste event is untrusted and is often ignored by editors.
      document.execCommand("insertText", false, text);
      await new Promise((resolve) => setTimeout(resolve, 150));
      if (!matchesInsertedText(input, text)) {
        input.focus();
        range.selectNodeContents(input);
        selection.removeAllRanges();
        selection.addRange(range);
        const clipboardData = new DataTransfer();
        clipboardData.setData("text/plain", text);
        input.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData }));
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      if (!matchesInsertedText(input, text)) {
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
    return matchesInsertedText(input, text);
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

  function updatePendingIndicator() {
    if (!pending) {
      pendingIndicator?.remove();
      pendingIndicator = null;
      return;
    }
    if (!pendingIndicator && document.body) {
      pendingIndicator = document.createElement("div");
      pendingIndicator.id = "relay-pending-transfer";
      pendingIndicator.setAttribute("role", "status");
      pendingIndicator.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:2147483646;max-width:300px;padding:10px 13px;border-radius:10px;background:#26313d;color:#fff;box-shadow:0 8px 24px #0004;font:12px/1.4 system-ui,sans-serif";
      document.body.append(pendingIndicator);
    }
    if (pendingIndicator) pendingIndicator.textContent = draftPreparedId === pending.id
      ? "Transfer context is in the composer. Add your request after CURRENT REQUEST; memories are checked when you send."
      : "Preparing transfer context. If this chat has a draft, clear it to insert the transfer.";
  }

  async function prepareTransferDraft() {
    if (!pending || draftPreparedId === pending.id || preparingDraft) return;
    const input = composer();
    if (!input) {
      if (++draftAttempts < 80) setTimeout(prepareTransferDraft, 250);
      return;
    }
    preparingDraft = true;
    try {
      if (isLegacyRelayDraft(inputText(input))) await clearLegacyDraft(input);
      const existing = inputText(input);
      const existingDraft = globalThis.RELAY_TRANSFER.parseTransferDraft(existing);
      if (existingDraft && normalized(existingDraft.transfer) === normalized(pending.prompt)) {
        draftPreparedId = pending.id;
      } else if (existing.trim() && (!existingDraft || existingDraft.request.trim())) {
        notice("This chat has an existing draft. Clear it to insert the transfer context.");
      } else {
        const draft = globalThis.RELAY_TRANSFER.buildTransferDraft(pending.prompt);
        const inserted = await insertText(input, draft);
        const visibleDraft = globalThis.RELAY_TRANSFER.parseTransferDraft(inputText(input));
        if (inserted || (visibleDraft && normalized(visibleDraft.transfer) === normalized(pending.prompt)))
          draftPreparedId = pending.id;
        else notice("Relay could not insert the transfer context. Press Send after writing your request to retry.");
      }
      updatePendingIndicator();
    } finally {
      preparingDraft = false;
    }
  }

  function confirmSend(input, transfer) {
    if (!transfer || watchingSend) return;
    watchingSend = true;
    const startingUrl = location.href;
    let attempts = 0;
    const check = async () => {
      const currentInput = composer();
      const cleared = !inputText(input).trim() ||
        (input.isConnected === false && currentInput && !inputText(currentInput).trim());
      if (cleared && (hasExistingMessages() || location.href !== startingUrl)) {
        watchingSend = false;
        pending = null;
        draftPreparedId = null;
        updatePendingIndicator();
        try { await chrome.runtime.sendMessage({ type: "COMPLETE_PENDING_TRANSFER", id: transfer.id }); }
        catch { /* Session storage expires automatically if the tab closes. */ }
        return;
      }
      if (++attempts < 60) setTimeout(check, 250);
      else watchingSend = false;
    };
    setTimeout(check, 250);
  }

  async function sendWithContext(input, original) {
    preparing = true;
    const transfer = pending;
    const draft = globalThis.RELAY_TRANSFER.parseTransferDraft(original);
    const request = (draft?.request || globalThis.RELAY_TRANSFER.stripAugmentedPrompt(original)).trim();
    try {
      let selectedMemories = memories;
      let relatedConversations = [];
      try {
        const result = await chrome.runtime.sendMessage({ type: "RAG_RETRIEVE", query: request });
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
        transfer: draft?.transfer || transfer?.prompt || "",
        relatedConversations
      }, request);
      if (combined !== original && !await insertText(input, combined)) {
        await insertText(input, original);
        notice("Relay could not prepare context. Your message was not sent.");
        return;
      }
      const button = sendButton(input);
      if (button) {
        confirmSend(input, transfer);
        replaying = true;
        button.click();
        setTimeout(() => { replaying = false; }, 500);
      } else notice("Context is in the composer. Press Send to finish.");
    } catch {
      notice("Relay could not prepare context. Your message was not sent.");
    } finally { preparing = false; }
  }

  function intercept(event) {
    if (replaying || (pendingLoaded && !pending &&
      (hasExistingMessages() || (!memories.length && !ragEnabled)))) return;
    const input = composer();
    if (!input) return;
    let isSend = false;
    if (event.type === "click") isSend = event.target instanceof Element && event.target.closest("button") === sendButton(input);
    if (event.type === "submit") isSend = event.target instanceof HTMLFormElement && event.target.contains(input);
    if (event.type === "keydown") isSend = event.key === "Enter" && !event.shiftKey && !event.ctrlKey &&
      !event.metaKey && !event.altKey && !event.isComposing && (event.target === input || input.contains(event.target));
    if (!isSend) return;
    const original = inputText(input).trim();
    if (!original) return;
    if (pending && isLegacyRelayDraft(original)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      clearLegacyDraft(input);
      return;
    }
    const draft = globalThis.RELAY_TRANSFER.parseTransferDraft(original);
    if (draft && !draft.request.trim()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      notice("Add your request after CURRENT REQUEST before sending.");
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!preparing) {
      if (pendingLoaded) sendWithContext(input, original);
      else {
        preparing = true;
        refresh().finally(() => {
          preparing = false;
          sendWithContext(input, original);
        });
      }
    }
  }

  document.addEventListener("click", intercept, true);
  document.addEventListener("submit", intercept, true);
  document.addEventListener("keydown", intercept, true);
  document.addEventListener("input", (event) => {
    if (pending && event.target === composer() && !inputText(event.target).trim()) prepareTransferDraft();
  });

  async function refresh() {
    try {
      pending = await chrome.runtime.sendMessage({ type: "GET_PENDING_TRANSFER" });
      if (pending) await prepareTransferDraft();
      memories = await chrome.runtime.sendMessage({ type: "GET_CORE_MEMORIES" }) || [];
      const search = await chrome.runtime.sendMessage({ type: "RAG_STATUS" });
      ragEnabled = !!search?.enabled;
      pendingLoaded = true;
      updatePendingIndicator();
    } catch { pendingLoaded = true; /* Extension may have reloaded. */ }
  }
  refresh();
  setTimeout(refresh, 1000);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.memories || changes.ragEnabled)) refresh();
  });
})();
