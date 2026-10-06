/**
 * The app's event bus: the one way a service says something happened to whoever is listening, over
 * Tauri's own events (so a payload is JSON).
 *
 * May import: the event API. Upholds: one listener per event name per window — several callbacks
 * share it — so a name means the same thing to the emitter and to every listener.
 */

/**
 * The app's event bus, over Tauri's own events.
 *
 * One listener per event name per window — several callbacks share it — and the names and payloads
 * are the map in `app_events.ts`, so a listener's payload is typed and a name that drifts from its
 * declaration fails to compile.
 *
 * May import: the event API and the event map. Upholds: one bus for the app, so a name means the
 * same thing to the emitter and to every listener.
 */
import { listen, emit } from '@tauri-apps/api/event';
import type { AppEvents } from './app_events';

/** The event object a listener is handed: Tauri's, carrying the typed payload. */
export interface AppEvent<K extends keyof AppEvents> {
  event: K;
  payload: AppEvents[K];
}

let instance: EventManager | null = null;
/**
 * Event class to handle custom events in the Tauri application.
 * It allows you to register event listeners and emit events with payloads.
 */
export class EventManager {
  private listeners: Partial<Record<keyof AppEvents, Array<(event: AppEvent<keyof AppEvents>) => void>>> = {};
  private unlistenByEvent: Record<string, (() => void) | undefined> = {};

  constructor() {
    if (!instance) {
      instance = this;
    }
    return instance;
  }

  async on<K extends keyof AppEvents>(eventName: K, callback: (event: AppEvent<K>) => void) {
    if (!this.listeners[eventName]) {
      this.listeners[eventName] = [] as Array<(event: AppEvent<keyof AppEvents>) => void>;

      // Register exactly one Tauri listener per eventName
      this.unlistenByEvent[eventName] = await listen(eventName, (event) => {
        // Forward to all registered callbacks
        this.listeners[eventName]?.forEach((cb) => cb(event as unknown as AppEvent<keyof AppEvents>));
      });
    }

    this.listeners[eventName]?.push(callback as unknown as (event: AppEvent<keyof AppEvents>) => void);
  }

  /**
   * Sends `eventName`. An event whose payload is `null` may be emitted with no argument; one that
   * carries something must be given it.
   */
  async emit<K extends keyof AppEvents>(
    eventName: K,
    ...payload: null extends AppEvents[K] ? [payload?: AppEvents[K]] : [payload: AppEvents[K]]
  ) {
    await emit(eventName, payload[0] ?? null);
  }

  off<K extends keyof AppEvents>(eventName: K, callback: (event: AppEvent<K>) => void) {
    const arr = this.listeners[eventName];
    if (!arr) return;

    this.listeners[eventName] = arr.filter(
      (cb) => cb !== (callback as unknown as (event: AppEvent<keyof AppEvents>) => void)
    );

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
