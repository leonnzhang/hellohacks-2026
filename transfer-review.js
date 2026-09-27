(() => {
  if (globalThis.__relayTransferReview) return;
  globalThis.__relayTransferReview = true;

  let pending = null;
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
    badge.textContent = "Relay context ready for your first message";
    document.body.append(badge);
  }

  function reviewSend(input, original) {
    if (reviewing || !pending) return;
    reviewing = true;
    const transfer = pending;
    const combined = globalThis.RELAY_TRANSFER.buildAugmentedPrompt(transfer.prompt, original);
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:#0009;display:grid;place-items:center;padding:16px";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>
      *{box-sizing:border-box}section{width:min(680px,100%);max-height:min(85vh,800px);display:flex;flex-direction:column;gap:12px;padding:20px;border-radius:16px;background:#fff;color:#202124;box-shadow:0 20px 60px #0006;font:13px system-ui,sans-serif}
      h2{margin:0;font-size:17px}p{margin:0;line-height:1.5;color:#4b5563}textarea{width:100%;min-height:180px;flex:1;resize:vertical;padding:12px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;color:#111827;font:12px/1.5 ui-monospace,monospace}
      .actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px}button{padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px;background:white;color:#202124;cursor:pointer;font:inherit}button.primary{border-color:#26313d;background:#26313d;color:white}button:disabled{opacity:.5;cursor:wait}.error{color:#a12525}
    </style><section role="dialog" aria-modal="true" aria-labelledby="relay-review-title">
      <h2 id="relay-review-title">Review what ${location.hostname} will receive</h2>
      <p>Relay will add your saved context to this message. The combined text will appear in the chat history.</p>
      <textarea readonly aria-label="Complete outgoing message"></textarea>
      <p class="error" role="status" hidden></p>
      <div class="actions"><button type="button" data-action="cancel">Cancel</button><button type="button" data-action="original">Send without context</button><button type="button" data-action="copy">Copy combined message</button><button type="button" class="primary" data-action="context">Send with context</button></div>
    </section>`;
    shadow.querySelector("textarea").value = combined;
    document.body.append(host);
    activeReviewHost = host;
    const buttons = [...shadow.querySelectorAll("button")];
    const error = shadow.querySelector(".error");
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
      try { await navigator.clipboard.writeText(combined); }
      catch { showError("Could not copy. Select the text above to copy it manually."); }
    });
    for (const action of ["original", "context"]) {
      shadow.querySelector(`[data-action='${action}']`).addEventListener("click", async () => {
        buttons.forEach((button) => { button.disabled = true; });
        if (inputText(input).trim() !== original) return showError("The draft changed. Close this review and send again.");
        if (action === "context" && !await insertText(input, combined)) {
          const restored = await insertText(input, original);
          return showError(restored
            ? "Could not place the complete message in the composer. Nothing was sent."
            : "Could not place the complete message in the composer. Nothing was sent; check the composer before retrying.");
        }
        const reply = await chrome.runtime.sendMessage({ type: "COMPLETE_PENDING_TRANSFER", id: transfer.id });
        if (!reply?.ok) {
          if (action === "context") await insertText(input, original);
          return showError("The transfer expired. Nothing was sent; close this review and try again.");
        }
        pending = null;
        removeBadge();
        close();
        replay();
      });
    }
  }

  function intercept(event) {
    if (!pending || reviewing || replaying) return;
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

  async function arm() {
    for (let attempt = 0; attempt < 5; attempt++) {
      try { pending = await chrome.runtime.sendMessage({ type: "GET_PENDING_TRANSFER" }); }
      catch { return; }
      if (pending) { showBadge(); return; }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  arm();
})();
