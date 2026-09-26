const MEMORY_MENU_ID = "relay-save-memory";

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  chrome.contextMenus.create({
    id: MEMORY_MENU_ID,
    title: "Save selection to Relay Memory",
    contexts: ["selection"],
    documentUrlPatterns: [
      "https://chatgpt.com/*",
      "https://chat.openai.com/*",
      "https://claude.ai/*",
      "https://gemini.google.com/*"
    ]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MEMORY_MENU_ID) return;
  const text = (info.selectionText || "").trim().slice(0, 4000);
  if (!text) return;
  const { memories = [] } = await chrome.storage.local.get("memories");
  memories.unshift({
    id: crypto.randomUUID(),
    text,
    project: "",
    sourceUrl: tab?.url || "",
    createdAt: new Date().toISOString()
  });
  await chrome.storage.local.set({ memories });
});
