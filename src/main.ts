import { platform } from '@tauri-apps/plugin-os';
import { EventManager } from "./events/event_manager";

declare global {
  interface Window {
    UI?: any;
  }
}

function initializeUI() {
  window.UI = window.UI || {};
  window.UI.platformName = window.UI.platformName || platform().toLowerCase();

  // const titleBar = window.UI.titleBar || new TitleBar();
  // window.UI.titleBar = titleBar
  // if (platformName === 'macos' || platformName === 'linux') {
  //   titleBar.height('30px');
  // } else if (platformName === 'windows') {
  //   titleBar.height('40px');
  // } else {
  //   titleBar.height('30px'); // Default height for unsupported platforms
  // }


  window.UI.eventManager = window.UI.eventManager || new EventManager();
}

function initializeEventListeners() {
  window.UI.eventManager.on('open_file', (event: any) => {
    console.log("Open file event triggered:", event);
  });
}

window.addEventListener("DOMContentLoaded", () => {
  initializeUI();
  initializeEventListeners();
  console.log("DOM fully loaded and parsed");
});
