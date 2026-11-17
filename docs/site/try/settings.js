const settingsPanel = document.querySelector('.presentation-settings');
const settingsStatus = document.getElementById('settings-status');
const fields = [...settingsPanel.querySelectorAll('[data-setting]')];
const brandKeys = ['accent', 'logo', 'logo-dark', 'footer'];
const brandKey = 'aniflow-presentation-brand';


function syncSettings() {
  const front = Aniflow.readFrontMatter(textarea.value);
  for (const field of fields) {
    const entry = front?.entries?.find((item) => item.key === field.dataset.setting);
    field.value = entry && ['scalar', 'empty'].includes(entry.kind) ? entry.value || '' : '';
  }
  const colour = fields.find((field) => field.dataset.setting === 'accent').value;
  if (/^#[0-9a-f]{6}$/i.test(colour)) document.getElementById('accent-colour').value = colour;
}

function applySettings(changes) {
  try {
    textarea.value = Aniflow.updateFrontMatter(textarea.value, changes);
    textarea.dispatchEvent(new Event('input'));
    render();
    syncSettings();
    settingsStatus.textContent = '';
  } catch (error) { settingsStatus.textContent = error.message; }
}

textarea.addEventListener('input', syncSettings);
textarea.addEventListener('aniflow-settings-sync', syncSettings);
for (const field of fields) field.addEventListener('change', () => applySettings({ [field.dataset.setting]: field.value.trim() }));
document.getElementById('accent-colour').addEventListener('input', (event) => applySettings({ accent: event.target.value }));
settingsPanel.querySelectorAll('[data-upload]').forEach((input) => input.addEventListener('change', () => {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type)) {
    settingsStatus.textContent = 'Choose a PNG, JPEG, WebP or SVG file under 1 MiB.';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => applySettings({ [input.dataset.upload]: reader.result });
  reader.onerror = () => { settingsStatus.textContent = 'The logo could not be read.'; };
  reader.readAsDataURL(file);
}));
document.getElementById('style-defaults').addEventListener('click', () => applySettings({ font: '', theme: '', motion: '', transition: '', numbers: '' }));
document.getElementById('save-brand').addEventListener('click', () => {
  const brand = Object.fromEntries(fields.filter((field) => brandKeys.includes(field.dataset.setting)).map((field) => [field.dataset.setting, field.value]));
  try { localStorage.setItem(brandKey, JSON.stringify(brand)); settingsStatus.textContent = 'Brand saved in this browser.'; }
  catch (error) { settingsStatus.textContent = 'The brand could not be saved in this browser.'; }
});
document.getElementById('apply-brand').addEventListener('click', () => {
  try {
    const brand = JSON.parse(localStorage.getItem(brandKey) || 'null');
    if (!brand || typeof brand !== 'object') { settingsStatus.textContent = 'Save a brand first.'; return; }
    applySettings(Object.fromEntries(brandKeys.map((key) => [key, typeof brand[key] === 'string' ? brand[key] : ''])));
  } catch (error) { settingsStatus.textContent = 'The saved brand could not be read.'; }
});
document.getElementById('download').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([textarea.value], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'presentation.md';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
syncSettings();
