const DESTINATIONS = globalThis.RELAY_TRANSFER.destinations;
let handoffTemplate = null;

const $ = (id) => document.getElementById(id);
const state = {
  chats: [],
  memories: [],
  memorySuggestions: [],
  autoMemorySettings: { enabled: false, apiKey: "" },
  memoryEnabled: true,
  ragEnabled: false,
  ragChunks: 0,
  ragLastError: "",
  autoMemoryLastError: "",
  selectedChatId: "",
  editingMemoryId: "",
  draftSource: "Manual",
  draftUrl: "",
  matchedMemoryIds: new Set()
};
let statusTimer;

function status(message, error = false) {
  const element = $("status");
  $("status-text").textContent = message;
  element.classList.toggle("error", error);
  element.classList.add("show");
  clearTimeout(statusTimer);
  if (!error) statusTimer = setTimeout(() => element.classList.remove("show"), 5500);
}

function formatTranscript(messages) {
  return globalThis.RELAY_TRANSFER.formatTranscript(messages);
}

function buildPrompt(retrieved = null) {
  if (!handoffTemplate) return "";
  return globalThis.RELAY_TRANSFER.buildPrompt({
    transcript: $("transcript").value,
    memories: !state.memoryEnabled ? [] : retrieved ? retrieved.memories : pickMemories(state.memories),
    relatedConversations: state.memoryEnabled ? retrieved?.relatedConversations || [] : [],
    template: handoffTemplate
  });
}

async function loadHandoffTemplate() {
  const response = await fetch(chrome.runtime.getURL("prompts/handoff.json"));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const template = await response.json();
  for (const field of ["intro", "separator", "memoryHeading", "conversationHeading", "truncationNotice"]) {
    if (typeof template[field] !== "string") throw new Error(`Missing template field: ${field}`);
  }
  return template;
}

function refreshPrompt() {
  $("prompt-preview").value = buildPrompt();
  const chosen = pickMemories(state.memories);
  const count = chosen.length;
  $("auto-memory-summary").textContent = !state.memoryEnabled ? "Memory inclusion is off. Only the conversation is transferred." : state.ragEnabled
    ? "Saved memories and conversations will be searched for relevant context when you prepare the transfer."
    : count
      ? `${count} core ${count === 1 ? "memory" : "memories"} included automatically.`
      : "No core memories saved yet. You can manage memories in the Memory tab.";
}

function pickMemories(memories) {
  return globalThis.RELAY_TRANSFER.pickMemories(memories);
}

function retrievalQuery(transcript) {
  const matches = [...String(transcript || "").matchAll(/(?:^|\n\n)USER:\n([\s\S]*?)(?=\n\n(?:USER|ASSISTANT):|$)/g)];
  return (matches.at(-1)?.[1] || String(transcript || "").slice(-1800)).trim().slice(-6000);
}

async function preparePrompt() {
  let retrieved = null;
  try {
    retrieved = await chrome.runtime.sendMessage({ type: "RAG_RETRIEVE", query: retrievalQuery($("transcript").value) });
  } catch { /* Saved core memories remain available if retrieval is unavailable. */ }
  const prompt = buildPrompt(retrieved && Array.isArray(retrieved.memories) ? retrieved : null);
  $("prompt-preview").value = prompt;
  if (retrieved?.ragError) status(`Search unavailable; using saved memories. ${retrieved.ragError}`, true);
  else if (retrieved?.ragUsed) status(`Found ${retrieved.memories.length} relevant memories and ${retrieved.relatedConversations.length} saved chat excerpts.`);
  return prompt;
}

async function syncRagAfterSave() {
  if (!state.ragEnabled) return;
  try {
    const result = await chrome.runtime.sendMessage({ type: "RAG_REFRESH" });
    if (result?.error) throw new Error(result.error);
    state.ragChunks = result?.chunks || 0;
    state.ragLastError = "";
    renderRagSettings();
  } catch (error) {
    state.ragLastError = error.message || "Could not update the search index.";
    renderRagSettings();
  }
}

function setSaveState(message, unsaved = false) {
  $("save-state").textContent = message;
  $("save-state").classList.toggle("unsaved", unsaved);
}

function switchView(view) {
  $("handoff-view").classList.add("hidden");
  $("memory-view").classList.remove("hidden");
}

function switchMemoryTab(tab) {
  for (const button of document.querySelectorAll("[data-memory-tab]")) {
    const active = button.dataset.memoryTab === tab;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  for (const name of ["overview", "saved", "rules", "privacy"])
    $(`${name}-panel`).classList.toggle("hidden", name !== tab);
  document.querySelector(".workspace main").scrollTop = 0;
}

function showApiKeySettings() {
  switchView("memory");
  switchMemoryTab("privacy");
  requestAnimationFrame(() => {
    const input = $("auto-memory-key");
    input.focus({ preventScroll: true });
    input.scrollIntoView({ block: "center", behavior: "instant" });
  });
}

function renderOverview() {
  const memories = state.memories;
  const automatic = memories.filter((memory) => memory.origin === "automatic").length;
  const manual = memories.filter((memory) => memory.origin === "manual").length;
  const older = memories.length - automatic - manual;
  $("overview-total").textContent = String(memories.length);
  $("overview-manual").textContent = String(manual);
  $("overview-auto").textContent = String(automatic);
  $("manual-count").textContent = String(manual);
  $("automatic-count").textContent = String(automatic);
  $("older-count").textContent = String(older);
  $("manual-bar").style.width = `${memories.length ? manual / memories.length * 100 : 0}%`;
  $("automatic-bar").style.width = `${memories.length ? automatic / memories.length * 100 : 0}%`;
  $("older-bar").style.width = `${memories.length ? older / memories.length * 100 : 0}%`;
  $("chart-caption").textContent = memories.length
    ? "Your total includes manual, automatic, and earlier entries stored in this browser."
    : "Add a memory to see your overview.";
}

function renderMemoryMap() {
  const map = $("memory-map");
  map.replaceChildren();
  const ready = state.memories.filter((memory) => globalThis.RELAY_TRANSFER.isEligibleMemory(memory));
  $("map-count").textContent = `${ready.length} available`;
  if (!ready.length) {
    map.append(makeEmpty("No eligible memories yet. Add one in Saved memories."));
    $("map-detail").classList.add("hidden");
    return;
  }
  const categories = [...globalThis.MEMORY_POLICY.categories.map((item) => ({ id: item.id, label: item.label })),
    { id: "other", label: "Other memories" }];
  const knownCategories = new Set(globalThis.MEMORY_POLICY.categories.map((item) => item.id));
  for (const category of categories) {
    const group = ready.filter((memory) =>
      (knownCategories.has(memory.category) ? memory.category : "other") === category.id);
    if (!group.length) continue;
    const section = document.createElement("section");
    section.className = "map-group";
    const heading = document.createElement("h3");
    heading.textContent = `${category.label} · ${group.length}`;
    const items = document.createElement("div");
    items.className = "map-items";
    for (const memory of group) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "map-memory";
      button.classList.toggle("matched", state.matchedMemoryIds.has(memory.id));
      button.textContent = memory.text;
      button.title = memory.text;
      button.addEventListener("click", () => {
        const detail = $("map-detail");
        detail.replaceChildren();
        const title = document.createElement("strong");
        title.textContent = category.label;
        const body = document.createElement("p");
        body.textContent = memory.text;
        detail.append(title, body);
        if (memory.sourceTitle || memory.sourceQuote) {
          const source = document.createElement("small");
          source.textContent = memory.sourceQuote
            ? `From ${memory.sourceTitle || "a chat"}: “${memory.sourceQuote}”`
            : `From ${memory.sourceTitle}`;
          detail.append(source);
        }
        detail.classList.remove("hidden");
      });
      items.append(button);
    }
    section.append(heading, items);
    map.append(section);
  }
}

function renderRetrievalHint() {
  $("retrieval-hint").textContent = !state.memoryEnabled ? "Turn on memory inclusion in Privacy & data to try a question." : state.ragEnabled
    ? state.ragChunks ? "Search uses your local index. The question is sent to OpenAI for embedding."
      : "Semantic search is on; the local index is still being prepared."
    : "Turn on semantic search in Privacy & data to try a question.";
  $("retrieval-btn").disabled = !state.memoryEnabled || !state.ragEnabled || !state.ragChunks;
}

function addRetrievalResult(parent, label, text) {
  const item = document.createElement("div");
  item.className = "retrieval-result";
  const title = document.createElement("strong");
  title.textContent = label;
  const body = document.createElement("p");
  body.textContent = text;
  item.append(title, body);
  parent.append(item);
}

async function previewRetrieval(event) {
  event.preventDefault();
  const query = $("retrieval-query").value.trim();
  if (!query || !state.ragEnabled || !state.ragChunks) return;
  const button = $("retrieval-btn");
  const results = $("retrieval-results");
  button.disabled = true;
  state.matchedMemoryIds = new Set();
  renderMemoryMap();
  results.replaceChildren(makeEmpty("Searching saved context…"));
  try {
    const retrieved = await chrome.runtime.sendMessage({ type: "RAG_RETRIEVE", query });
    if (retrieved?.ragError) throw new Error(retrieved.ragError);
    const memories = retrieved?.memories || [];
    const excerpts = retrieved?.relatedConversations || [];
    state.matchedMemoryIds = new Set(memories.map((item) => item.id));
    renderMemoryMap();
    results.replaceChildren();
    if (!memories.length && !excerpts.length) {
      results.append(makeEmpty("No relevant saved context found for this question."));
      return;
    }
    const summary = document.createElement("p");
    summary.className = "fineprint";
    summary.textContent = `${memories.length} ${memories.length === 1 ? "memory" : "memories"} and ${excerpts.length} saved chat ${excerpts.length === 1 ? "excerpt" : "excerpts"} would be included.`;
    results.append(summary);
    memories.forEach((item, index) => addRetrievalResult(results, `Memory ${index + 1}`, item.text));
    excerpts.forEach((item, index) => addRetrievalResult(results,
      `Saved chat ${index + 1}${item.title ? ` · ${item.title}` : ""}`, item.text));
  } catch (error) {
    results.replaceChildren(makeEmpty(`Search unavailable: ${error.message || "Please try again."}`));
  } finally {
    renderRetrievalHint();
  }
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
    for (const [key, value] of Object.entries({
      "--ui-bg": theme.background, "--ui-surface": theme.surface,
      "--ui-text": theme.text, "--ui-muted": theme.muted, "--ui-border": theme.border,
      "--ui-accent": theme.accent, "--ui-accent-text": theme.dark ? "#17202a" : "#ffffff"
    })) if (value) root.style.setProperty(key, value);
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
  renderOverview();
  renderMemoryMap();
  renderRetrievalHint();
  if (!state.memories.length) {
    list.append(makeEmpty("No memories yet. Add one below."));
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
    item.append(body);
    if (category || memory.sourceQuote) {
      const source = document.createElement("details");
      source.className = "memory-source";
      const summary = document.createElement("summary");
      summary.textContent = "Why saved";
      const detail = document.createElement("p");
      detail.textContent = memory.sourceQuote
        ? `From ${memory.sourceTitle || "a chat"}: “${memory.sourceQuote}”`
        : category.why;
      source.append(summary, detail);
      item.append(source);
    }
    if (memory.scope !== "global" || memory.project ||
        (memory.origin === "automatic" && !category)) {
      const note = document.createElement("p");
      note.className = "suggestion-source";
      note.textContent = "Not used in transfers.";
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
  $("memory-enabled").checked = state.memoryEnabled;
  $("auto-memory-enabled").checked = !!state.autoMemorySettings.enabled;
  $("auto-memory-status").textContent = state.autoMemorySettings.enabled ? "On" : "Off";
  $("auto-memory-key").placeholder = state.autoMemorySettings.apiKey ? "•".repeat(40) : "Enter your API key";
  $("auto-memory-key").classList.toggle("has-saved-key", !!state.autoMemorySettings.apiKey);
  $("key-state").textContent = state.autoMemorySettings.apiKey ? "Key saved in this browser. Leave blank to keep it, or enter a replacement." : "Add your key to enable automatic saving or semantic search.";
  $("remove-auto-key-btn").disabled = !state.autoMemorySettings.apiKey;
  $("auto-memory-error").textContent = state.autoMemoryLastError ? `Last scan failed: ${state.autoMemoryLastError}` : "";
  $("auto-memory-error").classList.toggle("hidden", !state.autoMemoryLastError);
  const active = !!(state.autoMemorySettings.enabled && state.autoMemorySettings.apiKey);
  $("saving-status").textContent = active ? "Active" : "Off";
  $("toggle-saving-btn").textContent = active ? "Pause saving" : "Turn on";
  updateSettingsDirty();
}

function updateSettingsDirty() {
  const key = $("auto-memory-key").value.trim();
  const hasKey = !!(key || state.autoMemorySettings.apiKey);
  $("auto-memory-enabled").disabled = !hasKey;
  $("rag-enabled").disabled = !hasKey;
  if (!hasKey) $("auto-memory-enabled").checked = false;
  if (!hasKey) $("rag-enabled").checked = false;
  $("saving-key-hint").textContent = hasKey ? "Changes take effect when you save." : "Enter an API key above to enable automatic saving and semantic search.";
  const changed = !!$("memory-enabled").checked !== state.memoryEnabled ||
    !!$("auto-memory-enabled").checked !== !!state.autoMemorySettings.enabled ||
    !!$("rag-enabled").checked !== !!state.ragEnabled ||
    (!!key && key !== (state.autoMemorySettings.apiKey || ""));
  $("save-auto-settings-btn").disabled = !changed;
}

async function toggleMemorySaving() {
  if (!state.autoMemorySettings.apiKey) {
    showApiKeySettings();
    status("Add your API key and enable automatic saving to get started.");
    return;
  }
  const button = $("toggle-saving-btn");
  button.disabled = true;
  try {
    const settings = { ...state.autoMemorySettings, enabled: !state.autoMemorySettings.enabled };
    await chrome.storage.local.set({ autoMemorySettings: settings });
    state.autoMemorySettings = settings;
    renderAutoSettings();
    if (settings.enabled) await rescanActiveTab();
    status(settings.enabled ? "Memory saving is active." : "Memory saving paused. Your saved memories are still available.");
  } catch (error) { status(`Could not change memory saving: ${error.message}`, true); }
  finally { button.disabled = false; }
}

function renderRagSettings() {
  $("rag-enabled").checked = !!state.ragEnabled;
  $("rag-status").textContent = state.ragLastError
    ? `Search index issue: ${state.ragLastError}`
    : state.ragEnabled
      ? state.ragChunks ? `Ready · ${state.ragChunks} searchable text sections stored locally.`
        : state.chats.some((chat) => chat.transcript?.trim()) || pickMemories(state.memories).length
          ? "Enabled · preparing the local search index."
          : "On · save a conversation or eligible memory to build the index."
      : "Off. Saved conversations and memories stay out of the search index.";
}

async function refreshRagStatus() {
  try {
    const result = await chrome.runtime.sendMessage({ type: "RAG_STATUS" });
    state.ragEnabled = !!result?.enabled;
    state.ragChunks = result?.chunks || 0;
    state.ragLastError = result?.error || "";
    renderRagSettings();
    renderRetrievalHint();
    refreshPrompt();
  } catch { /* The extension worker may be restarting. */ }
}

async function saveRagSetting(event) {
  const enabled = event.target.checked;
  if (enabled && !state.autoMemorySettings.apiKey) {
    state.ragEnabled = false;
    renderRagSettings();
    return status("Add and save the OpenAI API key below before enabling semantic search.", true);
  }
  try {
    await chrome.storage.local.set({ ragEnabled: enabled, ragLastError: "" });
    state.ragEnabled = enabled;
    state.ragLastError = "";
    renderRagSettings();
    const result = enabled
      ? await chrome.runtime.sendMessage({ type: "RAG_REFRESH" })
      : await chrome.runtime.sendMessage({ type: "RAG_CLEAR" });
    if (result?.error) throw new Error(result.error);
    if (enabled) {
      state.ragChunks = result?.chunks || 0;
      status(`Semantic search is ready with ${state.ragChunks} local text sections.`);
    } else {
      state.ragChunks = 0;
      status("Semantic search disabled and its local index cleared.");
    }
    renderRagSettings();
    refreshPrompt();
    return true;
  } catch (error) {
    state.ragLastError = error.message || "Could not update the search index.";
    renderRagSettings();
    status(`Could not update semantic search: ${error.message}`, true);
    return false;
  }
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
    await syncRagAfterSave();
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
  const ragEnabled = $("rag-enabled").checked;
  const memoryEnabled = $("memory-enabled").checked;
  if ((enabled || ragEnabled) && !apiKey) return status("Enter an OpenAI API key before enabling saving or semantic search.", true);
  const ragChanged = ragEnabled !== state.ragEnabled;
  $("save-auto-settings-btn").disabled = true;
  try {
    const autoMemorySettings = { enabled, apiKey };
    await chrome.storage.local.set({ autoMemorySettings, memoryEnabled, autoMemoryLastError: "" });
    state.memoryEnabled = memoryEnabled;
    state.autoMemorySettings = autoMemorySettings;
    state.autoMemoryLastError = "";
    $("auto-memory-key").value = "";
    renderAutoSettings();
    if (ragChanged && await saveRagSetting({ target: { checked: ragEnabled } }) === false) {
      updateSettingsDirty();
      return;
    }
    updateSettingsDirty();
    if (enabled) await rescanActiveTab();
    refreshPrompt();
    renderRetrievalHint();
    status("Settings saved.");
  } catch (error) { status(`Could not save settings: ${error.message}`, true); updateSettingsDirty(); }
}

async function removeAutoKey() {
  const autoMemorySettings = { enabled: false, apiKey: "" };
  await chrome.storage.local.set({ autoMemorySettings, autoMemoryLastError: "", ragEnabled: false, ragLastError: "" });
  state.autoMemorySettings = autoMemorySettings;
  state.autoMemoryLastError = "";
  state.ragEnabled = false;
  state.ragChunks = 0;
  state.ragLastError = "";
  $("auto-memory-key").value = "";
  renderAutoSettings();
  renderRagSettings();
  await chrome.runtime.sendMessage({ type: "RAG_CLEAR" }).catch(() => {});
  status("API key removed. Automatic saving and semantic search are off.");
}

function editMemory(memory) {
  state.editingMemoryId = memory.id;
  $("memory-editor-title").textContent = "Edit memory";
  $("memory-text").setAttribute("aria-label", "Edit memory");
  $("memory-text").value = memory.text;
  $("save-memory-btn").textContent = "Save changes";
  $("cancel-edit-btn").classList.remove("hidden");
  $("memory-text").focus();
}

function clearMemoryForm() {
  state.editingMemoryId = "";
  $("memory-editor-title").textContent = "Add a memory";
  $("memory-text").setAttribute("aria-label", "New memory");
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
  await syncRagAfterSave();
  state.memories = memories;
  renderMemories();
  refreshPrompt();
  clearMemoryForm();
  status(old ? "Memory updated." : "Memory saved locally.");
}

async function deleteMemory(id) {
  try {
    const result = await chrome.runtime.sendMessage({ type: "DELETE_MEMORY", id });
    if (!result?.ok) throw new Error(result?.reason || "Could not verify deletion.");
    state.memories = result.memories;
    renderMemories();
    refreshPrompt();
    if (state.editingMemoryId === id) clearMemoryForm();
    status("Memory deleted from this browser.");
  } catch (error) {
    status(error.message || "Could not delete memory.", true);
  }
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
    await syncRagAfterSave();
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
  await syncRagAfterSave();
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

async function copyPrompt(preparedPrompt = null) {
  const prompt = typeof preparedPrompt === "string" ? preparedPrompt : await preparePrompt();
  if (!prompt) {
    status("Add a conversation or memory first.", true);
    return false;
  }
  try {
    await navigator.clipboard.writeText(prompt);
    status("Prompt copied. Paste it into any chat.");
    return true;
  } catch {
    $("preview-details").open = true;
    $("prompt-preview").focus();
    $("prompt-preview").select();
    status("Select and copy the prompt manually.", true);
    return false;
  }
}

async function openAndFill() {
  const prompt = await preparePrompt();
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
          status(`Context filled in ${destination}. Send it, then write your next message there.`);
          return;
        }
        if (response?.reason === "Text mismatch") break;
      } catch { /* The destination page or content script is still loading. */ }
    }
    const copied = await copyPrompt(prompt);
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
  const { chats = [], memories = [], memorySuggestions = [], autoMemorySettings = {}, autoMemoryLastError = "", memoryEnabled = true } =
    await chrome.storage.local.get(["chats", "memories", "memorySuggestions", "autoMemorySettings", "autoMemoryLastError", "memoryEnabled"]);
  state.memoryEnabled = memoryEnabled;
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
  await refreshRagStatus();
  updateSettingsDirty();
  refreshPrompt();
  switchView("memory");
  if (new URLSearchParams(window.location.search).get("setup") === "api-key") {
    showApiKeySettings();
    status("Add your API key to enable automatic saving or semantic search.");
  } else switchMemoryTab("overview");
  syncChatTheme();
  setInterval(syncChatTheme, 2000);
  chrome.tabs.onActivated.addListener(syncChatTheme);
  for (const button of document.querySelectorAll("[data-memory-tab]"))
    button.addEventListener("click", () => switchMemoryTab(button.dataset.memoryTab));
  $("retrieval-form").addEventListener("submit", previewRetrieval);
  $("close-btn").addEventListener("click", () => {
    if (window.parent !== window) window.parent.postMessage({ type: "RELAY_CLOSE_MEMORY_CENTER" }, "*");
    else window.close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && window.parent !== window)
      window.parent.postMessage({ type: "RELAY_CLOSE_MEMORY_CENTER" }, "*");
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Tab" || window.parent === window) return;
    const controls = [...document.querySelectorAll("button, input, select, textarea, summary, a[href]")]
      .filter((node) => !node.disabled && node.getClientRects().length && getComputedStyle(node).visibility !== "hidden");
    const first = controls[0], last = controls.at(-1);
    if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first)?.focus();
    }
  });
  if (window.parent !== window && new URLSearchParams(window.location.search).get("setup") !== "api-key") $("close-btn").focus();
  $("dismiss-status").addEventListener("click", () => $("status").classList.remove("show"));
  $("capture-btn").addEventListener("click", captureCurrentTab);
  $("save-chat-btn").addEventListener("click", saveChat);
  $("delete-chat-btn").addEventListener("click", deleteChat);
  $("chat-select").addEventListener("change", (event) => selectChat(event.target.value));
  $("save-memory-btn").addEventListener("click", saveMemory);
  $("save-auto-settings-btn").addEventListener("click", saveAutoSettings);
  for (const id of ["auto-memory-key", "auto-memory-enabled", "rag-enabled", "memory-enabled"])
    $(id).addEventListener("input", updateSettingsDirty);
  $("toggle-saving-btn").addEventListener("click", toggleMemorySaving);
  $("remove-auto-key-btn").addEventListener("click", removeAutoKey);
  $("cancel-edit-btn").addEventListener("click", clearMemoryForm);
  $("copy-btn").addEventListener("click", copyPrompt);
  $("continue-btn").addEventListener("click", openAndFill);
  $("transcript").addEventListener("input", refreshPrompt);
  for (const id of ["transcript", "chat-title"]) $(id).addEventListener("input", () => setSaveState("Unsaved conversation changes.", true));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.memoryEnabled) {
      state.memoryEnabled = changes.memoryEnabled.newValue !== false;
      $("memory-enabled").checked = state.memoryEnabled;
      refreshPrompt();
      renderRetrievalHint();
    }
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
    if (changes.ragEnabled) {
      state.ragEnabled = !!changes.ragEnabled.newValue;
      renderRagSettings();
      renderRetrievalHint();
      refreshPrompt();
    }
    if (changes.ragLastError) {
      state.ragLastError = changes.ragLastError.newValue || "";
      renderRagSettings();
    }
    if ((changes.chats || changes.memories || changes.ragChunkCount) && state.ragEnabled) refreshRagStatus();
  });
}

init().catch((error) => status(error.message, true));
