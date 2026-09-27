(() => {
  if (globalThis.__relayTransferReview) return;
  globalThis.__relayTransferReview = true;

  let pending = null;
  let memories = [];
  let ragEnabled = false;
  let useMemories = true;
  let useTransfer = true;
  let useRelated = true;
  let enabledMemoryIds = null;
  let reviewing = false;
  let replaying = false;
  let badge = null;
  let activeReviewHost = null;
  let activeReviewClose = null;

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

  function isSendClick(target, input) {
    const button = target instanceof Element ? target.closest("button") : null;
    return button && button === sendButton(input);
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

  function removeBadge() {
    badge?.remove();
    badge = null;
  }

  function showBadge() {
    if (badge || !document.body) return;
    badge = document.createElement("div");
    badge.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483646;padding:9px 12px;border-radius:10px;background:#26313d;color:white;font:12px system-ui,sans-serif;box-shadow:0 3px 16px #0005";
    badge.textContent = `Relay: Core memories ${memories.length ? (useMemories ? "on" : "off") + " (" + memories.length + ")" : "none"} · Search ${ragEnabled ? "on" : "off"} · Transfer ${pending ? (useTransfer ? "on" : "off") : "none"}`;
    badge.title = "Click to choose which context to include when sending";
    badge.style.cursor = "pointer";
    badge.addEventListener("click", () => { const input = composer(); if (input?.textContent || input?.value) reviewSend(input, inputText(input).trim()); });
    document.body.append(badge);
  }

  function hasExistingMessages() {
    const messageSelectors = ["[data-message-author-role]", "[data-testid^='conversation-turn-']",
      "[data-testid='user-message']", "[data-testid='assistant-message']", ".font-user-message",
      ".font-claude-response", ".query-text", "[data-test-id='user-query']", "message-content", ".model-response-text"];
    return messageSelectors.some((selector) => [...document.querySelectorAll(selector)]
      .some((node) => (node.innerText || node.textContent || "").trim()));
  }

  async function reviewSend(input, original) {
    if (reviewing || (!pending && !memories.length && (!ragEnabled || hasExistingMessages()))) return;
    reviewing = true;
    const transfer = pending;
    let reviewMemories = memories;
    let relatedConversations = [];
    let ragError = "";
    if (transfer || !hasExistingMessages()) {
      try {
        const result = await chrome.runtime.sendMessage({ type: "RAG_RETRIEVE", query: original });
        if (result?.ragUsed) {
          reviewMemories = Array.isArray(result.memories) ? result.memories.slice(0, 7) : memories;
          relatedConversations = Array.isArray(result.relatedConversations) ? result.relatedConversations : [];
        }
        ragError = result?.ragError || "";
        if (!transfer && !memories.length && !reviewMemories.length && !relatedConversations.length && !ragError && sendButton(input)) {
          reviewing = false;
          replaying = true;
          sendButton(input)?.click();
          setTimeout(() => { replaying = false; }, 500);
          return;
        }
      } catch (error) { ragError = error?.message || "Semantic search could not run."; }
    }
    let selectedMemories = useMemories && reviewMemories.length > 0;
    const selectedIds = new Set(enabledMemoryIds || reviewMemories.map((memory, index) => memory.id || String(index)));
    selectedMemories = selectedMemories && selectedIds.size > 0;
    let selectedTransfer = useTransfer && !!transfer;
    let selectedRelated = useRelated && relatedConversations.length > 0;
    const combinedText = () => globalThis.RELAY_TRANSFER.buildSendPrompt({
      memories: selectedMemories ? reviewMemories.filter((memory, index) => selectedIds.has(memory.id || String(index))) : [],
      transfer: selectedTransfer ? transfer?.prompt || "" : "",
      relatedConversations: selectedRelated ? relatedConversations : []
    }, original);
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:#0009;display:grid;place-items:center;padding:16px";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>
      *{box-sizing:border-box}section{width:min(680px,100%);max-height:min(85vh,800px);display:flex;flex-direction:column;gap:12px;padding:20px;border-radius:16px;background:#fff;color:#202124;box-shadow:0 20px 60px #0006;font:13px system-ui,sans-serif}
      h2{margin:0;font-size:17px}p{margin:0;line-height:1.5;color:#4b5563}textarea{width:100%;min-height:180px;flex:1;resize:vertical;padding:12px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;color:#111827;font:12px/1.5 ui-monospace,monospace}
      label{display:flex;align-items:center;gap:8px;cursor:pointer} .choices{display:grid;gap:8px;padding:8px 0;max-height:32vh;overflow:auto} .actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px}button{padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px;background:white;color:#202124;cursor:pointer;font:inherit}button.primary{border-color:#26313d;background:#26313d;color:white}button:disabled{opacity:.5;cursor:wait}.error{color:#a12525}
    </style><section role="dialog" aria-modal="true" aria-labelledby="relay-review-title">
      <h2 id="relay-review-title">Review what ${location.hostname} will receive</h2>
      <p>Choose context for this message. Review the exact text below before sending; it will appear in the chat history.</p>
      <div class="choices"><label><input type="checkbox" data-choice="memories"> Core memories (<span data-count></span>)</label><div data-memory-list style="display:grid;gap:6px;padding-left:24px"></div><label data-related-row hidden><input type="checkbox" data-choice="related"> Related saved chat excerpts (<span data-related-count></span>)</label><label data-transfer-row><input type="checkbox" data-choice="transfer"> Transferred conversation (first message only)</label></div>
      <textarea readonly aria-label="Complete outgoing message"></textarea>
      <p class="error" role="status" hidden></p>
      <div class="actions"><button type="button" data-action="cancel">Cancel</button><button type="button" data-action="original">Send without context</button><button type="button" data-action="copy">Copy combined message</button><button type="button" class="primary" data-action="context">Send with context</button></div>
    </section>`;
    const preview = shadow.querySelector("textarea");
    const memoryChoice = shadow.querySelector("[data-choice=memories]");
    const transferChoice = shadow.querySelector("[data-choice=transfer]");
    shadow.querySelector("[data-count]").textContent = reviewMemories.length;
    memoryChoice.disabled = !reviewMemories.length;
    const memoryList = shadow.querySelector("[data-memory-list]");
    reviewMemories.forEach((memory, index) => {
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = selectedMemories && selectedIds.has(memory.id || String(index));
      const id = memory.id || String(index);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) selectedIds.add(id); else selectedIds.delete(id);
        enabledMemoryIds = new Set(selectedIds);
        memoryChoice.checked = selectedIds.size > 0;
        selectedMemories = memoryChoice.checked;
        useMemories = selectedMemories;
        updatePreview();
      });
      label.append(checkbox, document.createTextNode(memory.text));
      memoryList.append(label);
    });
    memoryChoice.checked = selectedMemories;
    shadow.querySelector("[data-transfer-row]").hidden = !transfer;
    transferChoice.checked = selectedTransfer;
    const relatedChoice = shadow.querySelector("[data-choice=related]");
    shadow.querySelector("[data-related-count]").textContent = relatedConversations.length;
    shadow.querySelector("[data-related-row]").hidden = !relatedConversations.length;
    relatedChoice.checked = selectedRelated;
    const updatePreview = () => { preview.value = combinedText(); };
    memoryChoice.addEventListener("change", () => {
      selectedMemories = memoryChoice.checked; useMemories = selectedMemories;
      selectedIds.clear();
      memoryList.querySelectorAll("input").forEach((checkbox, index) => {
        checkbox.checked = selectedMemories;
        if (selectedMemories) selectedIds.add(reviewMemories[index].id || String(index));
      });
      enabledMemoryIds = new Set(selectedIds);
      updatePreview();
    });
    transferChoice.addEventListener("change", () => { selectedTransfer = transferChoice.checked; useTransfer = selectedTransfer; updatePreview(); });
    relatedChoice.addEventListener("change", () => { selectedRelated = relatedChoice.checked; useRelated = selectedRelated; updatePreview(); });
    updatePreview();
    document.body.append(host);
    activeReviewHost = host;
    const buttons = [...shadow.querySelectorAll("button")];
    const error = shadow.querySelector(".error");
    if (ragError) { error.textContent = `Semantic search unavailable; saved core memories remain available. ${ragError}`; error.hidden = false; }
    const close = () => { host.remove(); reviewing = false; activeReviewHost = null; activeReviewClose = null; };
    activeReviewClose = close;
    shadow.querySelector("[data-action='cancel']").focus();
    const showError = (message) => { error.textContent = message; error.hidden = false; buttons.forEach((button) => { button.disabled = false; }); };
    const replay = () => {
      replaying = true;
      const button = sendButton(input);
      if (button) button.click();
      else {
        badge = document.createElement("div");
        badge.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483646;padding:9px 12px;border-radius:10px;background:#26313d;color:white;font:12px system-ui,sans-serif;box-shadow:0 3px 16px #0005";
        badge.textContent = "Context is in the composer. Press Send to finish.";
        document.body.append(badge);
        setTimeout(removeBadge, 6000);
      }
      setTimeout(() => { replaying = false; }, 500);
    };
    shadow.querySelector("[data-action='cancel']").addEventListener("click", close);
    shadow.querySelector("[data-action='copy']").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(combinedText()); }
      catch { showError("Could not copy. Select the text above to copy it manually."); }
    });
    for (const action of ["original", "context"]) {
      shadow.querySelector(`[data-action='${action}']`).addEventListener("click", async () => {
        buttons.forEach((button) => { button.disabled = true; });
        if (inputText(input).trim() !== original) return showError("The draft changed. Close this review and send again.");
        if (action === "context" && !await insertText(input, combinedText())) {
          const restored = await insertText(input, original);
          return showError(restored
            ? "Could not place the complete message in the composer. Nothing was sent."
            : "Could not place the complete message in the composer. Nothing was sent; check the composer before retrying.");
        }
        if (transfer && (action === "original" || selectedTransfer)) {
          const reply = await chrome.runtime.sendMessage({ type: "COMPLETE_PENDING_TRANSFER", id: transfer.id });
          if (!reply?.ok) {
            if (action === "context") await insertText(input, original);
            return showError("The transfer expired. Nothing was sent; close this review and try again.");
          }
          pending = null;
        }
        removeBadge();
        showBadge();
        close();
        replay();
      });
    }
  }

  function intercept(event) {
    if ((!pending && !memories.length && (!ragEnabled || hasExistingMessages())) || reviewing || replaying) return;
    const input = composer();
    if (!input) return;
    let isSend = false;
    if (event.type === "click") isSend = isSendClick(event.target, input);
    if (event.type === "submit") isSend = event.target instanceof HTMLFormElement && event.target.contains(input);
    if (event.type === "keydown") isSend = event.key === "Enter" && !event.shiftKey && !event.ctrlKey &&
      !event.metaKey && !event.altKey && !event.isComposing && (event.target === input || input.contains(event.target));
    if (!isSend) return;
    const original = inputText(input).trim();
    if (!original) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    reviewSend(input, original);
  }

  document.addEventListener("keydown", (event) => {
    if (!reviewing || !activeReviewHost || !["Enter", "Escape"].includes(event.key)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.key === "Escape") activeReviewClose?.();
    else if (activeReviewHost.shadowRoot.activeElement instanceof HTMLButtonElement)
      activeReviewHost.shadowRoot.activeElement.click();
  }, true);

  document.addEventListener("click", intercept, true);
  document.addEventListener("submit", intercept, true);
  document.addEventListener("keydown", intercept, true);

  async function refresh() {
    try {
      memories = await chrome.runtime.sendMessage({ type: "GET_CORE_MEMORIES" }) || [];
      pending = await chrome.runtime.sendMessage({ type: "GET_PENDING_TRANSFER" });
      const search = await chrome.runtime.sendMessage({ type: "RAG_STATUS" });
      ragEnabled = !!search?.enabled;
      removeBadge();
      if (memories.length || pending || ragEnabled) showBadge();
    } catch { /* Extension may have reloaded. */ }
  }
  refresh();
  setTimeout(refresh, 1000);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.memories || changes.ragEnabled)) refresh();
  });
})();
