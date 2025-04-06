// Background service worker for Voice-Driven Web Assistant

// Initialize default settings when extension is installed
chrome.runtime.onInstalled.addListener(({ reason }) => {
   if (reason === "install") {
      chrome.storage.local.set({
         micActive: true,
         lastCommand: "",
         clipboardHistory: [],
         settings: {
            language: "en-US",
            voiceFeedback: true,
            autoRestart: true,
            commandSuggestions: true,
         },
      });

      // Set default commands
      chrome.storage.sync.set({
         commands: [],
      });

      // Open options page on install
      chrome.runtime.openOptionsPage();
   }
});

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
   // Handle mic toggle requests from popup
   if (message.action === "getMicState") {
      chrome.storage.local.get(["micActive"], (result) => {
         sendResponse({ micActive: result.micActive !== false });
      });
      return true; // Required for async sendResponse
   }

   // Handle command logging
   if (message.action === "logCommand") {
      chrome.storage.local.set({ lastCommand: message.command });
      // Could also log commands to analytics here
   }

   // Handle settings requests
   if (message.action === "getSettings") {
      chrome.storage.local.get(["settings"], (result) => {
         sendResponse({ settings: result.settings || {} });
      });
      return true;
   }

   // Handle tab management commands
   if (message.action === "openNewTab") {
      chrome.tabs.create({});
   }

   if (message.action === "closeCurrentTab") {
      if (sender.tab && sender.tab.id) {
         chrome.tabs.remove(sender.tab.id);
      }
   }

   if (message.action === "switchToNextTab") {
      chrome.tabs.query({ currentWindow: true }, (tabs) => {
         if (tabs.length <= 1) return;

         let activeTabIndex = tabs.findIndex((tab) => tab.active);
         let nextTabIndex = (activeTabIndex + 1) % tabs.length;

         chrome.tabs.update(tabs[nextTabIndex].id, { active: true });
      });
   }

   if (message.action === "switchToPreviousTab") {
      chrome.tabs.query({ currentWindow: true }, (tabs) => {
         if (tabs.length <= 1) return;

         let activeTabIndex = tabs.findIndex((tab) => tab.active);
         let prevTabIndex = (activeTabIndex - 1 + tabs.length) % tabs.length;

         chrome.tabs.update(tabs[prevTabIndex].id, { active: true });
      });
   }
});

// Add command history tracking
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
   if (message.action === "logCommand") {
      chrome.storage.local.get(['commandHistory'], (result) => {
         const history = result.commandHistory || [];
         history.unshift({
            command: message.command,
            timestamp: new Date().toISOString(),
            url: sender.tab?.url
         });
         if (history.length > 50) history.pop();
         chrome.storage.local.set({ commandHistory: history });
      });
   }
});

// Handle tab updates to reinject content script if needed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
   if (changeInfo.status === "complete" && tab.url && tab.url.startsWith("http")) {
      chrome.storage.local.get(["micActive"], ({ micActive }) => {
         if (micActive !== false) {
            // Notify content script to start listening
            chrome.tabs.sendMessage(tabId, { action: "startListening" }).catch(() => {
               // Content script might not be ready yet, which is fine
            });
         }
      });
   }
});
