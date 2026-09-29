import { SettingsWindow } from './ui/settings/settings_window';
import { eventManager } from './services/event_manager';
import { applyLanguage, languageFor } from './services/language';
import { language } from './services/i18n';
import { configManager } from './services/config_manager';

window.addEventListener('DOMContentLoaded', async () => {
  // This window has labels of its own, so it reads the language before it builds them — and
  // reloads when the reader changes it, since a label is read once, where it is drawn.
  await applyLanguage();
  void eventManager.on('config_changed', () => {
    void (async () => {
      const cfg = await configManager.load();
      if ((await languageFor(cfg)) !== language()) {
        location.reload();
      }
    })();
  });
  new SettingsWindow().mount(document.body);
});
