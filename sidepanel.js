const DESTINATIONS = globalThis.RELAY_TRANSFER.destinations;
let handoffTemplate = null;

const $ = (id) => document.getElementById(id);
const state = {
  chats: [],
  memories: [],
  memorySuggestions: [],
  autoMemorySettings: { enabled: false, apiKey: "" },
  autoMemoryLastError: "",
  selectedChatId: "",
  editingMemoryId: "",
  draftSource: "Manual",
  draftUrl: ""
};
let statusTimer;

function status(message, error = false) {
  const element = $("status");
  element.textContent = message;
  element.classList.toggle("error", error);
  element.classList.add("show");
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => element.classList.remove("show"), 5500);
}

function formatTranscript(messages) {
  return globalThis.RELAY_TRANSFER.formatTranscript(messages);
}

function buildPrompt() {
  if (!handoffTemplate) return "";
  return globalThis.RELAY_TRANSFER.buildPrompt({
    transcript: $("transcript").value,
    nextRequest: $("next-request").value,
    memories: pickMemories(state.memories),
    template: handoffTemplate
  });
}

async function loadHandoffTemplate() {
  const response = await fetch(chrome.runtime.getURL("prompts/handoff.json"));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const template = await response.json();
  for (const field of ["intro", "separator", "memoryHeading", "conversationHeading", "nextRequestHeading", "emptyNextRequest", "truncationNotice"]) {
    if (typeof template[field] !== "string") throw new Error(`Missing template field: ${field}`);
  }
  return template;
}

function refreshPrompt() {
  $("prompt-preview").value = buildPrompt();
  const chosen = pickMemories(state.memories);
  const count = chosen.length;
  $("auto-memory-summary").textContent = count
    ? `${count} core ${count === 1 ? "memory" : "memories"} included automatically. Review the prompt below.`
    : "No core memories saved yet. You can manage memories in the Memory tab.";
}

function pickMemories(memories) {
  return globalThis.RELAY_TRANSFER.pickMemories(memories);
}

function setSaveState(message, unsaved = false) {
  $("save-state").textContent = message;
  $("save-state").classList.toggle("unsaved", unsaved);
}

function switchView(view) {
  for (const button of document.querySelectorAll(".tab")) button.classList.toggle("active", button.dataset.view === view);
  $("handoff-view").classList.toggle("hidden", view !== "handoff");
  $("memory-view").classList.toggle("hidden", view !== "memory");
}

async function syncChatTheme() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    const theme = await chrome.tabs.sendMessage(tab.id, { type: "GET_CHAT_THEME" });
    if (!theme?.surface || !theme?.text) return;
    const root = document.documentElement;
    root.dataset.themeDark = String(!!theme.dark);
    root.dataset.sourceService = theme.service || "";
    for (const [name, value] of Object.entries({
      "--ui-bg": theme.background, "--ui-surface": theme.surface,
      "--ui-text": theme.text, "--ui-muted": theme.muted,
      "--ui-border": theme.border, "--ui-accent": theme.accent,
      "--ui-accent-text": theme.dark ? "#17202a" : "#ffffff",
      "--ui-font": theme.fontFamily, "--ui-radius": theme.radius
    })) root.style.setProperty(name, value);
  } catch { /* Use the neutral fallback outside a supported chat. */ }
}

function renderChats() {
  const select = $("chat-select");
  select.replaceChildren(new Option("New unsaved conversation", ""));
  for (const chat of state.chats) {
    const savedAt = chat.updatedAt || chat.createdAt;
    const stamp = savedAt ? new Date(savedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
    const label = `${chat.title || "Untitled"} · ${chat.service || "Manual"}${stamp ? ` · ${stamp}` : ""}`;
    select.add(new Option(label.slice(0, 85), chat.id));
  }
  select.value = state.selectedChatId;
  $("chat-count").textContent = `(${state.chats.length})`;
  $("save-chat-btn").textContent = state.selectedChatId ? "Update conversation" : "Save conversation";
}

function makeEmpty(text) {
  const empty = document.createElement("div");
  empty.className = "empty";
  empty.textContent = text;
  return empty;
}

function renderMemoryPolicy() {
  const list = $("memory-policy-list");
  list.replaceChildren();
  for (const category of globalThis.MEMORY_POLICY.categories) {
    const row = document.createElement("div");
    row.className = "policy-item";
    const title = document.createElement("strong");
    title.textContent = category.label;
    const detail = document.createElement("p");
    detail.textContent = `${category.saveWhen} Example: “${category.example}”`;
    row.append(title, detail);
    list.append(row);
  }
  const skipped = $("memory-policy-skip");
  skipped.replaceChildren();
  for (const rule of globalThis.MEMORY_POLICY.skipRules) {
    const item = document.createElement("li");
    item.textContent = rule;
    skipped.append(item);
  }
}

function renderMemories() {
  const list = $("memory-list");
  list.replaceChildren();
  $("memory-count").textContent = String(state.memories.length);
  if (!state.memories.length) {
    list.append(makeEmpty("Memories you save will appear here."));
    return;
  }
  for (const memory of state.memories) {
    const item = document.createElement("article");
    item.className = "memory-item";
    const category = globalThis.MEMORY_POLICY.categories.find((entry) => entry.id === memory.category);
    if (memory.origin === "automatic") {
      const tag = document.createElement("span");
      tag.className = "memory-tag";
      tag.textContent = category ? category.label : "Auto saved";
      item.append(tag);
    }
    const body = document.createElement("p");
    body.textContent = memory.text;
    if (category) {
      const why = document.createElement("p");
      why.className = "suggestion-source";
      why.textContent = `Why saved: ${category.why}`;
      item.append(body, why);
    } else item.append(body);
    if (memory.sourceQuote) {
      const source = document.createElement("p");
      source.className = "suggestion-source";
      source.textContent = `From ${memory.sourceTitle || "conversation"}: “${memory.sourceQuote}”`;
      item.append(source);
    }
    if (memory.scope !== "global" || memory.project ||
        (memory.origin === "automatic" && !category)) {
      const note = document.createElement("p");
      note.className = "suggestion-source";
      note.textContent = "Older excluded entry. Edit and save it as core memory if it fits the current template, or delete it.";
      item.append(note);
    }
    const actions = document.createElement("div");
    actions.className = "memory-actions";
    const edit = document.createElement("button");
    edit.textContent = "Edit";
    edit.addEventListener("click", () => editMemory(memory));
    const remove = document.createElement("button");
    remove.className = "delete";
    remove.textContent = "Delete";
    remove.addEventListener("click", () => deleteMemory(memory.id));
    actions.append(edit, remove);
    item.append(actions);
    list.append(item);
  }
}

function renderAutoSettings() {
  $("auto-memory-enabled").checked = !!state.autoMemorySettings.enabled;
  $("key-state").textContent = state.autoMemorySettings.apiKey ? "API key saved in this Chrome profile." : "No key saved.";
  $("auto-memory-error").textContent = state.autoMemoryLastError ? `Last scan failed: ${state.autoMemoryLastError}` : "";
  $("auto-memory-error").classList.toggle("hidden", !state.autoMemoryLastError);
}

function renderSuggestions() {
  const list = $("suggestion-list");
  list.replaceChildren();
  $("suggestion-count").textContent = String(state.memorySuggestions.length);
  $("legacy-suggestions-card").classList.toggle("hidden", !state.memorySuggestions.length);
  if (!state.memorySuggestions.length) {
    return;
  }
  for (const suggestion of state.memorySuggestions) {
    const item = document.createElement("article");
    item.className = "memory-item";
    const text = document.createElement("textarea");
    text.value = suggestion.text;
    text.rows = 2;
    text.setAttribute("aria-label", "Edit suggested memory");
    const source = document.createElement("p");
    source.className = "suggestion-source";
    source.textContent = `From ${suggestion.sourceTitle || "conversation"}: “${suggestion.quote}”`;
    const actions = document.createElement("div");
    actions.className = "memory-actions";
    const accept = document.createElement("button");
    accept.textContent = "Save memory";
    accept.addEventListener("click", () => acceptSuggestion(suggestion, text.value));
    const dismiss = document.createElement("button");
    dismiss.className = "delete";
    dismiss.textContent = "Dismiss";
    dismiss.addEventListener("click", () => dismissSuggestion(suggestion.id));
    actions.append(accept, dismiss);
    item.append(text, source, actions);
    list.append(item);
  }
}

async function acceptSuggestion(suggestion, editedText) {
  const text = editedText.trim().slice(0, 4000);
  if (!text) return status("Write a memory before saving it.", true);
  try {
    const { memories = [], memorySuggestions = [] } = await chrome.storage.local.get(["memories", "memorySuggestions"]);
    let memory = memories.find((item) => item.text.toLowerCase() === text.toLowerCase());
    if (!memory) {
      memory = { id: crypto.randomUUID(), text, scope: "global", origin: "manual", sourceUrl: suggestion.sourceUrl,
        createdAt: new Date().toISOString() };
      memories.unshift(memory);
    } else if (memory.scope !== "global" || memory.project ||
        (memory.origin === "automatic" && !globalThis.MEMORY_POLICY.categories.some((entry) => entry.id === memory.category))) {
      memory.scope = "global";
      memory.origin = "manual";
      delete memory.project;
      delete memory.category;
      memory.updatedAt = new Date().toISOString();
    }
    const remaining = memorySuggestions.filter((item) => item.id !== suggestion.id);
    await chrome.storage.local.set({ memories, memorySuggestions: remaining });
    state.memories = memories;
    state.memorySuggestions = remaining;
    renderMemories();
    renderSuggestions();
    refreshPrompt();
    status("Suggestion saved as memory.");
  } catch (error) { status(`Could not save suggestion: ${error.message}`, true); }
}

async function dismissSuggestion(id) {
  const { memorySuggestions = [] } = await chrome.storage.local.get("memorySuggestions");
  const remaining = memorySuggestions.filter((item) => item.id !== id);
  await chrome.storage.local.set({ memorySuggestions: remaining });
  state.memorySuggestions = remaining;
  renderSuggestions();
  status("Suggestion dismissed.");
}

async function rescanActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) await chrome.tabs.sendMessage(tab.id, { type: "RESCAN_AUTO_MEMORY" });
  } catch { /* A supported tab may not be open. */ }
}

async function saveAutoSettings() {
  const apiKey = $("auto-memory-key").value.trim() || state.autoMemorySettings.apiKey;
  const enabled = $("auto-memory-enabled").checked;
  if (enabled && !apiKey) return status("Enter an OpenAI API key before enabling automatic memory.", true);
  try {
    const autoMemorySettings = { enabled, apiKey };
    await chrome.storage.local.set({ autoMemorySettings, autoMemoryLastError: "" });
    state.autoMemorySettings = autoMemorySettings;
    state.autoMemoryLastError = "";
    $("auto-memory-key").value = "";
    renderAutoSettings();
    if (enabled) await rescanActiveTab();
    status(enabled ? "Automatic memory enabled." : "Automatic memory disabled.");
  } catch (error) { status(`Could not save settings: ${error.message}`, true); }
}

async function removeAutoKey() {
  const autoMemorySettings = { enabled: false, apiKey: "" };
  await chrome.storage.local.set({ autoMemorySettings, autoMemoryLastError: "" });
  state.autoMemorySettings = autoMemorySettings;
  state.autoMemoryLastError = "";
  $("auto-memory-key").value = "";
  renderAutoSettings();
  status("API key removed and automatic memory disabled.");
}

function editMemory(memory) {
  state.editingMemoryId = memory.id;
  $("memory-text").value = memory.text;
  const retired = memory.origin === "automatic" &&
    !globalThis.MEMORY_POLICY.categories.some((entry) => entry.id === memory.category);
  $("save-memory-btn").textContent = memory.scope === "global" && !memory.project && !retired
    ? "Save changes" : "Save as core memory";
  $("cancel-edit-btn").classList.remove("hidden");
  $("memory-text").focus();
}

function clearMemoryForm() {
  state.editingMemoryId = "";
  $("memory-text").value = "";
  $("save-memory-btn").textContent = "Save memory";
  $("cancel-edit-btn").classList.add("hidden");
}

async function saveMemory() {
  const text = $("memory-text").value.trim().slice(0, 4000);
  if (!text) return status("Write a memory first.", true);
  const { memories = [] } = await chrome.storage.local.get("memories");
  const old = memories.find((memory) => memory.id === state.editingMemoryId);
  if (old) {
    old.text = text;
    if (old.scope !== "global" || old.project ||
        (old.origin === "automatic" && !globalThis.MEMORY_POLICY.categories.some((entry) => entry.id === old.category))) {
      delete old.category;
      old.origin = "manual";
    }
    delete old.project;
    old.scope = "global";
    old.updatedAt = new Date().toISOString();
  } else {
    memories.unshift({ id: crypto.randomUUID(), text, scope: "global", origin: "manual",
      sourceUrl: "", createdAt: new Date().toISOString() });
  }
  await chrome.storage.local.set({ memories });
  state.memories = memories;
  renderMemories();
  refreshPrompt();
  clearMemoryForm();
  status(old ? "Memory updated." : "Memory saved locally.");
}

async function deleteMemory(id) {
  const { memories = [] } = await chrome.storage.local.get("memories");
  const remaining = memories.filter((memory) => memory.id !== id);
  await chrome.storage.local.set({ memories: remaining });
  state.memories = remaining;
  renderMemories();
  refreshPrompt();
  if (state.editingMemoryId === id) clearMemoryForm();
  status("Memory deleted.");
}

async function captureCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return status("Open a supported chat tab first.", true);
  const supported = /^https:\/\/(chatgpt\.com|chat\.openai\.com|claude\.ai|gemini\.google\.com)\//.test(tab.url || "");
  if (!supported) return status("Open a ChatGPT, Claude, or Gemini conversation tab first.", true);
  let result;
  try {
    result = await chrome.tabs.sendMessage(tab.id, { type: "CAPTURE" });
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      result = await chrome.tabs.sendMessage(tab.id, { type: "CAPTURE" });
    } catch (error) {
      return status(`Could not read this tab: ${error.message}`, true);
    }
  }
  state.selectedChatId = "";
  state.draftSource = result.service;
  state.draftUrl = result.url;
  $("chat-title").value = result.title || `${result.service} chat`;
  $("transcript").value = formatTranscript(result.messages);
  renderChats();
  refreshPrompt();
  setSaveState("Captured draft. Click Save conversation to add it to the list.", true);
  if (!result.messages.length) return status("No messages detected. You can paste the conversation into the editor and save it.", true);
  status(result.captureMethod === "page text"
    ? "Captured visible page text. Review it, then save the conversation."
    : result.captureMethod === "accessible text"
      ? `Captured ${result.messages.length} messages. Review and save the conversation.`
    : `Captured ${result.messages.length} messages from ${result.service}. Review and save.`);
}

async function saveChat() {
  const transcript = $("transcript").value.trim();
  if (!transcript) {
    status("Capture or paste a conversation first.", true);
    return false;
  }
  try {
    const { chats = [] } = await chrome.storage.local.get("chats");
    const existing = chats.find((chat) => chat.id === state.selectedChatId);
    if (existing) {
      existing.title = $("chat-title").value.trim() || "Untitled conversation";
      existing.transcript = transcript;
      existing.updatedAt = new Date().toISOString();
    } else {
      const chat = {
        id: crypto.randomUUID(),
        title: $("chat-title").value.trim() || "Untitled conversation",
        service: state.draftSource,
        sourceUrl: state.draftUrl,
        transcript,
        createdAt: new Date().toISOString()
      };
      chats.unshift(chat);
      state.selectedChatId = chat.id;
    }
    await chrome.storage.local.set({ chats });
    const stored = (await chrome.storage.local.get("chats")).chats || [];
    if (!stored.some((chat) => chat.id === state.selectedChatId && chat.transcript === transcript)) {
      throw new Error("The saved conversation could not be read back from Chrome storage.");
    }
    state.chats = stored;
    renderChats();
    refreshPrompt();
    const title = $("chat-title").value.trim() || "Untitled conversation";
    setSaveState(`Saved “${title}” locally · ${stored.length} in your list.`);
    status(`Saved “${title}” to the conversation list.`);
    return true;
  } catch (error) {
    setSaveState("Save failed. Your edits are still in the editor.", true);
    status(`Could not save conversation: ${error.message}`, true);
    return false;
  }
}

async function deleteChat() {
  if (!state.selectedChatId) return status("Select a saved conversation to delete.", true);
  const { chats = [] } = await chrome.storage.local.get("chats");
  const remaining = chats.filter((chat) => chat.id !== state.selectedChatId);
  await chrome.storage.local.set({ chats: remaining });
  state.chats = remaining;
  state.selectedChatId = "";
  state.draftSource = "Manual";
  state.draftUrl = "";
  $("chat-title").value = "";
  $("transcript").value = "";
  renderChats();
  refreshPrompt();
  setSaveState("No conversation saved yet.");
  status("Conversation deleted.");
}

function selectChat(id) {
  state.selectedChatId = id;
  const chat = state.chats.find((item) => item.id === id);
  $("chat-title").value = chat?.title || "";
  $("transcript").value = chat?.transcript || "";
  state.draftSource = chat?.service || "Manual";
  state.draftUrl = chat?.sourceUrl || "";
  refreshPrompt();
  setSaveState(chat ? `Loaded saved conversation “${chat.title}”.` : "New unsaved conversation. Capture or paste text, then save.");
}

async function copyPrompt() {
  const prompt = $("prompt-preview").value.trim();
  if (!prompt) {
    status("Add a conversation, memory, or next request first.", true);
    return false;
  }
  try {
    await navigator.clipboard.writeText(prompt);
    status("Prompt copied. Paste it into any chat.");
    return true;
  } catch {
    $("prompt-preview").focus();
    $("prompt-preview").select();
    status("Select and copy the prompt manually.", true);
    return false;
  }
}

async function openAndFill() {
  const prompt = $("prompt-preview").value.trim();
  if (!prompt) return status("Add context to the prompt first.", true);
  const destination = $("destination").value;
  $("continue-btn").disabled = true;
  status(`Opening ${destination}…`);
  try {
    const tab = await chrome.tabs.create({ url: DESTINATIONS[destination], active: true });
    for (let attempt = 0; attempt < 16; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 750));
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { type: "INSERT_PROMPT", text: prompt });
        if (response?.ok) {
          status(`Context filled in ${destination}. Review it, then send.`);
          return;
        }
        if (response?.reason === "Text mismatch") break;
      } catch { /* The destination page or content script is still loading. */ }
    }
    const copied = await copyPrompt();
    status(copied
      ? `Fill was incomplete. In ${destination}, select all composer text and paste the copied prompt.`
      : `Fill was incomplete. Select all composer text, then copy and paste the prompt manually.`, true);
  } catch (error) {
    status(error?.message || "Could not open the destination tab.", true);
  } finally {
    $("continue-btn").disabled = false;
  }
}

async function init() {
  try {
    handoffTemplate = await loadHandoffTemplate();
  } catch (error) {
    status(`Handoff template could not load: ${error.message}`, true);
  }
  const { chats = [], memories = [], memorySuggestions = [], autoMemorySettings = {}, autoMemoryLastError = "", panelView = "handoff" } =
    await chrome.storage.local.get(["chats", "memories", "memorySuggestions", "autoMemorySettings", "autoMemoryLastError", "panelView"]);
  state.chats = chats;
  state.memories = memories;
  state.memorySuggestions = memorySuggestions;
  state.autoMemorySettings = autoMemorySettings;
  state.autoMemoryLastError = autoMemoryLastError;
  renderChats();
  renderMemoryPolicy();
  renderMemories();
  renderSuggestions();
  renderAutoSettings();
  refreshPrompt();
  switchView(panelView === "memory" ? "memory" : "handoff");
  syncChatTheme();
  chrome.tabs.onActivated.addListener(syncChatTheme);
  for (const tab of document.querySelectorAll(".tab")) tab.addEventListener("click", () => {
    switchView(tab.dataset.view);
    chrome.storage.local.set({ panelView: tab.dataset.view });
  });
  $("capture-btn").addEventListener("click", captureCurrentTab);
  $("save-chat-btn").addEventListener("click", saveChat);
  $("delete-chat-btn").addEventListener("click", deleteChat);
  $("chat-select").addEventListener("change", (event) => selectChat(event.target.value));
  $("save-memory-btn").addEventListener("click", saveMemory);
  $("save-auto-settings-btn").addEventListener("click", saveAutoSettings);
  $("remove-auto-key-btn").addEventListener("click", removeAutoKey);
  $("cancel-edit-btn").addEventListener("click", clearMemoryForm);
  $("copy-btn").addEventListener("click", copyPrompt);
  $("continue-btn").addEventListener("click", openAndFill);
  for (const id of ["transcript", "next-request"]) $(id).addEventListener("input", refreshPrompt);
  for (const id of ["transcript", "chat-title"]) $(id).addEventListener("input", () => setSaveState("Unsaved conversation changes.", true));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.panelView) switchView(changes.panelView.newValue === "memory" ? "memory" : "handoff");
    if (changes.chats) { state.chats = changes.chats.newValue || []; renderChats(); }
    if (changes.memories) {
      state.memories = changes.memories.newValue || [];
      renderMemories();
      refreshPrompt();
    }
    if (changes.memorySuggestions) {
      state.memorySuggestions = changes.memorySuggestions.newValue || [];
      renderSuggestions();
    }
    if (changes.autoMemorySettings) {
      state.autoMemorySettings = changes.autoMemorySettings.newValue || {};
      renderAutoSettings();
    }
    if (changes.autoMemoryLastError) {
      state.autoMemoryLastError = changes.autoMemoryLastError.newValue || "";
      renderAutoSettings();
    }
  });
}

init().catch((error) => status(error.message, true));
