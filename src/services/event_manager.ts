import { listen, emit } from '@tauri-apps/api/event';

let instance: EventManager | null = null;
/**
 * Event class to handle custom events in the Tauri application.
 * It allows you to register event listeners and emit events with payloads.
 */
export class EventManager {
  private listeners: Record<string, Array<(event: any) => void>> = {};
  private unlistenByEvent: Record<string, (() => void) | undefined> = {};

  constructor() {
    if (!instance) {
      instance = this;
    }
    return instance;
  }

  async on(eventName: string, callback: (event: any) => void) {
    if (!this.listeners[eventName]) {
      this.listeners[eventName] = [];

      // Register exactly one Tauri listener per eventName
      this.unlistenByEvent[eventName] = await listen(eventName, (event) => {
        // Forward to all registered callbacks
        this.listeners[eventName]?.forEach((cb) => cb(event));
      });
    }

    this.listeners[eventName].push(callback);
  }

  async emit(eventName: string, payload: any = null) {
    await emit(eventName, payload);
  }

  off(eventName: string, callback: (event: any) => void) {
    const arr = this.listeners[eventName];
    if (!arr) return;

    this.listeners[eventName] = arr.filter((cb) => cb !== callback);

    // Optional: remove Tauri listener when no callbacks remain
    if (this.listeners[eventName].length === 0) {
      this.unlistenByEvent[eventName]?.();
      delete this.listeners[eventName];
      delete this.unlistenByEvent[eventName];
    }
  }
}

/** The app-wide event manager singleton. */
export const eventManager = new EventManager();
