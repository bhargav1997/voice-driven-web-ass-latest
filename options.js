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

// Add this to your options.js

document.getElementById('defaultField').addEventListener('change', (e) => {
    const customFieldGroup = document.getElementById('customFieldGroup');
    if (e.target.value === 'custom') {
        customFieldGroup.classList.add('visible');
    } else {
        customFieldGroup.classList.remove('visible');
    }
});

document.getElementById('saveDefault').addEventListener('click', async () => {
    const fieldType = document.getElementById('defaultField').value;
    const customFieldName = document.getElementById('customFieldName').value;
    const defaultValue = document.getElementById('defaultValue').value.trim();

    if (!defaultValue) {
        alert('Please enter a default value.');
        return;
    }

    const fieldName = fieldType === 'custom' ? customFieldName : fieldType;

    const { defaultFormValues = {} } = await chrome.storage.sync.get('defaultFormValues');
    defaultFormValues[fieldName] = defaultValue;

    await chrome.storage.sync.set({ defaultFormValues });
    loadDefaultValues();
    
    // Clear inputs
    document.getElementById('defaultValue').value = '';
    document.getElementById('customFieldName').value = '';
});

async function loadDefaultValues() {
    const { defaultFormValues = {} } = await chrome.storage.sync.get('defaultFormValues');
    const container = document.getElementById('defaultValues');
    container.innerHTML = '';

    for (const [field, value] of Object.entries(defaultFormValues)) {
        const div = document.createElement('div');
        div.className = 'command-item';
        
        // Create tooltip for long values
        const displayValue = value.length > 30 ? value.substring(0, 27) + '...' : value;
        const tooltip = value.length > 30 ? value : '';
        
        div.innerHTML = `
            <div class="command-info">
                <strong>${field}</strong>
                <span class="value-display" ${tooltip ? `data-tooltip="${tooltip}"` : ''}>${displayValue}</span>
            </div>
            <button class="delete-btn" data-field="${field}">Delete</button>
        `;
        container.appendChild(div);
    }

    // Add delete handlers
    container.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const field = btn.dataset.field;
            const { defaultFormValues } = await chrome.storage.sync.get('defaultFormValues');
            delete defaultFormValues[field];
            await chrome.storage.sync.set({ defaultFormValues });
            loadDefaultValues();
        });
    });
}

// Load default values when page loads
document.addEventListener('DOMContentLoaded', loadDefaultValues);
