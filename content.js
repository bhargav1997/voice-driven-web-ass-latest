(function () {
   const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
   if (!SpeechRecognition) {
      console.warn("Web Speech API not supported in this browser.");
      return;
   }

   const recognition = new SpeechRecognition();
   recognition.continuous = true;
   recognition.interimResults = false;
   recognition.lang = "en-US";

   recognition.onresult = function (event) {
      const transcript = event.results[event.results.length - 1][0].transcript.trim().toLowerCase();
      console.log("Voice command:", transcript);
      handleVoiceCommand(transcript); // Custom function
   };

   recognition.onerror = function (event) {
      console.error("Voice recognition error:", event.error);
   };

   recognition.onend = function () {
      // Restart recognition when it ends
      recognition.start();
   };

   recognition.start();
})();

async function handleVoiceCommand(cmd) {
   // Check custom commands
   const { commands = [] } = await chrome.storage.sync.get("commands");

   for (let c of commands) {
      if (cmd === c.trigger) {
         const el = document.querySelector(c.target);
         if (el) {
            if (c.action === "click") el.click();
            else if (c.action === "focus") el.focus();
            else if (c.action === "type") {
               el.value = c.value;
               el.dispatchEvent(new Event("input", { bubbles: true }));
            }
            return;
         }
      }
   }

   // Fallback to default actions
   if (cmd.includes("scroll down")) window.scrollBy(0, 200);
   else if (cmd.includes("scroll up")) window.scrollBy(0, -200);
   else if (cmd.includes("scroll right")) window.scrollBy(200, 0);
   else if (cmd.includes("scroll left")) window.scrollBy(-200, 0);
   else if (cmd.includes("stop scrolling")) window.scrollTo(window.scrollX, window.scrollY);
   else if (cmd.includes("go back")) history.back();
   else if (cmd.includes("go forward")) history.forward();
   else if (cmd.includes("refresh") || cmd.includes("reload")) location.reload();
   else if (cmd.includes("click ")) {
      const keyword = cmd.replace("click ", "");
      clickByText(keyword);
   }
   if (cmd.includes("scroll down")) window.scrollBy(0, 200);
   else if (cmd.includes("scroll up")) window.scrollBy(0, -200);
   else if (cmd.includes("click")) {
      const keyword = cmd.split("click ")[1];
      clickByText(keyword);
   } else if (cmd.includes("scroll right")) window.scrollBy(200, 0);
   else if (cmd.includes("scroll left")) window.scrollBy(-200, 0);
   else if (cmd.includes("stop scrolling")) window.scrollTo(window.scrollX, window.scrollY);
   else if (cmd.includes("go back")) history.back();
   else if (cmd.includes("go forward")) history.forward();
   else if (cmd.includes("refresh") || cmd.includes("reload")) location.reload();
   else if (cmd.includes("go to top")) window.scrollTo({ top: 0, behavior: "smooth" });
   else if (cmd.includes("go to bottom")) window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
   else if (cmd.startsWith("click link ")) {
      const keyword = cmd.replace("click link ", "");
      clickBySelector("a", keyword);
   } else if (cmd.startsWith("click button ")) {
      const keyword = cmd.replace("click button ", "");
      clickBySelector("button", keyword);
   } else if (cmd.startsWith("focus on ")) {
      const keyword = cmd.replace("focus on ", "");
      focusByPlaceholder(keyword);
   } else if (cmd.startsWith("type ")) {
      const input = cmd.replace("type ", "");
      typeInFocusedElement(input);
   } else if (cmd.startsWith("search for ")) {
      const query = cmd.replace("search for ", "");
      simulateSearch(query);
   } else if (cmd.includes("zoom in")) document.body.style.zoom = "110%";
   else if (cmd.includes("zoom out")) document.body.style.zoom = "90%";
   else if (cmd.includes("reset zoom")) document.body.style.zoom = "100%";
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
      input.form?.submit(); // Optional: trigger form submission
      break;
   }
}

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
   const cmd = request.command?.toLowerCase();
   const { commands = [] } = await chrome.storage.sync.get("commands");

   for (let c of commands) {
      if (cmd === c.trigger) {
         if (c.action === "click") {
            const el = document.querySelector(c.target);
            el?.click();
         } else if (c.action === "focus") {
            const el = document.querySelector(c.target);
            el?.focus();
         } else if (c.action === "type") {
            const el = document.querySelector(c.target);
            if (el) {
               el.value = c.value;
               el.dispatchEvent(new Event("input", { bubbles: true }));
            }
         }
         break;
      }
   }
});
