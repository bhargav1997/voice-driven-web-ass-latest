const micEnabledKey = "micActive";
const SPEECH_RECOGNITION_ENABLED = true;
const DEBUG = true;

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

// Add error tracking
let errorLog = [];
function logError(error, context) {
    const errorEntry = {
        timestamp: new Date().toISOString(),
        error: error.message,
        context,
        stack: error.stack
    };
    errorLog.push(errorEntry);
    if (errorLog.length > 100) errorLog.shift();
    chrome.storage.local.set({ errorLog });
}

// Add command debouncing
const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

// Add command caching
const commandCache = new Map();
async function getCustomCommands() {
    const cacheKey = 'customCommands';
    if (commandCache.has(cacheKey)) {
        return commandCache.get(cacheKey);
    }
    const { commands = [] } = await chrome.storage.sync.get('commands');
    commandCache.set(cacheKey, commands);
    return commands;
}

// Data sanitization utility
const sanitizeInput = (input) => {
    return DOMPurify.sanitize(input, {
        ALLOWED_TAGS: [], // No HTML allowed
        ALLOWED_ATTR: [] // No attributes allowed
    });
};

// Rate limiting for voice commands
const rateLimiter = {
    commands: new Map(),
    limit: 10, // Maximum commands per minute
    interval: 60000, // 1 minute in milliseconds

    checkLimit(command) {
        const now = Date.now();
        const commandHistory = this.commands.get(command) || [];
        
        // Remove old timestamps
        const recentCommands = commandHistory.filter(
            timestamp => now - timestamp < this.interval
        );

        if (recentCommands.length >= this.limit) {
            return false; // Rate limit exceeded
        }

        // Add new timestamp
        recentCommands.push(now);
        this.commands.set(command, recentCommands);
        return true;
    }
};

// AI Assistant Integration
const AI_COMMANDS = ['ask', 'question', 'explain', 'help me with'];
const GEMINI_API_KEY = 'YOUR_GEMINI_API_KEY'; // Replace with your API key

async function handleAIAssistant(command) {
    try {
        // Extract the actual question from the command
        let question = '';
        for (const trigger of AI_COMMANDS) {
            if (command.startsWith(trigger)) {
                question = command.slice(trigger.length).trim();
                break;
            }
        }

        if (!question) {
            speak("What would you like to ask?");
            return;
        }

        // Show loading indicator
        updateFeedbackElement(true, "Thinking...");

        // Call Gemini API
        const response = await fetchAIResponse(question);
        
        // Create and show AI response overlay
        showAIResponseOverlay(question, response);
        
        // Provide voice feedback
        speak("I found an answer for you");

    } catch (error) {
        console.error("AI Assistant Error:", error);
        speak("Sorry, I couldn't get an answer at this moment");
        logError(error, 'AI Assistant');
    }
}

async function fetchAIResponse(question) {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${GEMINI_API_KEY}`
        },
        body: JSON.stringify({
            contents: [{
                parts: [{
                    text: question
                }]
            }],
            generationConfig: {
                temperature: 0.7,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 1024,
            },
            safetySettings: [
                {
                    category: "HARM_CATEGORY_HARASSMENT",
                    threshold: "BLOCK_MEDIUM_AND_ABOVE"
                },
                {
                    category: "HARM_CATEGORY_HATE_SPEECH",
                    threshold: "BLOCK_MEDIUM_AND_ABOVE"
                }
            ]
        })
    });

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
}

function showAIResponseOverlay(question, response) {
    // Remove existing overlay if present
    const existingOverlay = document.getElementById("ai-response-overlay");
    if (existingOverlay) {
        document.body.removeChild(existingOverlay);
    }

    // Create overlay container
    const overlay = document.createElement("div");
    overlay.id = "ai-response-overlay";
    overlay.innerHTML = `
        <div class="ai-response-content">
            <div class="ai-header">
                <h2>AI Assistant</h2>
                <button class="close-button" aria-label="Close">×</button>
            </div>
            <div class="ai-body">
                <div class="question">
                    <strong>Q:</strong> ${sanitizeInput(question)}
                </div>
                <div class="answer">
                    <strong>A:</strong> ${sanitizeInput(response)}
                </div>
            </div>
            <div class="ai-footer">
                <button class="copy-button">Copy Answer</button>
                <button class="read-aloud-button">Read Aloud</button>
            </div>
        </div>
    `;

    // Add styles
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
    `;

    // Add event listeners
    const closeButton = overlay.querySelector(".close-button");
    closeButton.onclick = () => document.body.removeChild(overlay);

    const copyButton = overlay.querySelector(".copy-button");
    copyButton.onclick = () => {
        navigator.clipboard.writeText(response);
        speak("Answer copied to clipboard");
    };

    const readAloudButton = overlay.querySelector(".read-aloud-button");
    readAloudButton.onclick = () => speak(response);

    // Add keyboard navigation
    overlay.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            document.body.removeChild(overlay);
        }
    });

    document.body.appendChild(overlay);
}

// Add styles for AI response overlay
const styles = `
    .ai-response-content {
        background: #ffffff;
        border-radius: 12px;
        max-width: 800px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
    }

    .ai-header {
        padding: 16px;
        border-bottom: 1px solid #eee;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .ai-body {
        padding: 24px;
    }

    .ai-footer {
        padding: 16px;
        border-top: 1px solid #eee;
        display: flex;
        gap: 12px;
        justify-content: flex-end;
    }

    .question, .answer {
        margin-bottom: 16px;
        line-height: 1.6;
    }

    .close-button {
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        padding: 4px 8px;
    }

    .copy-button, .read-aloud-button {
        padding: 8px 16px;
        border: none;
        border-radius: 6px;
        background: #007bff;
        color: white;
        cursor: pointer;
    }

    .copy-button:hover, .read-aloud-button:hover {
        background: #0056b3;
    }
`;

// Inject styles
const styleSheet = document.createElement("style");
styleSheet.textContent = styles;
document.head.appendChild(styleSheet);

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
   if (!SPEECH_RECOGNITION_ENABLED) {
      console.error("❌ Speech recognition is disabled");
      return;
   }

   const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
   if (!SpeechRecognition) {
      console.error("❌ Web Speech API not supported in this browser");
      speak("Your browser does not support voice recognition.");
      return;
   }

   // If recognition is already running, don't start a new one
   if (recognition && recognition.running) {
      console.log("ℹ️ Recognition is already running");
      return;
   }

   console.log("✅ Initializing SpeechRecognition");

   // Create new recognition instance
   recognition = new SpeechRecognition();
   recognition.continuous = true;
   recognition.interimResults = true; // Changed to true for better response
   recognition.lang = settings.language;

   // Set up event handlers with improved logging
   recognition.onstart = () => {
      console.log("🎤 Recognition started successfully");
      updateFeedbackElement(true, "Listening...");
   };

   recognition.onresult = (event) => {
      console.log("🎯 Recognition result received:", event.results);
      const transcript = event.results[event.results.length - 1][0].transcript.trim().toLowerCase();
      console.log("📝 Transcript:", transcript);

      if (!micEnabled) return;

      // Show visual feedback
      updateFeedbackElement(true, transcript, true);

      // Process the command
      handleVoiceCommand(transcript);
   };

   recognition.onerror = (event) => {
      console.error("❌ Recognition error:", event.error);
      handleRecognitionError(event);
   };

   recognition.onend = () => {
      console.log("🔚 Recognition ended");
      handleRecognitionEnd();
   };

   // Start recognition with error handling
   try {
      recognition.start();
      recognition.running = true;
      restartCount = 0;
      console.log("🎙️ Recognition started successfully");
      updateFeedbackElement(true, "Listening...");
   } catch (e) {
      console.error("❌ Failed to start recognition:", e);
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
   feedbackElement = document.createElement("div");
   feedbackElement.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 10px 20px;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        border-radius: 20px;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 14px;
        z-index: 999999;
        display: none;
        transition: all 0.3s ease;
    `;
   document.body.appendChild(feedbackElement);
}

function updateFeedbackElement(active, text, temporary = false) {
   if (!feedbackElement) return;

   feedbackElement.style.display = "block";
   feedbackElement.style.background = active ? "rgba(52, 152, 219, 0.9)" : "rgba(231, 76, 60, 0.9)";
   feedbackElement.textContent = text;

   if (temporary) {
      setTimeout(() => {
         feedbackElement.style.display = "none";
      }, 2000);
   }
}

// =============== ✅ COMMAND HANDLER ===============
const handleVoiceCommand = debounce(async (cmd) => {
    try {
        cmd = sanitizeInput(cmd.toLowerCase().trim());

        // Check for AI assistant commands
        if (AI_COMMANDS.some(trigger => cmd.startsWith(trigger))) {
            await handleAIAssistant(cmd);
            return;
        }

        // Check rate limit
        if (!rateLimiter.checkLimit(cmd)) {
            speak("Please slow down. Too many commands.");
            return;
        }

        if (DEBUG) console.log(`🎯 Processing command: "${cmd}"`);

        // Normalize the command
        cmd = cmd.toLowerCase().trim();

        try {
            // Form navigation commands - handle these first
            if (cmd === "next field") {
                focusNextFormField();
                return;
            }
            
            if (cmd === "previous field") {
                focusPreviousFormField();
                return;
            }

            // Try other form commands
            const isFormCommand = await handleFormCommands(cmd);
            if (isFormCommand) {
                if (DEBUG) console.log("✅ Form command handled successfully");
                return;
            }

            // Simplified bottom command matching - will now match "go bottom", "go to bottom", "scroll bottom", "scroll to bottom"
            if (cmd.match(/^(go|scroll)( to)?( to)? bottom$/)) {
                window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
                speak("Going to bottom");
                return;
            }

            // Simplified top command matching - will now match "go top", "go to top", "scroll top", "scroll to top"
            if (cmd.match(/^(go|scroll)( to)?( to)? top$/)) {
                window.scrollTo({ top: 0, behavior: "smooth" });
                speak("Going to top");
                return;
            }

            // First check for custom commands from storage
            const { commands = [] } = await getCustomCommands();
            console.log("📋 Available custom commands:", commands);

            // Check if it matches any custom command
            for (let c of commands) {
                if (cmd === c.trigger) {
                    console.log(`✅ Matched custom command: ${c.trigger}`);
                    const el = document.querySelector(c.target);
                    if (el) {
                        console.log(`🎯 Found target element:`, el);
                        executeCommand(c, el);
                        return;
                    } else {
                        console.log(`❌ Target element not found for: ${c.target}`);
                        speak(`Could not find element for ${c.trigger}`);
                        return;
                    }
                }
            }

            // Improved command matching
            if (cmd.includes("click button")) {
                const buttonText = cmd.replace("click button", "").trim();
                console.log(`🔍 Looking for button with text: "${buttonText}"`);
                clickButtonImproved(buttonText);
            } else if (cmd.includes("click link")) {
                const linkText = cmd.replace("click link", "").trim();
                console.log(`🔍 Looking for link with text: "${linkText}"`);
                clickLinkImproved(linkText);
            } else if (cmd.includes("click")) {
                const text = cmd.replace("click", "").trim();
                console.log(`🔍 Looking for element with text: "${text}"`);
                clickByTextImproved(text);
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
        } catch (error) {
            console.error("❌ Error handling command:", error);
            speak("Sorry, there was an error processing the command");
        }
    } catch (error) {
        logError(error, 'Command Processing');
        speak("An error occurred while processing the command");
    }
}, 300);

// Helper function to execute commands
function executeCommand(command, element) {
   switch (command.action) {
      case "click":
         element.scrollIntoView({ behavior: "smooth", block: "center" });
         element.click();
         speak(`Clicked ${command.trigger}`);
         break;
      case "focus":
         element.scrollIntoView({ behavior: "smooth", block: "center" });
         element.focus();
         speak(`Focused on ${command.trigger}`);
         break;
      case "type":
         element.scrollIntoView({ behavior: "smooth", block: "center" });
         element.value = command.value;
         element.dispatchEvent(new Event("input", { bubbles: true }));
         speak(`Typed text`);
         break;
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

   // Create help overlay container
   const overlay = document.createElement("div");
   overlay.id = "voice-assistant-help";
   overlay.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background-color: #1a1a1a;
      color: #ffffff;
      padding: 32px;
      border-radius: 16px;
      z-index: 10000;
      width: 600px;
      max-width: 90%;
      max-height: 85vh;
      overflow-y: auto;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      border: 1px solid rgba(255, 255, 255, 0.1);
   `;

   // Add close button
   const closeButton = document.createElement("button");
   closeButton.textContent = "×";
   closeButton.style.cssText = `
      position: absolute;
      top: 16px;
      right: 16px;
      background-color: rgba(255, 255, 255, 0.1);
      color: white;
      border: none;
      border-radius: 50%;
      width: 32px;
      height: 32px;
      font-size: 24px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      padding: 0;
      line-height: 1;
   `;
   closeButton.onmouseover = () => {
      closeButton.style.backgroundColor = "rgba(255, 255, 255, 0.2)";
   };
   closeButton.onmouseout = () => {
      closeButton.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
   };
   closeButton.onclick = () => document.body.removeChild(overlay);
   overlay.appendChild(closeButton);

   // Add title
   const title = document.createElement("h2");
   title.textContent = "Voice Assistant Commands";
   title.style.cssText = `
      margin: 10px 0 24px 0;
      color: #4CAF50;
      font-size: 24px;
      font-weight: 600;
      border-bottom: 2px solid #4CAF50;
      padding-bottom: 16px;
   `;
   overlay.appendChild(title);

   // Add command sections
   const sections = [
      {
         title: "Navigation Commands",
         commands: [
            { command: "Go to top", description: "Scroll to the top of the page" },
            { command: "Go to bottom", description: "Scroll to the bottom of the page" },
            { command: "Scroll up/down", description: "Scroll the page up or down" },
         ]
      },
      {
         title: "Form Commands",
         commands: [
            { command: "Next field", description: "Move to the next form field" },
            { command: "Previous field", description: "Move to the previous form field" },
            { command: "Fill [field] with [value]", description: "Fill a specific form field" },
            { command: "Fill [field]", description: "Fill a field with default value" },
         ]
      },
      {
         title: "Click Commands",
         commands: [
            { command: "Click [text]", description: "Click element containing the text" },
            { command: "Click button [text]", description: "Click button with specific text" },
            { command: "Click link [text]", description: "Click link with specific text" },
         ]
      },
      {
         title: "Text Commands",
         commands: [
            { command: "Copy", description: "Copy selected text" },
            { command: "Paste", description: "Paste text at cursor position" },
            { command: "Select all", description: "Select all text" },
            { command: "Delete", description: "Delete text in current field" },
         ]
      }
   ];

   sections.forEach(section => {
      const sectionEl = document.createElement("div");
      sectionEl.style.cssText = `
         margin-bottom: 24px;
         background: rgba(255, 255, 255, 0.05);
         border-radius: 12px;
         padding: 20px;
      `;

      const sectionTitle = document.createElement("h3");
      sectionTitle.textContent = section.title;
      sectionTitle.style.cssText = `
         margin: 0 0 16px 0;
         color: #64B5F6;
         font-size: 18px;
         font-weight: 500;
      `;
      sectionEl.appendChild(sectionTitle);

      const commandList = document.createElement("div");
      commandList.style.cssText = `
         display: grid;
         gap: 12px;
      `;

      section.commands.forEach(cmd => {
         const cmdEl = document.createElement("div");
         cmdEl.style.cssText = `
            display: grid;
            grid-template-columns: 1fr 2fr;
            gap: 16px;
            align-items: center;
            padding: 8px;
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.03);
            transition: background 0.2s ease;
         `;
         cmdEl.onmouseover = () => {
            cmdEl.style.background = "rgba(255, 255, 255, 0.07)";
         };
         cmdEl.onmouseout = () => {
            cmdEl.style.background = "rgba(255, 255, 255, 0.03)";
         };

         const cmdName = document.createElement("code");
         cmdName.textContent = cmd.command;
         cmdName.style.cssText = `
            color: #FF9800;
            font-family: 'Courier New', monospace;
            font-size: 14px;
            padding: 4px 8px;
            background: rgba(255, 152, 0, 0.1);
            border-radius: 4px;
         `;

         const cmdDesc = document.createElement("div");
         cmdDesc.textContent = cmd.description;
         cmdDesc.style.cssText = `
            color: #CCC;
            font-size: 14px;
         `;

         cmdEl.appendChild(cmdName);
         cmdEl.appendChild(cmdDesc);
         commandList.appendChild(cmdEl);
      });

      sectionEl.appendChild(commandList);
      overlay.appendChild(sectionEl);
   });

   // Add to document
   document.body.appendChild(overlay);

   // Auto-close after 30 seconds
   setTimeout(() => {
      if (document.body.contains(overlay)) {
         document.body.removeChild(overlay);
      }
   }, 30000);
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

// Improved click functions with better element matching
function clickButtonImproved(text) {
   // Convert text to lowercase for case-insensitive matching
   const searchText = text.toLowerCase();

   // Find all button-like elements
   const elements = document.querySelectorAll(`
        button,
        [role="button"],
        input[type="button"],
        input[type="submit"],
        .btn,
        [class*="button"]
    `);

   console.log(`Found ${elements.length} potential button elements`);

   for (let el of elements) {
      // Get all text content from the element and its children
      const elementText = (el.textContent || el.value || "").toLowerCase();
      const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase();
      const title = (el.getAttribute("title") || "").toLowerCase();

      // Check if the element contains the search text in any of its attributes
      if (elementText.includes(searchText) || ariaLabel.includes(searchText) || title.includes(searchText)) {
         console.log(`✅ Found matching button:`, el);
         el.scrollIntoView({ behavior: "smooth", block: "center" });
         setTimeout(() => {
            el.click();
            speak(`Clicked ${text}`);
         }, 500);
         return true;
      }
   }

   console.log(`❌ No button found with text: ${text}`);
   speak(`Could not find button ${text}`);
   return false;
}

function clickLinkImproved(text) {
   const searchText = text.toLowerCase();
   const links = document.querySelectorAll('a, [role="link"]');

   console.log(`Found ${links.length} potential link elements`);

   for (let link of links) {
      const elementText = (link.textContent || "").toLowerCase();
      const ariaLabel = (link.getAttribute("aria-label") || "").toLowerCase();
      const title = (link.getAttribute("title") || "").toLowerCase();

      if (elementText.includes(searchText) || ariaLabel.includes(searchText) || title.includes(searchText)) {
         console.log(`✅ Found matching link:`, link);
         link.scrollIntoView({ behavior: "smooth", block: "center" });
         setTimeout(() => {
            link.click();
            speak(`Clicked ${text}`);
         }, 500);
         return true;
      }
   }

   console.log(`❌ No link found with text: ${text}`);
   speak(`Could not find link ${text}`);
   return false;
}

function clickByTextImproved(text) {
   const searchText = text.toLowerCase();
   const elements = document.querySelectorAll("*");

   for (let el of elements) {
      // Skip hidden elements
      if (el.offsetParent === null) continue;

      const elementText = (el.textContent || "").toLowerCase();
      const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase();
      const title = (el.getAttribute("title") || "").toLowerCase();

      if (elementText.includes(searchText) || ariaLabel.includes(searchText) || title.includes(searchText)) {
         // Make sure it's clickable
         if (
            el.onclick ||
            el.tagName === "BUTTON" ||
            el.tagName === "A" ||
            el.getAttribute("role") === "button" ||
            el.getAttribute("role") === "link"
         ) {
            console.log(`✅ Found matching clickable element:`, el);
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            setTimeout(() => {
               el.click();
               speak(`Clicked ${text}`);
            }, 500);
            return true;
         }
      }
   }

   console.log(`❌ No clickable element found with text: ${text}`);
   speak(`Could not find element ${text}`);
   return false;
}

// Advanced form handling functions
async function handleFormCommands(cmd) {
    if (DEBUG) console.log("🔍 Form command handler started for:", cmd);

    // Check for "fill [fieldname]" without "with" clause
    const fillDefaultMatch = cmd.match(/^fill (.+)$/);
    if (fillDefaultMatch && !cmd.includes(' with ')) {
        const fieldIdentifier = fillDefaultMatch[1].trim();
        if (DEBUG) console.log("📝 Attempting to fill with default value for:", fieldIdentifier);
        
        // Try to find the field first
        const field = findFormField(fieldIdentifier);
        
        if (field) {
            if (DEBUG) console.log("✅ Field found:", field);
            // For testing, let's use a default value
            const defaultValue = "test@example.com"; // You can modify this
            await fillFormField(fieldIdentifier, defaultValue);
            return true;
        } else {
            if (DEBUG) console.log("❌ Field not found for:", fieldIdentifier);
            speak(`Could not find field ${fieldIdentifier}`);
            return true; // Still return true to prevent "unrecognized command"
        }
    }

    // Check for "fill [fieldname] with [value]"
    const fillMatch = cmd.match(/^fill (.*?) with (.*)$/);
    if (fillMatch) {
        const [_, fieldIdentifier, value] = fillMatch;
        console.log("📝 Filling specific value:", fieldIdentifier, value);
        await fillFormField(fieldIdentifier, value);
        return true;
    }

    // Navigate between form fields
    if (cmd === "next field") {
        focusNextFormField();
        return true;
    }

    if (cmd === "previous field") {
        focusPreviousFormField();
        return true;
    }

    return false;
}

async function fillWithDefaultValue(fieldIdentifier) {
    console.log("🔄 Looking for default value for:", fieldIdentifier);
    
    try {
        const { defaultFormValues = {} } = await chrome.storage.sync.get('defaultFormValues');
        console.log("📋 Available default values:", defaultFormValues);

        // Normalize the field identifier
        const normalizedIdentifier = fieldIdentifier.toLowerCase().trim();
        
        // Try to find an exact match first
        let defaultValue = defaultFormValues[normalizedIdentifier];
        
        // If no exact match, try to find a partial match
        if (!defaultValue) {
            const key = Object.keys(defaultFormValues).find(k => 
                k.toLowerCase().includes(normalizedIdentifier) ||
                normalizedIdentifier.includes(k.toLowerCase())
            );
            defaultValue = defaultFormValues[key];
        }

        if (defaultValue) {
            console.log("✅ Found default value:", defaultValue);
            await fillFormField(fieldIdentifier, defaultValue);
            speak(`Filled ${fieldIdentifier} with default value`);
            return true;
        } else {
            console.log("❌ No default value found");
            speak(`No default value found for ${fieldIdentifier}`);
            return false;
        }
    } catch (error) {
        console.error("❌ Error accessing default values:", error);
        speak("Error accessing default values");
        return false;
    }
}

function findFormField(identifier) {
    if (DEBUG) console.log("🔍 Searching for field:", identifier);
    
    // Normalize identifier
    identifier = identifier.toLowerCase().trim();

    // Try multiple strategies to find the field
    let field = null;

    // 1. Try by label
    const labels = Array.from(document.getElementsByTagName('label'));
    const matchingLabel = labels.find(label => 
        label.textContent.toLowerCase().includes(identifier)
    );
    if (matchingLabel?.getAttribute('for')) {
        field = document.getElementById(matchingLabel.getAttribute('for'));
        if (DEBUG && field) console.log("✅ Found by label");
    }

    // 2. Try by placeholder
    if (!field) {
        field = document.querySelector(
            `input[placeholder*="${identifier}" i], 
             textarea[placeholder*="${identifier}" i]`
        );
        if (DEBUG && field) console.log("✅ Found by placeholder");
    }

    // 3. Try by name or id
    if (!field) {
        field = document.querySelector(
            `input[name*="${identifier}" i], 
             input[id*="${identifier}" i],
             input[type="email"],
             textarea[name*="${identifier}" i], 
             textarea[id*="${identifier}" i]`
        );
        if (DEBUG && field) console.log("✅ Found by name/id");
    }

    // 4. Try by type="email" for email fields
    if (!field && identifier.includes('email')) {
        field = document.querySelector('input[type="email"]');
        if (DEBUG && field) console.log("✅ Found by email type");
    }

    if (DEBUG) {
        if (field) {
            console.log("✅ Field found:", field);
        } else {
            console.log("❌ No field found");
        }
    }

    return field;
}

async function fillFormField(identifier, value) {
    if (DEBUG) console.log(`🎯 Filling field: ${identifier} with value: ${value}`);

    const field = findFormField(identifier);
    
    if (field) {
        try {
            // Scroll field into view
            field.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // Focus and fill the field
            field.focus();
            field.value = value;
            
            // Trigger events
            field.dispatchEvent(new Event('input', { bubbles: true }));
            field.dispatchEvent(new Event('change', { bubbles: true }));
            
            speak(`Filled ${identifier} with ${value}`);
            return true;
        } catch (error) {
            if (DEBUG) console.error("❌ Error filling field:", error);
            speak(`Error filling ${identifier}`);
            return false;
        }
    } else {
        speak(`Could not find field ${identifier}`);
        return false;
    }
}

function focusNextFormField() {
   const formElements = Array.from(document.querySelectorAll(
      'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled])'
   )).filter(el => el.offsetParent !== null); // Only visible elements

   if (DEBUG) console.log("📝 Found form elements:", formElements);

   const currentIndex = formElements.indexOf(document.activeElement);
   const nextElement = formElements[currentIndex + 1] || formElements[0];
   
   if (nextElement) {
      nextElement.focus();
      nextElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const identifier = getFieldIdentifier(nextElement);
      speak(`Focused on ${identifier}`);
      if (DEBUG) console.log(`✅ Focused on element:`, nextElement);
   } else {
      speak("No form fields found");
      if (DEBUG) console.log("❌ No form fields found");
   }
}

function focusPreviousFormField() {
   const formElements = Array.from(document.querySelectorAll(
      'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled])'
   )).filter(el => el.offsetParent !== null); // Only visible elements

   if (DEBUG) console.log("📝 Found form elements:", formElements);

   const currentIndex = formElements.indexOf(document.activeElement);
   const prevElement = formElements[currentIndex - 1] || formElements[formElements.length - 1];
   
   if (prevElement) {
      prevElement.focus();
      prevElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const identifier = getFieldIdentifier(prevElement);
      speak(`Focused on ${identifier}`);
      if (DEBUG) console.log(`✅ Focused on element:`, prevElement);
   } else {
      speak("No form fields found");
      if (DEBUG) console.log("❌ No form fields found");
   }
}

function getFieldIdentifier(element) {
   // Try to get the most meaningful identifier for the field
   const label = document.querySelector(`label[for="${element.id}"]`);
   const identifier = label?.textContent.trim() || 
                     element.getAttribute('aria-label') || 
                     element.placeholder || 
                     element.name || 
                     element.id || 
                     element.tagName.toLowerCase();
   
   if (DEBUG) console.log(`📝 Field identifier for element:`, identifier);
   return identifier;
}

// Accessibility enhancements
function initAccessibility() {
    // Add ARIA labels to dynamic elements
    feedbackElement.setAttribute('role', 'status');
    feedbackElement.setAttribute('aria-live', 'polite');

    // Add keyboard navigation for help overlay
    const helpOverlay = document.getElementById('voice-assistant-help');
    if (helpOverlay) {
        helpOverlay.setAttribute('role', 'dialog');
        helpOverlay.setAttribute('aria-labelledby', 'help-title');
        
        // Trap focus within overlay when open
        const focusableElements = helpOverlay.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        
        const firstFocusable = focusableElements[0];
        const lastFocusable = focusableElements[focusableElements.length - 1];

        helpOverlay.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                if (e.shiftKey && document.activeElement === firstFocusable) {
                    lastFocusable.focus();
                    e.preventDefault();
                } else if (!e.shiftKey && document.activeElement === lastFocusable) {
                    firstFocusable.focus();
                    e.preventDefault();
                }
            }
        });
    }
}
