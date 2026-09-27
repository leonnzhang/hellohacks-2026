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
    clone.querySelectorAll("button, svg, script, style, [aria-hidden='true'], #relay-transfer-root, #relay-memory-center-root").forEach((item) => item.remove());
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
      found = [...document.querySelectorAll("[data-message-author-role]")]
        .map((node) => ({
          role: node.getAttribute("data-message-author-role") === "user" ? "user" : "assistant",
          text: cleanText(node),
          node
        }))
        .filter((item) => item.text);
      if (!found.length) {
        found = [...document.querySelectorAll("[data-testid^='conversation-turn-'], main article")]
          .map((node) => {
            const text = cleanText(node).replace(/^(You said:|ChatGPT said:)\s*/i, "").trim();
            const label = node.innerText || "";
            const role = /You said:/i.test(label.slice(0, 80)) ? "user" : "assistant";
            return { role, text, node };
          })
          .filter((item) => item.text);
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

    if (!messages.length) {
      const main = document.querySelector("main, [role='main']");
      let pageText = (main?.innerText || document.body.innerText || "").trim();
      if (service === "ChatGPT") {
        const firstTurn = pageText.search(/You said:|ChatGPT said:/i);
        if (firstTurn >= 0) pageText = pageText.slice(firstTurn);
        pageText = pageText.replace(/ChatGPT can make mistakes[\s\S]*$/i, "").trim();
        const markers = [...pageText.matchAll(/(?:^|\n)(You said:|ChatGPT said:)\s*/gi)];
        if (markers.length) {
          messages = markers.map((marker, index) => {
            const end = markers[index + 1]?.index ?? pageText.length;
            const text = pageText.slice(marker.index + marker[0].length, end)
              .replace(/^Memory updated\s*$/gim, "")
              .trim();
            return { role: /^You/i.test(marker[1]) ? "user" : "assistant", text };
          }).filter((message) => message.text);
          captureMethod = "accessible text";
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
    const opaque = (color) => color && !/^(transparent|rgba?\(0,\s*0,\s*0,\s*0\))$/.test(color);
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
    const rgb = surface.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number) || [255, 255, 255];
    const dark = (rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722) < 130;
    const radius = Math.min(20, Math.max(12, parseFloat(getComputedStyle(composer?.parentElement || document.body).borderRadius) || 14));
    const accent = service === "Claude" ? (dark ? "#e6a681" : "#a04f2d")
      : service === "Gemini" ? (dark ? "#9bbcff" : "#315fbe")
        : (dark ? "#dce3eb" : "#26313d");
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
  let mountQueued = false;
  function closeMemoryCenter() {
    memoryCenterHost?.remove();
    memoryCenterHost = null;
  }

  function openMemoryCenter() {
    if (memoryCenterHost) return closeMemoryCenter();
    memoryCenterHost = document.createElement("div");
    memoryCenterHost.id = "relay-memory-center-root";
    memoryCenterHost.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:16px;";
    const shadow = memoryCenterHost.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>
      :host{all:initial}*{box-sizing:border-box}
      .backdrop{position:absolute;inset:0;background:rgba(16,18,24,.18)}
      .dialog{position:relative;width:min(780px,100%);height:min(580px,calc(100vh - 32px));overflow:hidden;border:1px solid rgba(255,255,255,.24);border-radius:20px;background:#fff;box-shadow:0 24px 72px rgba(0,0,0,.20),0 2px 12px rgba(0,0,0,.08)}
      iframe{display:block;width:100%;height:100%;border:0}
    </style><div class="backdrop"></div><div class="dialog" role="dialog" aria-modal="true" aria-label="Memory Center"><iframe title="Memory Center" src="${chrome.runtime.getURL("sidepanel.html")}"></iframe></div>`;
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
    // The editable region (including Claude's chat-input) can sit well inside
    // the visible rounded composer. Anchor outside that surface, not its text.
    const inputRect = composer.getBoundingClientRect();
    let surface = null;
    for (let parent = composer.parentElement, depth = 0; parent && depth < 10; parent = parent.parentElement, depth++) {
      if (parent === document.body || parent === document.documentElement) break;
      const rect = parent.getBoundingClientRect();
      if (rect.width > innerWidth * .98 || rect.height > Math.max(360, innerHeight * .7)) break;
      if (rect.width < inputRect.width || rect.height < inputRect.height) continue;
      const style = getComputedStyle(parent);
      const rounded = parseFloat(style.borderTopLeftRadius) >= 8;
      const bordered = [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth]
        .some((value) => parseFloat(value) > 0);
      const painted = style.backgroundColor && !["transparent", "rgba(0, 0, 0, 0)"].includes(style.backgroundColor);
      if (rounded && (bordered || painted || (style.boxShadow && style.boxShadow !== "none"))) surface = parent;
    }
    if (surface) return surface;
    const selector = service === "ChatGPT" ? "[data-testid='composer'], form"
      : service === "Claude" ? "fieldset, form"
        : "input-container, .input-area-container, .input-area";
    const container = composer.closest(selector);
    if (container && container.getBoundingClientRect().height < innerHeight * .65) return container;
    let anchor = composer;
    for (let parent = composer.parentElement, depth = 0; parent && depth < 5; parent = parent.parentElement, depth++) {
      const rect = parent.getBoundingClientRect();
      if (rect.height > 240 || rect.width > innerWidth * 1.1) break;
      if (rect.width >= 250 && rect.height >= 44) anchor = parent;
    }
    return anchor;
  }

  function transferSummary(result, memoryCount) {
    const messages = result.messages.filter((item) => ["user", "assistant"].includes(item.role) && typeof item.text === "string" && item.text.trim());
    const transcript = messages.map((item) => `${item.role.toUpperCase()}:\n${item.text.slice(0, 12000)}`).join("\n\n");
    const trimmed = transcript.length > 20000 || messages.some((item) => item.text.length > 12000);
    const captured = result.captureMethod === "page text" ? "Messages unavailable"
      : `${messages.length} ${messages.length === 1 ? "message" : "messages"} captured${trimmed ? " (trimmed)" : ""}`;
    // The transfer payload contains text only. Never imply uploaded files move
    // with it, even when a filename appears in a captured message.
    return { captured, attachments: "0 attachments · text only",
      memories: memoryCount == null ? "Core memories unavailable" : `${memoryCount} core ${memoryCount === 1 ? "memory" : "memories"}` };
  }

  function destinationSuggestions(messages) {
    const text = messages.filter((item) => item.role === "user").slice(-4).map((item) => item.text).join(" ");
    const research = /\b(research|sources?|citations?|news|compare|comparison)\b/i.test(text);
    const writing = /\b(write|writing|draft|essay|revise|story|document|code|debug|function)\b/i.test(text);
    const preferred = research ? "Gemini" : writing ? "Claude" : null;
    const descriptions = {
      ChatGPT: "Explore ideas and turn them into practical next steps.",
      Claude: "Develop detailed explanations, writing, and code.",
      Gemini: "Explore research questions and compare perspectives."
    };
    return ["Claude", "Gemini", "ChatGPT"].filter((name) => name !== service)
      .sort((a, b) => Number(b === preferred) - Number(a === preferred))
      .map((name) => ({ name, recommended: name === preferred,
        description: name === preferred
          ? research ? "Suggested for the research questions in this chat." : "Suggested for the writing or code in this chat."
          : descriptions[name] }));
  }

  let trackedComposer;
  let trackedAnchor;
  let trackingFrame;
  function positionTransferControl() {
    if (!transferHost || !trackedComposer?.isConnected || !trackedAnchor?.isConnected) {
      if (transferHost) transferHost.hidden = true;
      return;
    }
    const rect = trackedAnchor.getBoundingClientRect();
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft || 0;
    const top = viewport?.offsetTop || 0;
    const width = viewport?.width || innerWidth;
    const height = viewport?.height || innerHeight;
    transferHost.hidden = !trackedComposer.getClientRects().length || rect.bottom <= top ||
      rect.top >= top + height || rect.right <= left || rect.left >= left + width;
    if (transferHost.hidden) return;
    const buttonRect = transferButton.getBoundingClientRect();
    const buttonWidth = buttonRect.width;
    const buttonHeight = buttonRect.height || 38;
    const buttonTop = Math.min(top + height - buttonHeight - 8, rect.top - buttonHeight - 10);
    // Never clamp the control down into the text box when the composer scrolls
    // to the top of the screen; restore it when there is room above again.
    if (buttonTop < top + 8) {
      transferHost.hidden = true;
      return;
    }
    const buttonLeft = Math.max(left + 8, Math.min(left + width - buttonWidth - 8, rect.right - buttonWidth));
    // Only write changed geometry; a sidebar transition can move the composer every frame.
    const setStyle = (node, property, value) => {
      if (node.style[property] !== value) node.style[property] = value;
    };
    setStyle(transferHost, "top", `${buttonTop}px`);
    setStyle(transferHost, "left", `${buttonLeft}px`);
    const menuWidth = Math.min(340, width - 16);
    const menuLeft = Math.max(left + 8, Math.min(buttonLeft + buttonWidth - menuWidth, left + width - menuWidth - 8));
    setStyle(transferPanel, "width", `${menuWidth}px`);
    setStyle(transferPanel, "left", `${menuLeft - buttonLeft}px`);
    setStyle(transferPanel, "maxHeight", `${Math.max(0, buttonTop - top - 17)}px`);
  }

  function trackComposerPosition() {
    positionTransferControl();
    trackingFrame = requestAnimationFrame(trackComposerPosition);
  }

  function transferIcon(kind) {
    const paths = {
      transfer: '<path d="M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4"/>',
      chevron: '<path d="m6 14 6-6 6 6"/>',
      arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>'
    };
    return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[kind]}</svg>`;
  }

  function mountTransferControl() {
    mountQueued = false;
    const composer = findComposer();
    if (!composer) {
      trackedComposer = null;
      if (transferHost) transferHost.hidden = true;
      return;
    }
    if (!transferHost) {
      transferHost = document.createElement("div");
      transferHost.id = "relay-transfer-root";
      transferHost.style.cssText = "position:fixed;z-index:2147483646;pointer-events:auto;";
      const shadow = transferHost.attachShadow({ mode: "open" });
      shadow.innerHTML = `<style>
        :host{all:initial;color:var(--rt-text);font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.4;direction:ltr;text-align:left}
        svg{display:block;flex:none;width:16px;height:16px}.chevron,.arrow{display:inline-flex;align-items:center;justify-content:center;flex:none;width:16px;height:16px}
        *{box-sizing:border-box}button{font:inherit;cursor:pointer}button:disabled{cursor:wait;opacity:.55}button:focus-visible{outline:2px solid var(--rt-accent);outline-offset:2px}
        .launcher{display:flex;align-items:center;gap:8px;height:38px;padding:5px 10px 5px 5px;border:1px solid var(--rt-border);border-radius:999px;background:var(--rt-surface);color:var(--rt-text);box-shadow:0 3px 12px #0000001f;white-space:nowrap;transition:box-shadow .15s,transform .15s}
        .launcher:hover{box-shadow:0 6px 18px #00000026;transform:translateY(-1px)}
        .mark{display:grid;place-items:center;width:26px;height:26px;flex:none;border-radius:50%;background:var(--rt-accent);color:var(--rt-accent-text);font-size:15px;line-height:1}
        .label{font-size:12px;font-weight:700;letter-spacing:-.01em}.chevron{margin-left:1px;color:var(--rt-muted);font-size:13px}
        .menu{position:absolute;right:0;bottom:calc(100% + 9px);width:min(322px,calc(100vw - 20px));max-height:min(440px,calc(100vh - 24px));overflow:auto;padding:14px;border:1px solid var(--rt-border);border-radius:max(16px,var(--rt-radius));background:var(--rt-surface);color:var(--rt-text);box-shadow:0 16px 42px #0000002e}
        .menu{right:auto;min-height:0;overscroll-behavior:contain}.menu[hidden],.copy[hidden]{display:none}
        .eyebrow{margin:0 0 3px;color:var(--rt-muted);font-size:10px;font-weight:700;letter-spacing:.09em;text-transform:uppercase}
        .head{padding:2px 2px 11px}.head strong{display:block;font-size:15px;letter-spacing:-.02em}.head small{display:block;margin-top:4px;color:var(--rt-muted);font-size:11px;line-height:1.35}
        .destinations{display:grid;gap:4px;padding:8px 0;border-top:1px solid var(--rt-border)}
        .destination{display:flex;align-items:center;gap:11px;width:100%;padding:10px 9px;border:0;border-radius:11px;background:transparent;color:var(--rt-text);text-align:left;transition:background .15s}
        .destination:hover,.destination:focus-visible{background:color-mix(in srgb,var(--rt-accent) 10%,var(--rt-surface))}
        .destination-copy{min-width:0;flex:1}.destination strong{display:block;font-size:12px}.destination small{display:block;margin-top:3px;color:var(--rt-muted);font-size:10px;line-height:1.3}
        .avatar{display:grid;place-items:center;width:30px;height:30px;flex:none;border-radius:10px;font-size:12px;font-weight:750}
        .service-chatgpt{background:#dcefe7;color:#136449}.service-claude{background:#f5e2d7;color:#9c4a2d}.service-gemini{background:#e5ebff;color:#315fbe}
        .arrow{color:var(--rt-muted);font-size:16px}.foot{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:11px 2px 1px;border-top:1px solid var(--rt-border);color:var(--rt-muted);font-size:10px}
        .context-count{display:grid;gap:3px;min-width:0;line-height:1.4}.foot{align-items:flex-end;flex-wrap:wrap}.foot button{margin-left:auto}
        .foot button,.copy{padding:0;border:0;background:none;color:var(--rt-accent);font-size:11px;font-weight:700;white-space:nowrap}.foot button:hover,.copy:hover{text-decoration:underline}
        .status{margin:9px 2px 0;color:var(--rt-muted);font-size:11px;line-height:1.45}.status:empty{display:none}.copy{margin:8px 2px 0}
      </style>
      <button type="button" class="launcher" aria-haspopup="dialog" aria-expanded="false" aria-label="Transfer this chat"><span class="mark">${transferIcon("transfer")}</span><span class="label">Transfer</span><span class="chevron">${transferIcon("chevron")}</span></button>
      <section class="menu" role="dialog" aria-label="Transfer chat" hidden><div class="head"><p class="eyebrow">Chat transfer</p><strong>Continue this conversation</strong><small>Start a new chat with your context carried over.</small></div><div class="destinations"></div><div class="foot"><span class="context-count">Checking context…</span><button type="button" class="memory-center">Memory Center</button></div><p class="status" role="status" aria-live="polite"></p><button type="button" class="copy" hidden>Copy prepared prompt</button></section>`;
      transferButton = shadow.querySelector(".launcher");
      transferPanel = shadow.querySelector(".menu");
      const list = shadow.querySelector(".destinations");
      const renderDestinations = (messages) => {
      list.replaceChildren();
      for (const suggestion of destinationSuggestions(messages)) {
        const destination = suggestion.name;
        const row = document.createElement("button");
        row.type = "button";
        row.className = "destination";
        const avatar = document.createElement("span");
        avatar.className = `avatar service-${destination.toLowerCase()}`;
        avatar.textContent = destination[0];
        const copy = document.createElement("span");
        copy.className = "destination-copy";
        const name = document.createElement("strong");
        name.textContent = destination + (suggestion.recommended ? " · Suggested" : "");
        const description = document.createElement("small");
        description.textContent = suggestion.description;
        copy.append(name, description);
        const arrow = document.createElement("span");
        arrow.className = "arrow";
        arrow.setAttribute("aria-hidden", "true");
        arrow.innerHTML = transferIcon("arrow");
        row.append(avatar, copy, arrow);
        row.addEventListener("click", () => startInlineTransfer(destination));
        list.append(row);
      }
      };
      transferButton.addEventListener("click", async () => {
        transferPanel.hidden = !transferPanel.hidden;
        transferButton.setAttribute("aria-expanded", String(!transferPanel.hidden));
        if (!transferPanel.hidden) {
          shadow.querySelector(".status").textContent = "";
          shadow.querySelector(".copy").hidden = true;
          const result = capture();
          renderDestinations(result.messages);
          positionTransferControl();
          const showSummary = (count) => {
            const summary = transferSummary(result, count);
            const footer = shadow.querySelector(".context-count");
            footer.replaceChildren(...Object.values(summary).map((text) => {
              const line = document.createElement("span");
              line.textContent = text;
              return line;
            }));
            footer.title = "Counts reflect the currently rendered chat. Long transcripts are shortened. Uploaded files are not transferred; attach them again in the destination chat.";
          };
          showSummary(null);
          try {
            const { count = 0 } = await chrome.runtime.sendMessage({ type: "INLINE_CONTEXT_STATUS" });
            showSummary(count);
          } catch { showSummary(null); }
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
    for (const [name, value] of Object.entries({
      "--rt-surface": theme.surface, "--rt-text": theme.text, "--rt-muted": theme.muted,
      "--rt-border": theme.border, "--rt-accent": theme.accent, "--rt-font": theme.fontFamily,
      "--rt-radius": theme.radius, "--rt-accent-text": theme.dark ? "#17202a" : "#ffffff"
    })) transferHost.style.setProperty(name, value);
    trackedComposer = composer;
    trackedAnchor = composerAnchor(composer);
    positionTransferControl();
    if (!trackingFrame) trackingFrame = requestAnimationFrame(trackComposerPosition);
  }

  function scheduleTransferControl() {
    if (mountQueued) return;
    mountQueued = true;
    requestAnimationFrame(mountTransferControl);
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
    status.textContent = `Opening ${destination}…`;
    try {
      const reply = await chrome.runtime.sendMessage({ type: "INLINE_TRANSFER", destination, capture: result });
      status.textContent = reply?.ok ? `Chat ready in ${destination}. ${reply.count || 0} memories and ${reply.retrieved || 0} saved excerpts included.${reply.ragError ? ` Search issue: ${reply.ragError}` : ""} Review context when sending.` :
        (reply?.message || "Transfer failed.");
      if (reply?.prompt) {
        copy.dataset.prompt = reply.prompt;
        copy.hidden = false;
      }
    } catch (error) { status.textContent = error.message || "Transfer failed."; }
    finally { rows.forEach((row) => { row.disabled = false; }); }
  }

  let autoTimer;
  let lastAutoSignature = "";
  let autoSending = false;
  async function sendAutoCapture() {
    if (autoSending) return;
    autoSending = true;
    try {
      const status = await chrome.runtime.sendMessage({ type: "AUTO_MEMORY_STATUS" });
      if (!status?.enabled) return;
      const result = capture();
      if (result.captureMethod === "page text" || !result.messages.some((item) => item.role === "user") ||
          !result.messages.some((item) => item.role === "assistant")) return;
      const signature = result.url + JSON.stringify(result.messages);
      if (signature === lastAutoSignature) return;
      const reply = await chrome.runtime.sendMessage({ type: "AUTO_MEMORY_CAPTURE", capture: result });
      if (["processed", "unchanged", "error"].includes(reply?.status)) lastAutoSignature = signature;
      if (reply?.status === "busy") scheduleAutoCapture(15000);
    } catch { /* Extension may have been reloaded while this tab was open. */ }
    finally { autoSending = false; }
  }

  function scheduleAutoCapture(delay = 15000) {
    clearTimeout(autoTimer);
    autoTimer = setTimeout(() => { autoTimer = null; sendAutoCapture(); }, delay);
  }

  if (document.body) {
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
    if (message.type === "RESCAN_AUTO_MEMORY") {
      lastAutoSignature = "";
      scheduleAutoCapture(500);
      sendResponse({ ok: true });
    }
    if (message.type === "INSERT_PROMPT") {
      insertPrompt(message.text).then(sendResponse).catch((error) => sendResponse({ ok: false, reason: error.message }));
      return true;
    }
  });
})();
