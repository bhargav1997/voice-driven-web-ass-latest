document.getElementById("save").addEventListener("click", async () => {
   const trigger = document.getElementById("trigger").value.trim().toLowerCase();
   const action = document.getElementById("action").value;
   const target = document.getElementById("target").value.trim();
   const value = document.getElementById("value").value.trim();

   if (!trigger || !action || !target) {
      alert("Please fill in the required fields.");
      return;
   }

   const newCommand = { trigger, action, target, value };
   const { commands = [] } = await chrome.storage.sync.get("commands");
   commands.push(newCommand);

   await chrome.storage.sync.set({ commands });
   loadCommands();

   document.getElementById("trigger").value = "";
   document.getElementById("target").value = "";
   document.getElementById("value").value = "";
});

async function loadCommands() {
   const { commands = [] } = await chrome.storage.sync.get("commands");
   const container = document.getElementById("commands");
   container.innerHTML = "";

   if (commands.length === 0) {
      container.innerHTML = `
         <div style="text-align: center; padding: 32px; color: #64748B;">
            <p>No custom commands yet. Create one above! ☝️</p>
         </div>`;
      return;
   }

   commands.forEach((cmd, index) => {
      const div = document.createElement("div");
      div.className = "command-item";
      div.innerHTML = `
         <strong>"${cmd.trigger}"</strong>
         <div class="command-meta">
            <div>🎯 Action: ${cmd.action}</div>
            <div>🎯 Target: ${cmd.target}</div>
            ${cmd.value ? `<div>✍️ Value: ${cmd.value}</div>` : ""}
         </div>
         <button class="delete" onclick="deleteCommand(${index})" 
                 style="position: absolute; top: 12px; right: 12px;">
            Delete
         </button>
      `;
      container.appendChild(div);
   });
}

window.deleteCommand = async function (index) {
   const { commands = [] } = await chrome.storage.sync.get("commands");
   commands.splice(index, 1);
   await chrome.storage.sync.set({ commands });
   loadCommands();
};

loadCommands();
