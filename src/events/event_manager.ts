import { listen, emit } from '@tauri-apps/api/event';

let eventManager: EventManager | null = null;
/**
 * Event class to handle custom events in the Tauri application.
 * It allows you to register event listeners and emit events with payloads.
 */
export class EventManager {
  private listeners: { [eventName: string]: Array<(event: any) => void> } = {};

  constructor() {
    if(!eventManager){
        eventManager = this;
    }
    return eventManager;
  }

  async on(eventName: string, callback: (event: any) => void) {
    if (!this.listeners[eventName]) {
      this.listeners[eventName] = [];
      await listen(eventName, (event) => {
        this.listeners[eventName].forEach((cb) => cb(event));
      });
    }
    this.listeners[eventName].push(callback);
  }

  async emit(eventName: string, payload: any = null) {
    await emit(eventName, payload);
  }
}
