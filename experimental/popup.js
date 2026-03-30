const slider = document.getElementById('keepVisible');
const valueDisplay = document.getElementById('keepValue');
const toggle = document.getElementById('enabled');
const status = document.getElementById('status');

// Load saved settings
chrome.storage.sync.get(['keepVisible', 'enabled'], (data) => {
  if (data.keepVisible) {
    slider.value = data.keepVisible;
    valueDisplay.textContent = data.keepVisible;
  }
  if (data.enabled !== undefined) {
    toggle.checked = data.enabled;
  }
  updateStatus();
});

// Slider change
slider.addEventListener('input', () => {
  const val = parseInt(slider.value);
  valueDisplay.textContent = val;
  chrome.storage.sync.set({ keepVisible: val });
});

// Toggle change
toggle.addEventListener('change', () => {
  chrome.storage.sync.set({ enabled: toggle.checked });
  updateStatus();
});

function updateStatus() {
  if (toggle.checked) {
    status.textContent = 'Active on Claude.ai';
    status.className = 'status active';
  } else {
    status.textContent = 'Disabled';
    status.className = 'status';
  }
}
