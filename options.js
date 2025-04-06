
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

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('apiKey');
    const toggleApiKey = document.getElementById('toggleApiKey');
    const testApiButton = document.getElementById('testApi');
    const saveSettingsButton = document.getElementById('saveSettings');
    const apiKeyStatus = document.getElementById('apiKeyStatus');
    const toggleIcon = toggleApiKey.querySelector('i');

    // Load saved settings immediately
    loadSavedSettings();

    // Toggle API key visibility
    toggleApiKey.addEventListener('click', () => {
        if (apiKeyInput.type === 'password') {
            apiKeyInput.type = 'text';
            toggleIcon.className = 'fas fa-eye-slash';
        } else {
            apiKeyInput.type = 'password';
            toggleIcon.className = 'fas fa-eye';
        }
    });

    // Test API connection
    testApiButton.addEventListener('click', async () => {
        const apiKey = apiKeyInput.value.trim();
        
        if (!apiKey) {
            showStatus('error', 'Please enter an API key');
            return;
        }

        testApiButton.disabled = true;
        testApiButton.textContent = 'Testing...';
        showStatus('', 'Testing connection...');

        try {
            await testGeminiAPI(apiKey);
            showStatus('success', 'Connection successful!');
        } catch (error) {
            showStatus('error', 'Invalid API key or connection failed');
        } finally {
            testApiButton.disabled = false;
            testApiButton.textContent = 'Test Connection';
        }
    });

    // Save settings
    saveSettingsButton.addEventListener('click', async () => {
        const settings = {
            apiKey: apiKeyInput.value.trim(),
            autoRead: document.getElementById('autoRead')?.checked || false,
            aiModel: document.getElementById('aiModel')?.value || 'gemini'
        };

        await chrome.storage.sync.set({ aiSettings: settings });
        showStatus('success', 'Settings saved successfully!');
        
        // Keep the success message visible for 3 seconds
        setTimeout(() => {
            apiKeyStatus.className = 'api-key-status';
        }, 3000);
    });
});

function showStatus(type, message) {
    const apiKeyStatus = document.getElementById('apiKeyStatus');
    apiKeyStatus.className = `api-key-status visible ${type}`;
    apiKeyStatus.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
        ${message}
    `;
}

async function testGeminiAPI(apiKey) {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            contents: [{
                parts: [{
                    text: 'Hello'
                }]
            }]
        })
    });

    if (!response.ok) {
        throw new Error('API test failed');
    }

    return await response.json();
}

async function loadSavedSettings() {
    const result = await chrome.storage.sync.get(['aiSettings']);
    if (result.aiSettings) {
        const apiKeyInput = document.getElementById('apiKey');
        apiKeyInput.value = result.aiSettings.apiKey || '';
        
        const autoReadElement = document.getElementById('autoRead');
        if (autoReadElement) {
            autoReadElement.checked = result.aiSettings.autoRead || false;
        }
        
        const aiModelElement = document.getElementById('aiModel');
        if (aiModelElement) {
            aiModelElement.value = result.aiSettings.aiModel || 'gemini';
        }
    }
}
