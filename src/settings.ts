import { SettingsWindow } from './ui/settings/settings_window';

window.addEventListener('DOMContentLoaded', () => {
  new SettingsWindow().mount(document.body);
});
