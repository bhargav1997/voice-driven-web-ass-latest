const micEnabledKey = "micActive";
const SPEECH_RECOGNITION_ENABLED = true;

let micEnabled = true;
let restartCount = 0;
const maxRestarts = 5; // Increased for better reliability
let recognition = null;
let settings = {
   language: "en-US",
   voiceFeedback: true,
   autoRestart: true,
   commandSuggestions: true,
};

// Visual feedback element
let feedbackElement = null;

// Initialize settings and mic state
chrome.storage.local.get([micEnabledKey, "settings"], (result) => {
   micEnabled = result.micActive !== false;
   if (result.settings) {
      settings = { ...settings, ...result.settings };
   }

   // Initialize speech recognition if enabled
   if (micEnabled) {
      initSpeechRecognition();
   }

   // Create visual feedback element
   createFeedbackElement();
});

// Listen for messages from popup or background
chrome.runtime.onMessage.addListener((msg) => {
   // Toggle microphone
   if (msg.toggleMic !== undefined) {
      micEnabled = msg.toggleMic;
      console.log("Mic toggled:", micEnabled);

      if (micEnabled) {
         initSpeechRecognition();
         updateFeedbackElement(true, "Listening...");
      } else {
         if (recognition) {
            recognition.abort();
         }
         updateFeedbackElement(false, "Paused");
      }
   }

   // Handle settings updates
   if (msg.action === "updateSettings" && msg.settings) {
      settings = { ...settings, ...msg.settings };
      console.log("Settings updated:", settings);

      if (recognition) {
         recognition.lang = settings.language;
      }
   }

   // Handle start listening request
   if (msg.action === "startListening" && micEnabled) {
      initSpeechRecognition();
   }

   // Handle show help request
   if (msg.action === "showHelp") {
      showHelpOverlay();
   }

   return false; // No async response needed
});

// =============== ✅ SPEECH RECOGNITION FUNCTIONS ===============

// Initialize speech recognition
function initSpeechRecognition() {
   if (!SPEECH_RECOGNITION_ENABLED) return;

   const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
   if (!SpeechRecognition) {
      console.warn("Web Speech API not supported.");
      speak("Your browser does not support voice recognition.");
      return;
   }

   // If recognition is already running, don't start a new one
   if (recognition && recognition.running) {
      return;
   }

   console.log("✅ Initializing SpeechRecognition");

   // Create new recognition instance
   recognition = new SpeechRecognition();
   recognition.continuous = true;
   recognition.interimResults = false;
   recognition.lang = settings.language;

   // Set up event handlers
   recognition.onstart = handleRecognitionStart;
   recognition.onresult = handleRecognitionResult;
   recognition.onerror = handleRecognitionError;
   recognition.onend = handleRecognitionEnd;

   // Start recognition
   try {
      recognition.start();
      recognition.running = true;
      restartCount = 0;
      console.log("🎙️ Speech recognition started");
      updateFeedbackElement(true, "Listening...");
   } catch (e) {
      console.error("Failed to start recognition:", e);
      updateFeedbackElement(false, "Error starting");
   }
}

// Handle recognition start event
function handleRecognitionStart() {
   console.log("🎤 Speech recognition started");
   updateFeedbackElement(true, "Listening...");
}

// Handle recognition result event
function handleRecognitionResult(event) {
   console.log("✅ Speech recognition result received");
   if (!micEnabled) return;

   const transcript = event.results[event.results.length - 1][0].transcript.trim().toLowerCase();
   console.log("🗣️ Voice command:", transcript);

   // Log command to storage and notify background script
   chrome.storage.local.set({ lastCommand: transcript });
   chrome.runtime.sendMessage({ action: "logCommand", command: transcript });

   // Show visual feedback
   updateFeedbackElement(true, transcript, true);

   // Process the command
   handleVoiceCommand(transcript);
}

// Handle recognition error event
function handleRecognitionError(event) {
   console.error("❌ Voice recognition error:", event.error);

   let errorMessage = "";

   switch (event.error) {
      case "not-allowed":
         errorMessage = "Microphone access denied";
         console.error("🚫 Microphone access denied by the user or blocked by browser settings.");
         break;

      case "service-not-allowed":
         errorMessage = "Speech service not allowed";
         console.error("🚫 Speech service not allowed (possibly HTTP or iframe issue).");
         break;

      case "network":
         errorMessage = "Network error";
         console.error("🌐 Network error - check internet connection.");
         break;

      case "no-speech":
         errorMessage = "No speech detected";
         console.error("🤐 No speech detected. Try speaking more clearly.");
         break;

      case "aborted":
         errorMessage = "Aborted";
         console.warn("🔁 Speech input was aborted.");
         break;

      default:
         errorMessage = `Error: ${event.error}`;
         console.error("Unknown error:", event.error);
         break;
   }

   // Update visual feedback
   updateFeedbackElement(false, errorMessage);

   // Provide voice feedback if enabled
   if (settings.voiceFeedback) {
      speak(errorMessage);
   }

   // Mark recognition as not running
   if (recognition) {
      recognition.running = false;
   }
}

// Handle recognition end event
function handleRecognitionEnd() {
   console.warn("🔁 Speech recognition ended");

   // Mark recognition as not running
   if (recognition) {
      recognition.running = false;
   }

   // Restart recognition if enabled and under max restart count
   if (micEnabled && settings.autoRestart && restartCount < maxRestarts) {
      restartCount++;
      console.log(`Restarting speech recognition (attempt ${restartCount}/${maxRestarts})`);

      setTimeout(() => {
         try {
            recognition.start();
            recognition.running = true;
            updateFeedbackElement(true, "Listening...");
         } catch (e) {
            console.error("Restart error:", e);
            updateFeedbackElement(false, "Restart failed");
         }
      }, 1000);
   } else if (restartCount >= maxRestarts) {
      console.warn("Maximum restart attempts reached. Stopping recognition.");
      updateFeedbackElement(false, "Stopped (max restarts)");
   }
}

// Create visual feedback element
function createFeedbackElement() {
   // Check if element already exists
   if (document.getElementById("voice-assistant-feedback")) {
      feedbackElement = document.getElementById("voice-assistant-feedback");
      return;
   }

   // Create new feedback element
   feedbackElement = document.createElement("div");
   feedbackElement.id = "voice-assistant-feedback";
   feedbackElement.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background-color: rgba(0, 0, 0, 0.7);
      color: white;
      padding: 10px 15px;
      border-radius: 20px;
      font-family: Arial, sans-serif;
      font-size: 14px;
      z-index: 9999;
      display: none;
      align-items: center;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
      transition: all 0.3s ease;
      max-width: 300px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
   `;

   // Add indicator dot
   const indicator = document.createElement("div");
   indicator.style.cssText = `
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background-color: #dc3545;
      margin-right: 8px;
      transition: background-color 0.3s ease;
   `;
   feedbackElement.appendChild(indicator);

   // Add text container
   const textContainer = document.createElement("span");
   textContainer.textContent = "Voice Assistant";
   feedbackElement.appendChild(textContainer);

   // Add to document
   document.body.appendChild(feedbackElement);

   // Show initial state
   updateFeedbackElement(micEnabled, micEnabled ? "Listening..." : "Paused");
}

// Update visual feedback element
function updateFeedbackElement(active, message, temporary = false) {
   if (!feedbackElement) return;

   // Get the indicator and text elements
   const indicator = feedbackElement.querySelector("div");
   const textContainer = feedbackElement.querySelector("span");

   // Update indicator color
   if (indicator) {
      indicator.style.backgroundColor = active ? "#28a745" : "#dc3545";
   }

   // Update message
   if (textContainer && message) {
      textContainer.textContent = message;
   }

   // Show the element
   feedbackElement.style.display = "flex";

   // If temporary, hide after a delay
   if (temporary) {
      setTimeout(() => {
         if (feedbackElement) {
            textContainer.textContent = active ? "Listening..." : "Paused";
         }
      }, 3000);
   }
}

// =============== ✅ COMMAND HANDLER ===============
async function handleVoiceCommand(cmd) {
   // First check for custom commands from storage
   const { commands = [] } = await chrome.storage.sync.get("commands");

   // Log the command for debugging
   console.log(`Processing command: "${cmd}"`);

   // Check if it matches any custom command
   for (let c of commands) {
      if (cmd === c.trigger) {
         console.log(`Matched custom command: ${c.trigger}`);
         const el = document.querySelector(c.target);
         if (el) {
            if (c.action === "click") {
               el.scrollIntoView({ behavior: "smooth", block: "center" });
               el.click();
               speak(`Clicked ${c.trigger}`);
            } else if (c.action === "focus") {
               el.scrollIntoView({ behavior: "smooth", block: "center" });
               el.focus();
               speak(`Focused on ${c.trigger}`);
            } else if (c.action === "type") {
               el.scrollIntoView({ behavior: "smooth", block: "center" });
               el.value = c.value;
               el.dispatchEvent(new Event("input", { bubbles: true }));
               speak(`Typed text`);
            }
            return;
         } else {
            speak(`Could not find element for ${c.trigger}`);
            return;
         }
      }
   }

   // Navigation commands
   if (cmd.includes("scroll down")) {
      window.scrollBy({ top: 200, behavior: "smooth" });
      speak("Scrolling down");
   } else if (cmd.includes("scroll up")) {
      window.scrollBy({ top: -200, behavior: "smooth" });
      speak("Scrolling up");
   } else if (cmd.includes("scroll right")) {
      window.scrollBy({ left: 200, behavior: "smooth" });
      speak("Scrolling right");
   } else if (cmd.includes("scroll left")) {
      window.scrollBy({ left: -200, behavior: "smooth" });
      speak("Scrolling left");
   } else if (cmd === "go back" || cmd === "go to previous page") {
      speak("Going back");
      history.back();
   } else if (cmd === "go forward" || cmd === "go to next page") {
      speak("Going forward");
      history.forward();
   } else if (cmd.includes("refresh") || cmd.includes("reload")) {
      speak("Reloading page");
      location.reload();
   } else if (cmd === "go to top" || cmd === "scroll to top") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      speak("Going to top");
   } else if (cmd === "go to bottom" || cmd === "scroll to bottom") {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
      speak("Going to bottom");
   }

   // Clipboard commands
   else if (cmd === "copy" || cmd === "copy text") {
      handleCopy();
   } else if (cmd === "paste" || cmd === "paste text") {
      handlePaste();
   } else if (cmd === "select all" || cmd === "select everything") {
      handleSelectAll();
   } else if (cmd === "delete" || cmd === "clear" || cmd === "clear text") {
      handleDelete();
   }

   // Element interaction commands
   else if (cmd.includes("click ")) {
      const text = cmd.replace("click ", "");
      speak(`Clicking ${text}`);
      clickByText(text);
   } else if (cmd.startsWith("click link ")) {
      const text = cmd.replace("click link ", "");
      speak(`Clicking link ${text}`);
      clickBySelector("a", text);
   } else if (cmd.startsWith("click button ")) {
      const text = cmd.replace("click button ", "");
      speak(`Clicking button ${text}`);
      clickBySelector("button", text);
   } else if (cmd.startsWith("focus on ") || cmd.startsWith("select field ")) {
      const text = cmd.replace(/^(focus on |select field )/, "");
      speak(`Focusing on ${text}`);
      focusByPlaceholder(text);
   } else if (cmd.startsWith("type ")) {
      const text = cmd.replace("type ", "");
      speak(`Typing ${text}`);
      typeInFocusedElement(text);
   } else if (cmd.startsWith("search for ") || cmd.startsWith("find ")) {
      const query = cmd.replace(/^(search for |find )/, "");
      speak(`Searching for ${query}`);
      simulateSearch(query);
   }

   // Zoom commands
   else if (cmd.includes("zoom in")) {
      document.body.style.zoom = parseFloat(document.body.style.zoom || "1") * 1.1 + "";
      speak("Zooming in");
   } else if (cmd.includes("zoom out")) {
      document.body.style.zoom = parseFloat(document.body.style.zoom || "1") * 0.9 + "";
      speak("Zooming out");
   } else if (cmd.includes("reset zoom") || cmd === "normal zoom") {
      document.body.style.zoom = "100%";
      speak("Zoom reset");
   }

   // Tab commands
   else if (cmd === "new tab") {
      speak("Opening new tab");
      chrome.runtime.sendMessage({ action: "openNewTab" });
   } else if (cmd === "close tab") {
      speak("Closing tab");
      chrome.runtime.sendMessage({ action: "closeCurrentTab" });
   } else if (cmd === "next tab") {
      speak("Switching to next tab");
      chrome.runtime.sendMessage({ action: "switchToNextTab" });
   } else if (cmd === "previous tab") {
      speak("Switching to previous tab");
      chrome.runtime.sendMessage({ action: "switchToPreviousTab" });
   }

   // Form commands
   else if (cmd === "submit form" || cmd === "submit") {
      const form = document.querySelector("form");
      if (form) {
         speak("Submitting form");
         form.submit();
      } else {
         speak("No form found");
      }
   }

   // Help command
   else if (cmd === "help" || cmd === "what can I say") {
      showHelpOverlay();
      speak("Showing available commands");
   }

   // Unknown command
   else {
      speak("Sorry, I did not understand the command.");
      console.log(`Unrecognized command: ${cmd}`);
   }
}

// Show help overlay with available commands
function showHelpOverlay() {
   // Remove existing overlay if present
   const existingOverlay = document.getElementById("voice-assistant-help");
   if (existingOverlay) {
      document.body.removeChild(existingOverlay);
      return;
   }

   // Create help overlay
   const overlay = document.createElement("div");
   overlay.id = "voice-assistant-help";
   overlay.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background-color: rgba(0, 0, 0, 0.9);
      color: white;
      padding: 20px;
      border-radius: 10px;
      z-index: 10000;
      max-width: 80%;
      max-height: 80%;
      overflow-y: auto;
      box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
      font-family: Arial, sans-serif;
   `;

   // Add close button
   const closeButton = document.createElement("button");
   closeButton.textContent = "Close";
   closeButton.style.cssText = `
      position: absolute;
      top: 10px;
      right: 10px;
      background-color: #f44336;
      color: white;
      border: none;
      border-radius: 5px;
      padding: 5px 10px;
      cursor: pointer;
   `;
   closeButton.onclick = () => document.body.removeChild(overlay);
   overlay.appendChild(closeButton);

   // Add title
   const title = document.createElement("h2");
   title.textContent = "Voice Assistant Commands";
   title.style.cssText = `
      margin-top: 0;
      color: #4CAF50;
      border-bottom: 1px solid #4CAF50;
      padding-bottom: 10px;
   `;
   overlay.appendChild(title);

   // Add command categories
   const categories = [
      {
         name: "Navigation",
         commands: [
            "scroll down/up/left/right",
            "go back/forward",
            "refresh/reload",
            "go to top/bottom",
            "new tab",
            "close tab",
            "next tab",
            "previous tab",
         ],
      },
      {
         name: "Interaction",
         commands: [
            "click [text]",
            "click link [text]",
            "click button [text]",
            "focus on [field]",
            "type [text]",
            "search for [query]",
            "submit form",
         ],
      },
      {
         name: "Text & Clipboard",
         commands: ["copy", "paste", "select all", "delete/clear"],
      },
      {
         name: "View",
         commands: ["zoom in", "zoom out", "reset zoom"],
      },
      {
         name: "Help",
         commands: ["help", "what can I say"],
      },
   ];

   // Add categories to overlay
   categories.forEach((category) => {
      const section = document.createElement("div");
      section.style.marginBottom = "15px";

      const heading = document.createElement("h3");
      heading.textContent = category.name;
      heading.style.cssText = `
         margin: 10px 0 5px 0;
         color: #2196F3;
      `;
      section.appendChild(heading);

      const commandList = document.createElement("ul");
      commandList.style.cssText = `
         margin: 5px 0;
         padding-left: 20px;
      `;

      category.commands.forEach((cmd) => {
         const item = document.createElement("li");
         item.textContent = cmd;
         item.style.margin = "5px 0";
         commandList.appendChild(item);
      });

      section.appendChild(commandList);
      overlay.appendChild(section);
   });

   // Add to document
   document.body.appendChild(overlay);

   // Auto-close after 15 seconds
   setTimeout(() => {
      if (document.body.contains(overlay)) {
         document.body.removeChild(overlay);
      }
   }, 15000);
}

// =============== ✅ HELPERS ===============

// Speak text using speech synthesis
function speak(text) {
   // Check if voice feedback is enabled in settings
   if (!settings.voiceFeedback) return;

   const synth = window.speechSynthesis;
   if (!synth) {
      console.warn("Speech synthesis not supported");
      return;
   }

   // Create utterance with the text
   const utter = new SpeechSynthesisUtterance(text);

   // Set language to match recognition language
   utter.lang = settings.language;

   // Set voice properties
   utter.volume = 1.0; // 0 to 1
   utter.rate = 1.0; // 0.1 to 10
   utter.pitch = 1.0; // 0 to 2

   // Speak the text
   synth.speak(utter);
}

function clickByText(text) {
   const elements = document.querySelectorAll("button, a, input[type='button'], input[type='submit']");
   for (let el of elements) {
      if (el.innerText.toLowerCase().includes(text) || el.value?.toLowerCase().includes(text)) {
         el.scrollIntoView({ behavior: "smooth", block: "center" });
         el.click();
         break;
      }
   }
}

function clickBySelector(selector, text) {
   const elements = document.querySelectorAll(selector);
   for (let el of elements) {
      if (el.innerText.toLowerCase().includes(text) || el.value?.toLowerCase().includes(text)) {
         el.scrollIntoView({ behavior: "smooth", block: "center" });
         el.click();
         break;
      }
   }
}

function focusByPlaceholder(text) {
   const inputs = document.querySelectorAll("input, textarea");
   for (let input of inputs) {
      if (input.placeholder?.toLowerCase().includes(text)) {
         input.focus();
         break;
      }
   }
}

function typeInFocusedElement(input) {
   const el = document.activeElement;
   if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) {
      el.value = input;
      el.dispatchEvent(new Event("input", { bubbles: true }));
   }
}

function simulateSearch(query) {
   const inputs = document.querySelectorAll("input[type='search'], input[placeholder*='search'], input[name*='search']");
   for (let input of inputs) {
      input.value = query;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.form?.submit();
      break;
   }
}

async function handleCopy() {
   let copiedText = "";
   const activeElement = document.activeElement;
   if (activeElement && (activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA")) {
      copiedText = activeElement.value.substring(activeElement.selectionStart, activeElement.selectionEnd) || activeElement.value;
   } else {
      copiedText = window.getSelection().toString();
   }

   try {
      await navigator.clipboard.writeText(copiedText);
      speak("Copied");
      saveToClipboardHistory(copiedText);
   } catch (err) {
      console.error("Failed to copy:", err);
      speak("Copy failed");
   }
}

async function handlePaste() {
   try {
      const text = await navigator.clipboard.readText();
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) {
         el.value += text;
         el.dispatchEvent(new Event("input", { bubbles: true }));
         speak("Pasted");
      } else {
         speak("No input focused");
      }
   } catch (err) {
      speak("Paste failed");
   }
}

function handleSelectAll() {
   const el = document.activeElement;
   if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) {
      el.select();
      speak("Selected all");
   } else {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(document.body);
      selection.removeAllRanges();
      selection.addRange(range);
      speak("Selected all content");
   }
}

function handleDelete() {
   const el = document.activeElement;
   if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) {
      el.value = "";
      el.dispatchEvent(new Event("input", { bubbles: true }));
      speak("Deleted");
   } else {
      speak("No input selected");
   }
}

function saveToClipboardHistory(text) {
   chrome.storage.local.get(["clipboardHistory"], ({ clipboardHistory = [] }) => {
      clipboardHistory.unshift(text);
      if (clipboardHistory.length > 5) clipboardHistory = clipboardHistory.slice(0, 5);
      chrome.storage.local.set({ clipboardHistory });
   });
}
