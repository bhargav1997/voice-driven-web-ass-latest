document.addEventListener("DOMContentLoaded", () => {
   // Get UI elements
   const micStatus = document.getElementById("status");
   const lastCmd = document.getElementById("lastCmd");
   const commandTime = document.getElementById("commandTime");
   const toggleBtn = document.getElementById("toggleBtn");
   const openOptions = document.getElementById("openOptions");
   const showHelp = document.getElementById("showHelp");
   const voiceFeedbackToggle = document.getElementById("voiceFeedback");
   const autoRestartToggle = document.getElementById("autoRestart");
   const languageSelect = document.getElementById("language");

   // Validate required elements
   if (!micStatus || !lastCmd || !toggleBtn || !openOptions || !showHelp || !voiceFeedbackToggle || !autoRestartToggle || !languageSelect) {
      console.error("One or more popup elements not found");
      return;
   }

   // Load stored settings and state
   chrome.storage.local.get(["micActive", "lastCommand", "settings"], (result) => {
      const { micActive, lastCommand, settings = {} } = result;

      // Update UI with current state
      updateUI(micActive, lastCommand);

      // Set toggle states based on settings
      voiceFeedbackToggle.checked = settings.voiceFeedback !== false;
      autoRestartToggle.checked = settings.autoRestart !== false;

      // Set language selection
      if (settings.language) {
         languageSelect.value = settings.language;
      }
   });

   // Toggle microphone button
   toggleBtn.addEventListener("click", async () => {
      const { micActive } = await chrome.storage.local.get("micActive");
      const newState = !micActive;
      await chrome.storage.local.set({ micActive: newState });

      // Inform content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
         if (tabs && tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { toggleMic: newState }).catch((err) => console.log("Tab may not be ready yet"));
         }
      });

      updateUI(newState);
   });

   // Open options page
   openOptions.addEventListener("click", () => {
      chrome.runtime.openOptionsPage();
   });

   // Show help overlay
   showHelp.addEventListener("click", () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
         if (tabs && tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { action: "showHelp" }).catch((err) => {
               // If content script isn't ready, show a simple alert
               alert("Voice commands help will be shown on the webpage. If not visible, please refresh the page.");
            });
         }
      });
   });

   // Handle settings changes
   voiceFeedbackToggle.addEventListener("change", updateSettings);
   autoRestartToggle.addEventListener("change", updateSettings);
   languageSelect.addEventListener("change", updateSettings);

   // Update settings in storage and notify content script
   function updateSettings() {
      const settings = {
         voiceFeedback: voiceFeedbackToggle.checked,
         autoRestart: autoRestartToggle.checked,
         language: languageSelect.value,
      };

      // Save to storage
      chrome.storage.local.set({ settings });

      // Notify content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
         if (tabs && tabs[0]) {
            chrome.tabs
               .sendMessage(tabs[0].id, {
                  action: "updateSettings",
                  settings: settings,
               })
               .catch((err) => console.log("Tab may not be ready yet"));
         }
      });
   }

   // Listen for command updates from content script
   chrome.storage.onChanged.addListener((changes) => {
      if (changes.lastCommand) {
         updateUI(null, changes.lastCommand.newValue);
      }
      if (changes.micActive && changes.micActive.newValue !== undefined) {
         updateUI(changes.micActive.newValue);
      }
   });

   // Update UI based on state
   function updateUI(isActive = null, command = null) {
      // Update microphone status if provided
      if (isActive !== null) {
         const statusText = micStatus.querySelector("span:last-child");
         statusText.textContent = isActive ? "Listening" : "Stopped";
         micStatus.className = `status-pill ${isActive ? "pill-on" : "pill-off"}`;

         const btnText = toggleBtn.querySelector("span:last-child");
         btnText.textContent = isActive ? "Stop Listening" : "Start Listening";

         const statusDot = toggleBtn.querySelector(".status-dot");
         statusDot.style.backgroundColor = isActive ? "#28a745" : "#dc3545";
      }

      // Update command display if provided
      if (command !== null) {
         lastCmd.textContent = command || "None";

         // Update timestamp
         const now = new Date();
         const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
         commandTime.textContent = timeStr;
      }
   }
});
