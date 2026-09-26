const DESTINATIONS = {
  ChatGPT: "https://chatgpt.com/",
  Claude: "https://claude.ai/new",
  Gemini: "https://gemini.google.com/app"
};
const MAX_PROMPT_TRANSCRIPT = 20000;
let handoffTemplate = null;

const $ = (id) => document.getElementById(id);
const state = {
  chats: [],
  memories: [],
  selectedChatId: "",
  selectedMemoryIds: new Set(),
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
  return messages.map(({ role, text }) => `${role.toUpperCase()}:\n${text}`).join("\n\n");
}

function shortTranscript(text) {
  if (text.length <= MAX_PROMPT_TRANSCRIPT) return text;
  const head = text.slice(0, 3500);
  const tail = text.slice(-(MAX_PROMPT_TRANSCRIPT - 3500));
  return `${head}\n\n${handoffTemplate.truncationNotice}\n\n${tail}`;
}

function buildPrompt() {
  if (!handoffTemplate) return "";
  const transcript = $("transcript").value.trim();
  const chosen = state.memories.filter((memory) => state.selectedMemoryIds.has(memory.id));
  const nextRequest = $("next-request").value.trim();
  if (!transcript && !chosen.length && !nextRequest) return "";
  const sections = [handoffTemplate.intro];
  if (chosen.length) {
    sections.push(handoffTemplate.memoryHeading + "\n" + chosen.map((memory) => `- ${memory.project ? `[${memory.project}] ` : ""}${memory.text}`).join("\n"));
  }
  if (transcript) sections.push(handoffTemplate.conversationHeading + "\n" + shortTranscript(transcript));
  sections.push(`${handoffTemplate.nextRequestHeading}\n${nextRequest || handoffTemplate.emptyNextRequest}`);
  return sections.join(handoffTemplate.separator);
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

function renderMemories() {
  const choices = $("memory-choices");
  const list = $("memory-list");
  choices.replaceChildren();
  list.replaceChildren();
  $("memory-count").textContent = String(state.memories.length);
  if (!state.memories.length) {
    choices.append(makeEmpty("No saved memories yet. Add one in the Memory tab, or select text on a chat page and use the right-click menu."));
    list.append(makeEmpty("Memories you save will appear here."));
    return;
  }
  for (const memory of state.memories) {
    const choice = document.createElement("label");
    choice.className = "choice";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = state.selectedMemoryIds.has(memory.id);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) state.selectedMemoryIds.add(memory.id);
      else state.selectedMemoryIds.delete(memory.id);
      refreshPrompt();
    });
    const description = document.createElement("span");
    description.className = "choice-text";
    description.textContent = memory.project ? `[${memory.project}] ${memory.text}` : memory.text;
    choice.append(checkbox, description);
    choices.append(choice);

    const item = document.createElement("article");
    item.className = "memory-item";
    if (memory.project) {
      const tag = document.createElement("span");
      tag.className = "project";
      tag.textContent = memory.project;
      item.append(tag);
    }
    const body = document.createElement("p");
    body.textContent = memory.text;
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
    item.append(body, actions);
    list.append(item);
  }
}

function editMemory(memory) {
  state.editingMemoryId = memory.id;
  $("memory-text").value = memory.text;
  $("memory-project").value = memory.project || "";
  $("save-memory-btn").textContent = "Save changes";
  $("cancel-edit-btn").classList.remove("hidden");
  $("memory-text").focus();
}

function clearMemoryForm() {
  state.editingMemoryId = "";
  $("memory-text").value = "";
  $("memory-project").value = "";
  $("save-memory-btn").textContent = "Save memory";
  $("cancel-edit-btn").classList.add("hidden");
}

async function saveMemory() {
  const text = $("memory-text").value.trim().slice(0, 4000);
  const project = $("memory-project").value.trim().slice(0, 80);
  if (!text) return status("Write a memory first.", true);
  const { memories = [] } = await chrome.storage.local.get("memories");
  const old = memories.find((memory) => memory.id === state.editingMemoryId);
  if (old) {
    old.text = text;
    old.project = project;
    old.updatedAt = new Date().toISOString();
  } else {
    memories.unshift({ id: crypto.randomUUID(), text, project, sourceUrl: "", createdAt: new Date().toISOString() });
  }
  await chrome.storage.local.set({ memories });
  state.memories = memories;
  renderMemories();
  refreshPrompt();
  clearMemoryForm();
  status(old ? "Memory updated." : "Memory saved locally.");
}

async function saveQuickMemory() {
  const text = $("quick-memory-text").value.trim().slice(0, 4000);
  if (!text) return status("Type a memory or use selected conversation text first.", true);
  try {
    const { memories = [] } = await chrome.storage.local.get("memories");
    let memory = memories.find((item) => item.text.toLowerCase() === text.toLowerCase());
    if (!memory) {
      memory = {
        id: crypto.randomUUID(), text, project: "",
        sourceUrl: state.draftUrl,
        createdAt: new Date().toISOString()
      };
      memories.unshift(memory);
      await chrome.storage.local.set({ memories });
    }
    state.memories = memories;
    state.selectedMemoryIds.add(memory.id);
    $("quick-memory-text").value = "";
    renderMemories();
    refreshPrompt();
    status("Memory saved and added to this handoff.");
  } catch (error) {
    status(`Could not save memory: ${error.message}`, true);
  }
}

function useSelectedConversationText() {
  const editor = $("transcript");
  const selection = editor.value.slice(editor.selectionStart, editor.selectionEnd).trim();
  if (!selection) return status("Select a fact in the conversation text first.", true);
  $("quick-memory-text").value = selection.slice(0, 4000);
  $("quick-memory-text").focus();
}

async function deleteMemory(id) {
  const { memories = [] } = await chrome.storage.local.get("memories");
  await chrome.storage.local.set({ memories: memories.filter((memory) => memory.id !== id) });
  state.selectedMemoryIds.delete(id);
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
  const { chats = [], memories = [] } = await chrome.storage.local.get(["chats", "memories"]);
  state.chats = chats;
  state.memories = memories;
  renderChats();
  renderMemories();
  for (const tab of document.querySelectorAll(".tab")) tab.addEventListener("click", () => switchView(tab.dataset.view));
  $("manage-memory-btn").addEventListener("click", () => switchView("memory"));
  $("capture-btn").addEventListener("click", captureCurrentTab);
  $("save-chat-btn").addEventListener("click", saveChat);
  $("delete-chat-btn").addEventListener("click", deleteChat);
  $("chat-select").addEventListener("change", (event) => selectChat(event.target.value));
  $("save-memory-btn").addEventListener("click", saveMemory);
  $("save-quick-memory-btn").addEventListener("click", saveQuickMemory);
  $("use-selection-btn").addEventListener("click", useSelectedConversationText);
  $("cancel-edit-btn").addEventListener("click", clearMemoryForm);
  $("copy-btn").addEventListener("click", copyPrompt);
  $("continue-btn").addEventListener("click", openAndFill);
  for (const id of ["transcript", "next-request"]) $(id).addEventListener("input", refreshPrompt);
  for (const id of ["transcript", "chat-title"]) $(id).addEventListener("input", () => setSaveState("Unsaved conversation changes.", true));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.chats) { state.chats = changes.chats.newValue || []; renderChats(); }
    if (changes.memories) {
      state.memories = changes.memories.newValue || [];
      renderMemories();
      refreshPrompt();
    }
  });
}

init().catch((error) => status(error.message, true));
