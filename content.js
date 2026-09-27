(() => {
  if (globalThis.__relayMemoryContentScript) return;
  globalThis.__relayMemoryContentScript = true;
  const host = location.hostname;
  const service = host.includes("chatgpt") || host.includes("openai")
    ? "ChatGPT"
    : host.includes("claude")
      ? "Claude"
      : "Gemini";

  function cleanText(node) {
    const clone = node.cloneNode(true);
    clone.querySelectorAll("button, svg, script, style, [aria-hidden='true'], #relay-transfer-root, #relay-memory-center-root, #relay-notifications, #relay-pending-transfer").forEach((item) => item.remove());
    clone.querySelectorAll("br").forEach((item) => item.replaceWith("\n"));
    clone.querySelectorAll("p, li, pre, blockquote, h1, h2, h3, h4").forEach((item) => item.append("\n"));
    return (clone.textContent || "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function collect(selector, role) {
    return [...document.querySelectorAll(selector)]
      .map((node) => ({ role, text: cleanText(node), node }))
      .filter((item) => item.text);
  }

  function capture() {
    let found = [];
    let captureMethod = "messages";
    if (service === "ChatGPT") {
      const hasBothRoles = (items) => items.some((item) => item.role === "user") &&
        items.some((item) => item.role === "assistant");
      found = [...document.querySelectorAll("[data-message-author-role]")]
        .map((node) => ({
          role: node.getAttribute("data-message-author-role") === "user" ? "user" : "assistant",
          text: cleanText(node),
          node
        }))
        .filter((item) => item.text);
      if (!hasBothRoles(found)) {
        const fallback = [...document.querySelectorAll("[data-testid^='conversation-turn-'], main article")]
          .map((node) => {
            const text = cleanText(node).replace(/^(You said:|ChatGPT said:)\s*/i, "").trim();
            const label = node.innerText || "";
            const role = /You said:/i.test(label.slice(0, 80)) ? "user" : "assistant";
            return { role, text, node };
          })
          .filter((item) => item.text);
        if (hasBothRoles(fallback)) found = fallback;
        else found.push(...fallback.filter((item) => !found.some((existing) => existing.role === item.role)));
      }
      if (!hasBothRoles(found)) {
        const fallback = [...document.querySelectorAll("h4, [role='heading']")]
          .filter((node) => /^(You said:|ChatGPT said:)$/.test((node.textContent || "").trim()))
          .map((node) => ({
            role: /^You said:/.test(node.textContent.trim()) ? "user" : "assistant",
            text: cleanText(node.parentElement).replace(/^(You said:|ChatGPT said:)\s*/i, "").trim(),
            node: node.parentElement
          }))
          .filter((item) => item.text);
        if (hasBothRoles(fallback)) found = fallback;
        else found.push(...fallback.filter((item) => !found.some((existing) => existing.role === item.role)));
      }
    } else if (service === "Claude") {
      found = [
        ...collect("[data-testid='user-message'], .font-user-message", "user"),
        ...collect("[data-testid='assistant-message'], .font-claude-response", "assistant")
      ];
    } else {
      found = [
        ...collect(".query-text, [data-test-id='user-query']", "user"),
        ...collect("message-content, .model-response-text", "assistant")
      ];
    }

    // Some sites expose both a wrapper and its child as matching nodes.
    found.sort((a, b) => a.node === b.node ? 0 : a.node.compareDocumentPosition(b.node) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    let messages = found.filter((item, index) => {
      const previous = found[index - 1];
      return !(previous && previous.role === item.role && previous.text === item.text &&
        (previous.node.contains(item.node) || item.node.contains(previous.node)));
    }).map(({ role, text }) => ({ role, text }));

    if (!messages.some((item) => item.role === "user") ||
        !messages.some((item) => item.role === "assistant")) {
      const main = document.querySelector("main, [role='main']");
      let pageText = (main?.innerText || document.body.innerText || "").trim();
      if (service === "ChatGPT") {
        const firstTurn = pageText.search(/You said:|ChatGPT said:/i);
        if (firstTurn >= 0) pageText = pageText.slice(firstTurn);
        pageText = pageText.replace(/ChatGPT can make mistakes[\s\S]*$/i, "").trim();
        pageText = pageText.replace(/\nChat with ChatGPT\s*$/i, "").trim();
        const markers = [...pageText.matchAll(/(?:^|\n)(You said:|ChatGPT said:)\s*/gi)];
        if (markers.length) {
          const parsed = markers.map((marker, index) => {
            const end = markers[index + 1]?.index ?? pageText.length;
            const text = pageText.slice(marker.index + marker[0].length, end)
              .replace(/^Memory updated\s*$/gim, "")
              .trim();
            return { role: /^You/i.test(marker[1]) ? "user" : "assistant", text };
          }).filter((message) => message.text);
          if (parsed.some((item) => item.role === "user") &&
              parsed.some((item) => item.role === "assistant")) {
            messages = parsed;
            captureMethod = "accessible text";
          }
        }
      }
      if (!messages.length && pageText.length > 20) {
        messages = [{ role: "context", text: pageText.slice(0, 250000) }];
        captureMethod = "page text";
      }
    }

    return { service, url: location.href, title: document.title, messages, captureMethod };
  }

  function findComposer() {
    const selectors = service === "ChatGPT"
      ? ["#prompt-textarea", "[data-testid='composer-text-input']", "[contenteditable='true'][role='textbox']"]
      : service === "Claude"
        ? ["[data-testid='chat-input'] [contenteditable='true']", ".ProseMirror[contenteditable='true']", "[contenteditable='true'][role='textbox']"]
        : [".ql-editor[contenteditable='true']", "[contenteditable='true'][role='textbox']", "[contenteditable='true']"];
    for (const selector of selectors) {
      const element = [...document.querySelectorAll(selector)].find((node) => node.getClientRects().length);
      if (element) return element;
    }
    return [...document.querySelectorAll("textarea")].find((node) => node.getClientRects().length) || null;
  }

  function matchesPrompt(composer, text) {
    const actual = composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement
      ? composer.value : composer.innerText || composer.textContent || "";
    const normalize = (value) => value.replace(/\u200b/g, "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    return normalize(actual) === normalize(text);
  }

  function selectComposerContents(composer) {
    const range = document.createRange();
    range.selectNodeContents(composer);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function promptHtml(text) {
    const escape = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return text.split("\n").map((line) => `<p>${line ? escape(line) : "<br>"}</p>`).join("");
  }

  async function insertPrompt(text) {
    const composer = findComposer();
    if (!composer) return { ok: false, reason: "Composer not found yet" };
    composer.focus();
    if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
      const prototype = composer instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value").set.call(composer, text);
      composer.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      selectComposerContents(composer);
      const clipboardData = new DataTransfer();
      clipboardData.setData("text/plain", text);
      composer.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData }));
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (!matchesPrompt(composer, text)) {
        composer.focus();
        selectComposerContents(composer);
        document.execCommand("insertHTML", false, promptHtml(text));
        composer.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertFromPaste", data: text }));
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
    return matchesPrompt(composer, text)
      ? { ok: true }
      : { ok: false, reason: "Text mismatch" };
  }

  function chatTheme() {
    const composer = findComposer();
    const style = getComputedStyle(composer || document.body);
    const opaque = (color) => color && color !== "transparent" &&
      !/^rgba\([^)]*,\s*0\s*\)$/.test(color) && !/\/\s*0%?\s*\)$/.test(color);
    let surface = "";
    for (let node = composer; node; node = node.parentElement) {
      const color = getComputedStyle(node).backgroundColor;
      if (opaque(color)) {
        surface = color;
        break;
      }
    }
    surface ||= getComputedStyle(document.body).backgroundColor;
    if (!opaque(surface)) surface = "rgb(255, 255, 255)";
    const pageBackground = [document.body, document.documentElement]
      .map((node) => getComputedStyle(node).backgroundColor).find(opaque) || surface;
    const colorLightness = (color) => {
      const components = color.match(/[-+]?(?:\d*\.)?\d+%?/g) || [];
      if (/^(oklab|oklch)\(/.test(color))
        return parseFloat(components[0]) / (components[0]?.endsWith("%") ? 100 : 1);
      if (/^(lab|lch)\(/.test(color)) return parseFloat(components[0]) / 100;
      if (/^rgb/.test(color) && components.length >= 3) {
        const rgb = components.slice(0, 3).map((value) => parseFloat(value) / (value.endsWith("%") ? 100 : 255));
        return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
      }
      return null;
    };
    const explicitTheme = `${document.documentElement.dataset.theme || ""} ${document.body.dataset.theme || ""}`;
    const colorScheme = getComputedStyle(document.documentElement).colorScheme;
    const dark = /dark/i.test(explicitTheme) || document.documentElement.classList.contains("dark") ||
      document.body.classList.contains("dark") || colorScheme === "dark" ||
      (colorLightness(surface) ?? colorLightness(pageBackground) ?? 1) < .55;
    const radius = Math.min(20, Math.max(12, parseFloat(getComputedStyle(composer?.parentElement || document.body).borderRadius) || 14));
    const accent = dark ? "#8bb4ff" : "#3569d4";
    return {
      service, dark, surface, background: pageBackground, radius: `${radius}px`,
      text: style.color || (dark ? "#f6f7f8" : "#202124"),
      muted: dark ? "#adb5bd" : "#626b75",
      border: dark ? "#555b62" : "#d8dde3",
      accent,
      fontFamily: style.fontFamily || "system-ui, sans-serif"
    };
  }

  let transferHost;
  let transferPanel;
  let transferButton;
  let memoryCenterHost;
  let memoryCenterFocus;
  let mountQueued = false;
  function closeMemoryCenter() {
    memoryCenterHost?.remove();
    memoryCenterHost = null;
    memoryCenterFocus?.focus();
  }

  function openMemoryCenter() {
    if (memoryCenterHost) return closeMemoryCenter();
    const dark = chatTheme().dark;
    memoryCenterFocus = transferHost?.shadowRoot.activeElement || document.activeElement;
    memoryCenterHost = document.createElement("div");
    memoryCenterHost.dataset.dark = String(dark);
    memoryCenterHost.id = "relay-memory-center-root";
    memoryCenterHost.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:16px;";
    const shadow = memoryCenterHost.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>
      :host{all:initial}*{box-sizing:border-box}
      .backdrop{position:absolute;inset:0;background:rgba(16,18,24,.32)}
      .dialog{position:relative;width:min(860px,100%);height:min(680px,calc(100vh - 32px));overflow:hidden;border:1px solid ${dark ? "#44464f" : "#e6e7eb"};border-radius:20px;background:${dark ? "#202126" : "#fff"};box-shadow:0 24px 72px rgba(0,0,0,.20),0 2px 12px rgba(0,0,0,.08)}
      iframe{display:block;width:100%;height:100%;border:0}
    </style><div class="backdrop"></div><div class="dialog" role="dialog" aria-modal="true" aria-label="Memory Center"><iframe title="Memory Center" src="${chrome.runtime.getURL(`sidepanel.html?theme=${dark ? "dark" : "light"}`)}"></iframe></div>`;
    shadow.querySelector(".backdrop").addEventListener("click", closeMemoryCenter);
    document.body.append(memoryCenterHost);
  }
  addEventListener("message", (event) => {
    if (event.origin === `chrome-extension://${chrome.runtime.id}` &&
        event.source === memoryCenterHost?.shadowRoot.querySelector("iframe")?.contentWindow &&
        event.data?.type === "RELAY_CLOSE_MEMORY_CENTER") closeMemoryCenter();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && memoryCenterHost) closeMemoryCenter();
  });
  function composerAnchor(composer) {
    let anchor = composer;
    for (let parent = composer.parentElement, depth = 0; parent && depth < 5; parent = parent.parentElement, depth++) {
      const rect = parent.getBoundingClientRect();
      if (rect.height > 240 || rect.width > innerWidth * 1.1) break;
      if (rect.width >= 250 && rect.height >= 44) anchor = parent;
    }
    return anchor;
  }

  function mountTransferControl() {
    mountQueued = false;
    const composer = findComposer();
    if (!composer) {
      if (transferHost) transferHost.hidden = true;
      return;
    }
    if (!transferHost) {
      transferHost = document.createElement("div");
      transferHost.id = "relay-transfer-root";
      transferHost.style.cssText = "position:fixed;z-index:2147483646;pointer-events:auto;";
      const shadow = transferHost.attachShadow({ mode: "open" });
      shadow.innerHTML = `<style>
        :host{all:initial;color:var(--rt-text);font-family:var(--rt-font);font-size:13px}
        *{box-sizing:border-box}button{font:inherit;cursor:pointer}button:disabled{cursor:not-allowed;opacity:.6}button:focus-visible{outline:2px solid var(--rt-accent);outline-offset:2px}
        .launcher{display:inline-flex;align-items:center;gap:8px;min-height:37px;padding:5px 11px 5px 5px;border:1px solid var(--rt-border);border-radius:10px;background:var(--rt-surface);color:var(--rt-text);box-shadow:0 1px 2px #00000012;white-space:nowrap;transition:background .15s,border-color .15s}
        .launcher:hover,.launcher[aria-expanded="true"]{border-color:var(--rt-accent);background:color-mix(in srgb,var(--rt-accent) 7%,var(--rt-surface))}
        .mark{display:grid;place-items:center;width:26px;height:26px;flex:none;border-radius:8px;background:color-mix(in srgb,var(--rt-accent) 17%,var(--rt-surface));color:var(--rt-accent);font-size:17px;font-weight:700;line-height:1}
        .label{font-size:12px;font-weight:700;letter-spacing:-.01em}.chevron{margin-left:1px;color:var(--rt-muted);font-size:13px}
        .menu{position:absolute;right:0;bottom:calc(100% + 9px);width:min(260px,calc(100vw - 20px));padding:6px;border:1px solid var(--rt-border);border-radius:14px;background:var(--rt-surface);color:var(--rt-text);box-shadow:0 12px 32px #00000026}
        .menu.below{top:calc(100% + 9px);bottom:auto}.menu[hidden],.copy[hidden]{display:none}
        .head{padding:8px 10px;color:var(--rt-muted);font-size:11px;font-weight:600}
        .destinations{display:grid;gap:2px}
        .destination{display:flex;align-items:center;gap:10px;width:100%;min-height:44px;padding:7px 10px;border:0;border-radius:9px;background:transparent;color:var(--rt-text);text-align:left}
        .destination:hover:not(:disabled),.destination:focus-visible,.foot button:hover,.copy:hover{background:color-mix(in srgb,var(--rt-accent) 8%,var(--rt-surface))}
        .destination-copy{min-width:0;flex:1}.destination strong{font-size:13px;font-weight:600}
        .avatar{display:grid;place-items:center;width:28px;height:28px;flex:none;border-radius:8px;background:color-mix(in srgb,var(--rt-accent) 11%,var(--rt-surface));color:var(--rt-accent);font-size:12px;font-weight:700}
        .arrow{color:var(--rt-muted);font-size:14px}.foot{margin-top:6px;padding-top:6px;border-top:1px solid var(--rt-border)}
        .foot button,.copy{width:100%;min-height:34px;padding:7px 10px;border:0;border-radius:8px;background:transparent;color:var(--rt-muted);font-size:12px;text-align:left}
        .status{margin:6px 10px;color:var(--rt-muted);font-size:12px;line-height:1.4;overflow-wrap:anywhere}.status:empty{display:none}.copy{color:var(--rt-accent)}
      </style>
      <button type="button" class="launcher" aria-haspopup="dialog" aria-expanded="false" aria-label="Transfer this chat"><span class="mark" aria-hidden="true">↗</span><span class="label">Transfer</span><span class="chevron" aria-hidden="true">⌄</span></button>
      <section class="menu" role="dialog" aria-label="Transfer chat" hidden><div class="head">Continue conversation in…</div><div class="destinations"></div><div class="foot"><button type="button" class="memory-center">Memory Center →</button></div><p class="status" role="status" aria-live="polite"></p><button type="button" class="copy" hidden>Copy prepared prompt</button></section>`;
      transferButton = shadow.querySelector(".launcher");
      transferPanel = shadow.querySelector(".menu");
      const list = shadow.querySelector(".destinations");
      for (const destination of ["ChatGPT", "Claude", "Gemini"]) {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "destination";
        const avatar = document.createElement("span");
        avatar.className = `avatar service-${destination.toLowerCase()}`;
        avatar.textContent = destination[0];
        const copy = document.createElement("span");
        copy.className = "destination-copy";
        const name = document.createElement("strong");
        name.textContent = destination;
        copy.append(name);
        const arrow = document.createElement("span");
        arrow.className = "arrow";
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = "→";
        row.append(avatar, copy, arrow);
        row.addEventListener("click", () => startInlineTransfer(destination));
        list.append(row);
      }
      transferButton.addEventListener("click", () => {
        transferPanel.hidden = !transferPanel.hidden;
        transferButton.setAttribute("aria-expanded", String(!transferPanel.hidden));
        if (!transferPanel.hidden) {
          shadow.querySelector(".status").textContent = "";
          shadow.querySelector(".copy").hidden = true;
          const result = capture();
          const canTransfer = result.captureMethod !== "page text" && result.messages.some((item) => item.role === "user");
          shadow.querySelectorAll(".destination").forEach((row) => { row.disabled = !canTransfer; });
          if (!canTransfer) shadow.querySelector(".status").textContent = "Start a conversation to transfer it.";
          scheduleTransferControl();

        }
      });
      shadow.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || transferPanel.hidden) return;
        transferPanel.hidden = true;
        transferButton.setAttribute("aria-expanded", "false");
        transferButton.focus();
      });
      document.addEventListener("pointerdown", (event) => {
        if (!transferPanel.hidden && !event.composedPath().includes(transferHost)) {
          transferPanel.hidden = true;
          transferButton.setAttribute("aria-expanded", "false");
        }
      });
      shadow.querySelector(".memory-center").addEventListener("click", () => {
        transferPanel.hidden = true;
        transferButton.setAttribute("aria-expanded", "false");
        openMemoryCenter();
      });
      shadow.querySelector(".copy").addEventListener("click", async (event) => {
        try {
          await navigator.clipboard.writeText(event.currentTarget.dataset.prompt || "");
          shadow.querySelector(".status").textContent = "Prompt copied. Paste it into the destination composer.";
        } catch { shadow.querySelector(".status").textContent = "Copy failed. Select and copy the prompt manually."; }
      });
      document.body.append(transferHost);
    }
    transferHost.hidden = false;
    const theme = chatTheme();
    if (memoryCenterHost && memoryCenterHost.dataset.dark !== String(theme.dark)) {
      memoryCenterHost.dataset.dark = String(theme.dark);
      memoryCenterHost.shadowRoot.querySelector("iframe").contentWindow.postMessage(
        { type: "RELAY_THEME", dark: theme.dark }, `chrome-extension://${chrome.runtime.id}`);
    }
    if (notificationHost) updateNoticeTheme(theme.dark);
    for (const [name, value] of Object.entries({
      "--rt-bg": theme.dark ? "#202126" : "#f6f6f8",
      "--rt-surface": theme.dark ? "#2b2c32" : "#ffffff",
      "--rt-text": theme.dark ? "#f4f4f6" : "#202127",
      "--rt-muted": theme.dark ? "#b6b7c0" : "#646772",
      "--rt-border": theme.dark ? "#3c3d45" : "#e6e7eb", "--rt-accent": theme.accent,
      "--rt-font": "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      "--rt-radius": theme.radius, "--rt-accent-text": theme.dark ? "#17202a" : "#ffffff"
    })) transferHost.style.setProperty(name, value);
    const rect = composerAnchor(composer).getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth) {
      transferHost.hidden = true;
      return;
    }
    const top = rect.top >= 46 ? rect.top - 45 : rect.bottom + 8;
    const buttonTop = Math.max(8, Math.min(innerHeight - 45, Math.round(top)));
    transferHost.style.top = `${buttonTop}px`;
    transferHost.style.right = `${Math.max(8, Math.round(innerWidth - rect.right + 8))}px`;
    const spaceAbove = buttonTop - 14;
    const spaceBelow = innerHeight - buttonTop - 55;
    const below = spaceBelow > spaceAbove;
    transferPanel.classList.toggle("below", below);
    // Keep the short selector intact, shifting it inside the viewport when needed.
    transferPanel.style.transform = "";
    if (!transferPanel.hidden) {
      const menuRect = transferPanel.getBoundingClientRect();
      const shift = menuRect.top < 8 ? 8 - menuRect.top : Math.min(0, innerHeight - 8 - menuRect.bottom);
      if (shift) transferPanel.style.transform = `translateY(${shift}px)`;
    }
  }

  function scheduleTransferControl() {
    if (mountQueued) return;
    mountQueued = true;
    requestAnimationFrame(mountTransferControl);
  }

  function transferErrorMessage(error) {
    const message = error?.message || "";
    if (/extension context invalidated/i.test(message)) {
      return "Relay was reloaded while this chat was open. Reload this chat tab, then try Transfer again.";
    }
    return message || "Transfer failed.";
  }

  async function startInlineTransfer(destination) {
    const shadow = transferHost.shadowRoot;
    const status = shadow.querySelector(".status");
    const copy = shadow.querySelector(".copy");
    const rows = shadow.querySelectorAll(".destination");
    const result = capture();
    if (result.captureMethod === "page text" || !result.messages.some((item) => item.role === "user")) {
      status.textContent = "Could not read this chat automatically. Try a different conversation.";
      return;
    }
    rows.forEach((row) => { row.disabled = true; });
    copy.hidden = true;
    status.textContent = `Continuing in ${destination}…`;
    try {
      const reply = await chrome.runtime.sendMessage({ type: "INLINE_TRANSFER", destination, capture: result });
      status.textContent = reply?.ok ? `Continuing in ${destination}…` :
        (reply?.message || "Transfer failed.");
      if (reply?.ok) {
        transferPanel.hidden = true;
        transferButton.setAttribute("aria-expanded", "false");
      }
      if (reply?.prompt) {
        copy.dataset.prompt = reply.prompt;
        copy.hidden = false;
      }
    } catch (error) { status.textContent = transferErrorMessage(error); }
    finally { rows.forEach((row) => { row.disabled = false; }); }
  }

  let autoTimer;
  let autoFirstChangeAt = 0;
  let lastAutoSignature = "";
  let failedAutoSignature = "";
  let autoRetryAfter = 0;
  let autoSending = false;
  let autoMemoryToast = null;
  let autoMemoryToastTimer = null;
  let lastNotifiedMemoryIds = "";
  let lastAlreadySavedText = "";
  let notificationHost;
  function mountNotice(toast) {
    if (!notificationHost?.isConnected) {
      notificationHost = document.createElement("div");
      notificationHost.id = "relay-notifications";
      notificationHost.style.cssText = "position:fixed;top:76px;right:18px;z-index:2147483646;width:min(360px,calc(100vw - 36px));max-height:calc(100vh - 94px);overflow:auto;pointer-events:none";
      notificationHost.attachShadow({ mode: "open" }).innerHTML = `<style>
        :host{all:initial}*{box-sizing:border-box}.stack{display:grid;gap:10px;padding:2px 2px 16px}
        .notice{position:relative;padding:14px;border:1px solid var(--rn-border);border-radius:14px;background:var(--rn-surface);color:var(--rn-text);box-shadow:0 6px 22px #0002;font:13px/1.5 system-ui,sans-serif;pointer-events:auto;overflow-wrap:anywhere}
        .notice[hidden]{display:none!important}button{cursor:pointer}button:focus-visible{outline:2px solid var(--rn-accent);outline-offset:3px}
        .dismiss{float:right;display:grid;place-items:center;width:28px;height:28px;margin:-5px -5px 2px 8px;border:0;border-radius:7px;background:transparent;color:var(--rn-muted);font:20px/1 system-ui}
        .dismiss:hover{background:var(--rn-track)}.label{display:block;margin-bottom:5px;color:var(--rn-muted);font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase}
      </style><div class="stack"></div>`;
      document.body.append(notificationHost);
    }
    updateNoticeTheme(chatTheme().dark);
    toast.classList.add("notice");
    notificationHost.shadowRoot.querySelector(".stack").append(toast);
  }
  function updateNoticeTheme(dark) {
    const palette = dark
      ? { surface: "#2b2c32", text: "#f4f4f6", muted: "#b6b7c0", border: "#44454e", accent: "#8bb4ff", track: "#41434d", error: "#ffb4ae" }
      : { surface: "#ffffff", text: "#202127", muted: "#646772", border: "#dedfe5", accent: "#3569d4", track: "#e9edf5", error: "#ad4742" };
    for (const [name, value] of Object.entries(palette)) notificationHost.style.setProperty(`--rn-${name}`, value);
  }
  function notice(message) {
    const toast = document.createElement("div");
    toast.setAttribute("role", "status");
    const dismiss = document.createElement("button");
    dismiss.className = "dismiss";
    dismiss.type = "button";
    dismiss.textContent = "×";
    dismiss.setAttribute("aria-label", "Dismiss Relay notification");
    dismiss.addEventListener("click", () => toast.remove());
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = "Relay";
    const detail = document.createElement("div");
    detail.textContent = message;
    toast.append(dismiss, label, detail);
    mountNotice(toast);
    setTimeout(() => toast.remove(), 6000);
  }
  globalThis.RELAY_UI = { mountNotice, notice };
  function showAlreadySavedToast(text) {
    if (!text || text === lastAlreadySavedText) return;
    lastAlreadySavedText = text;
    notice("This memory is already saved.");
  }
  function showAutoMemoryToast(saved) {
    if (!Array.isArray(saved) || !saved.length) return;
    const ids = saved.map((item) => item.id).join("|");
    if (ids === lastNotifiedMemoryIds) return;
    lastNotifiedMemoryIds = ids;
    autoMemoryToast?.remove();
    clearInterval(autoMemoryToastTimer);
    const toast = document.createElement("div");
    autoMemoryToast = toast;
    toast.setAttribute("role", "status");
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = "Relay · Automatic memory";
    const title = document.createElement("strong");
    title.style.cssText = "display:block;font-size:13px;margin-bottom:9px";
    title.textContent = saved.length === 1 ? "Memory added" : `${saved.length} memories added`;
    const details = document.createElement("div");
    details.style.cssText = "display:grid;gap:9px;max-height:240px;overflow:auto";
    for (const item of saved.slice(0, 3)) {
      const entry = document.createElement("div");
      entry.style.cssText = "border-left:2px solid var(--rn-accent);padding-left:9px";
      const fact = document.createElement("div");
      fact.style.cssText = "font-weight:650;overflow-wrap:anywhere";
      fact.textContent = item.text;
      entry.append(fact);
      if (item.quote) {
        const source = document.createElement("div");
        source.style.cssText = "margin-top:3px;color:var(--rn-muted);overflow-wrap:anywhere";
        source.textContent = `Because you said “${item.quote}”`;
        entry.append(source);
      }
      if (item.reason) {
        const reason = document.createElement("div");
        reason.style.cssText = "margin-top:3px;color:var(--rn-muted);overflow-wrap:anywhere";
        reason.textContent = item.reason;
        entry.append(reason);
      }
      details.append(entry);
    }
    if (saved.length > 3) {
      const more = document.createElement("div");
      more.style.color = "var(--rn-muted)";
      more.textContent = `And ${saved.length - 3} more ${saved.length === 4 ? "memory" : "memories"}`;
      details.append(more);
    }
    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:11px";
    const countdown = document.createElement("span");
    countdown.style.color = "var(--rn-muted)";
    const undo = document.createElement("button");
    undo.type = "button";
    undo.textContent = saved.length === 1 ? "Undo" : "Undo all";
    undo.style.cssText = "border:0;background:none;color:var(--rn-accent);font:700 12px system-ui,sans-serif;cursor:pointer;padding:6px 2px";
    const errorNote = document.createElement("div");
    errorNote.style.cssText = "color:var(--rn-error);margin-top:5px";
    const track = document.createElement("div");
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-label", "Seconds left to undo");
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", "10");
    track.style.cssText = "height:4px;margin-top:10px;border-radius:99px;overflow:hidden;background:var(--rn-track)";
    const bar = document.createElement("div");
    bar.style.cssText = "height:100%;width:100%;background:var(--rn-accent);transform-origin:left";
    track.append(bar);
    const deadline = Date.now() + 10000;
    let finished = false;
    let undoPending = false;
    let timer;
    const close = () => {
      clearInterval(timer);
      toast.remove();
      if (autoMemoryToast === toast) {
        autoMemoryToast = null;
        autoMemoryToastTimer = null;
      }
    };
    const finish = () => {
      if (finished) return;
      finished = true;
      clearInterval(timer);
      if (autoMemoryToast === toast) autoMemoryToastTimer = null;
      title.textContent = saved.length === 1 ? "Saved in Relay" : `${saved.length} memories saved in Relay`;
      countdown.textContent = "Undo window ended";
      undo.remove();
      track.remove();
      setTimeout(close, 2000);
    };
    const tick = () => {
      const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      countdown.textContent = `Undo available for ${seconds}s`;
      track.setAttribute("aria-valuenow", String(seconds));
      if (!seconds && !undoPending) finish();
    };
    undo.addEventListener("click", async () => {
      if (finished || undoPending) return;
      if (Date.now() >= deadline) return finish();
      undoPending = true;
      undo.disabled = true;
      try {
        const result = await chrome.runtime.sendMessage({ type: "UNDO_AUTO_MEMORIES", ids: saved.map((item) => item.id) });
        if (!result?.ok) throw new Error("Undo was unavailable.");
        finished = true;
        title.textContent = saved.length === 1 ? "Memory removed" : "Memories removed";
        countdown.textContent = "Removed from Relay";
        actions.remove();
        track.remove();
        clearInterval(timer);
        if (autoMemoryToast === toast) autoMemoryToastTimer = null;
        setTimeout(close, 2000);
      } catch {
        undoPending = false;
        undo.disabled = false;
        errorNote.textContent = "Could not undo. You can remove it in Memory Center.";
        if (Date.now() >= deadline) finish();
      }
    });
    actions.append(countdown, undo);
    toast.append(label, title, details, actions, errorNote, track);
    mountNotice(toast);
    tick();
    bar.animate([{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }],
      { duration: 10000, easing: "linear", fill: "forwards" });
    timer = setInterval(tick, 250);
    autoMemoryToastTimer = timer;
  }
  function showAutoMemoryError() {
    notice("Could not save a memory. Open Privacy & data in Memory Center for details.");
  }
  async function sendAutoCapture() {
    if (autoSending) { scheduleAutoCapture(5000); return; }
    autoSending = true;
    try {
      const status = await chrome.runtime.sendMessage({ type: "AUTO_MEMORY_STATUS" });
      if (!status?.enabled) {
        lastAutoSignature = "";
        failedAutoSignature = "";
        return;
      }
      const result = capture();
      if (result.captureMethod === "page text" || !result.messages.some((item) => item.role === "user") ||
          !result.messages.some((item) => item.role === "assistant")) return;
      const signature = result.url + JSON.stringify(result.messages);
      if (signature === lastAutoSignature) return;
      if (signature === failedAutoSignature && Date.now() < autoRetryAfter) return;
      const reply = await chrome.runtime.sendMessage({ type: "AUTO_MEMORY_CAPTURE", capture: result });
      if (["processed", "unchanged", "already_saved"].includes(reply?.status)) {
        lastAutoSignature = signature;
        failedAutoSignature = "";
      }
      if (reply?.status === "processed" && reply.saved?.length) showAutoMemoryToast(reply.saved);
      if (reply?.status === "already_saved") showAlreadySavedToast(reply.text);
      if (reply?.status === "error") {
        failedAutoSignature = signature;
        autoRetryAfter = Date.now() + 60000;
        showAutoMemoryError();
      }
      if (reply?.status === "busy") scheduleAutoCapture(15000);
    } catch { /* Extension may have been reloaded while this tab was open. */ }
    finally { autoSending = false; }
  }

  function scheduleAutoCapture(delay = 5000) {
    const now = Date.now();
    if (!autoFirstChangeAt) autoFirstChangeAt = now;
    const wait = Math.max(0, Math.min(delay, 20000 - (now - autoFirstChangeAt)));
    clearTimeout(autoTimer);
    autoTimer = setTimeout(() => {
      autoTimer = null;
      autoFirstChangeAt = 0;
      sendAutoCapture();
    }, wait);
  }

  if (document.body) {
    const themeObserver = new MutationObserver(scheduleTransferControl);
    for (const node of [document.documentElement, document.body])
      themeObserver.observe(node, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
    new MutationObserver(() => { scheduleAutoCapture(); scheduleTransferControl(); }).observe(document.body, {
      subtree: true, childList: true, characterData: true
    });
    scheduleAutoCapture();
    scheduleTransferControl();
    addEventListener("scroll", scheduleTransferControl, true);
    addEventListener("resize", scheduleTransferControl);
    setInterval(() => { if (!autoTimer) scheduleAutoCapture(); scheduleTransferControl(); }, 30000);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "TOGGLE_MEMORY_CENTER") {
      openMemoryCenter();
      sendResponse({ ok: true });
    }
    if (message.type === "CAPTURE") sendResponse(capture());
    if (message.type === "GET_CHAT_THEME") sendResponse(chatTheme());
    if (message.type === "AUTO_MEMORY_SAVED") {
      showAutoMemoryToast(message.saved);
      sendResponse({ ok: true });
    }
    if (message.type === "AUTO_MEMORY_ALREADY_SAVED") {
      showAlreadySavedToast(message.text);
      sendResponse({ ok: true });
    }
    if (message.type === "RESCAN_AUTO_MEMORY") {
      lastAutoSignature = "";
      failedAutoSignature = "";
      scheduleAutoCapture(500);
      sendResponse({ ok: true });
    }
    if (message.type === "INSERT_PROMPT") {
      insertPrompt(message.text).then(sendResponse).catch((error) => sendResponse({ ok: false, reason: error.message }));
      return true;
    }
  });
})();
