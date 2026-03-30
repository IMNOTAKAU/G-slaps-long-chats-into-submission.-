const slider = document.getElementById('keepVisible');
const valueDisplay = document.getElementById('keepValue');
const toggle = document.getElementById('enabled');
const glowBar = document.getElementById('glowBar');
const siteBadge = document.getElementById('siteBadge');
const siteText = document.getElementById('siteText');
const collapsedCount = document.getElementById('collapsedCount');
const visibleCount = document.getElementById('visibleCount');
const totalCount = document.getElementById('totalCount');

// Load saved settings
chrome.storage.sync.get(['keepVisible', 'enabled'], (data) => {
  if (data.keepVisible) {
    slider.value = data.keepVisible;
    valueDisplay.textContent = data.keepVisible;
  }
  if (data.enabled !== undefined) {
    toggle.checked = data.enabled;
  }
  updateUI();
});

// Detect which site the active tab is on
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs[0] && tabs[0].url) {
    const url = new URL(tabs[0].url);
    const host = url.hostname;
    if (host === 'claude.ai') {
      siteText.textContent = 'Claude.ai';
      siteBadge.classList.add('detected');
    } else if (host === 'chatgpt.com' || host === 'chat.openai.com') {
      siteText.textContent = 'ChatGPT';
      siteBadge.classList.add('detected');
    } else {
      siteText.textContent = 'Not a supported site';
    }
  }
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
  updateUI();
});

function updateUI() {
  if (toggle.checked) {
    glowBar.classList.remove('off');
  } else {
    glowBar.classList.add('off');
    collapsedCount.textContent = '-';
    visibleCount.textContent = '-';
    totalCount.textContent = '-';
  }
}

// Listen for stats from content script
chrome.storage.onChanged.addListener((changes) => {
  if (changes.stats) {
    const s = changes.stats.newValue;
    if (s) {
      collapsedCount.textContent = s.collapsed;
      visibleCount.textContent = s.visible;
      totalCount.textContent = s.total;
    }
  }
});

// Load existing stats
chrome.storage.local.get(['stats'], (data) => {
  if (data.stats) {
    collapsedCount.textContent = data.stats.collapsed;
    visibleCount.textContent = data.stats.visible;
    totalCount.textContent = data.stats.total;
  }
});
