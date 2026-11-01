/**
 * The app's event bus: one typed local delivery path plus inbound Tauri transport.
 *
 * Example: `editor_layout_changed` reaches its toolbar synchronously in this
 * window, while the native menu's `undo` is translated from a Tauri listener
 * into the same local event shape.
 *
 * May import: the local event bus, the event boundary map, and Tauri's inbound
 * listener API. Upholds: one registered listener per inbound event name, local
 * facts stay local, and every listener sees the same typed event shape.
 */

import { listen } from '@tauri-apps/api/event';
import { LocalEventBus, type EventEnvelope } from '../../events/local_bus';
import {
  isInboundEvent,
  type AppEvents,
  type AppEventName
} from './contracts';

/** The typed event object every app listener receives. */
export interface AppEvent<K extends AppEventName> {
  readonly event: K;
  readonly payload: AppEvents[K];
  readonly id: string;
  readonly emittedAt: number;
  readonly correlationId: string | null;
  readonly source: 'local' | 'inbound';
}

type AnyAppEvent = AppEvent<AppEventName>;
type AnyListener = (event: AnyAppEvent) => void;

let instance: EventManager | null = null;

/**
 * Composes local event delivery with the native transport.
 *
 * Example: the settings window listens for inbound `config_changed`; the main
 * window emits local `workspace_changed` without another Tauri round trip.
 */
export class EventManager {
  private readonly local = new LocalEventBus<AppEvents>();
  private readonly listeners = new Map<AppEventName, Set<AnyListener>>();
  private readonly stopLocal = new Map<AppEventName, () => void>();
  private readonly unlistenByEvent = new Map<AppEventName, () => void>();
  private readonly inboundReady = new Map<AppEventName, Promise<void>>();

  constructor() {
    if (!instance) {
      instance = this;
    }
    return instance;
  }

  /**
   * Registers one listener and returns after any required Tauri listener is ready.
   *
   * Example: `await eventManager.on('undo', undo)` installs the Rust-menu
   * bridge once; a second callback shares that bridge and the same local bus.
   */
  async on<K extends AppEventName>(
    eventName: K,
    callback: (event: AppEvent<K>) => void
  ): Promise<void> {
    let callbacks = this.listeners.get(eventName);
    if (!callbacks) {
      callbacks = new Set();
      this.listeners.set(eventName, callbacks);
      this.stopLocal.set(
        eventName,
        this.local.on(eventName, (event) => this.deliver(eventName, event))
      );
    }
    callbacks.add(callback as unknown as AnyListener);

    if (isInboundEvent(eventName) && !this.inboundReady.has(eventName)) {
      const ready = listen(eventName, (event) => {
        this.local.emit(eventName, event.payload as AppEvents[K]);
      })
        .then((unlisten) => {
          this.unlistenByEvent.set(eventName, unlisten);
        })
        .catch((error: unknown) => {
          console.error(`failed to listen for inbound event ${eventName}:`, error);
        });
      this.inboundReady.set(eventName, ready);
    }

    await this.inboundReady.get(eventName);
  }

  /**
   * Emits one typed local fact.
   *
   * Example: `await eventManager.emit('workspace_changed', path)` calls every
   * local listener before the returned Promise resolves.
   */
  async emit<K extends AppEventName>(
    eventName: K,
    ...payload: null extends AppEvents[K]
      ? [payload?: AppEvents[K]]
      : [payload: AppEvents[K]]
  ): Promise<void> {
    this.local.emit(eventName, (payload[0] ?? null) as AppEvents[K]);
  }

  /** Removes one callback and releases the shared transports when it was last. */
  off<K extends AppEventName>(
    eventName: K,
    callback: (event: AppEvent<K>) => void
  ): void {
    const callbacks = this.listeners.get(eventName);
    if (!callbacks) {
      return;
    }
    callbacks.delete(callback as unknown as AnyListener);
    if (callbacks.size > 0) {
      return;
    }
    this.stopLocal.get(eventName)?.();
    this.unlistenByEvent.get(eventName)?.();
    this.listeners.delete(eventName);
    this.stopLocal.delete(eventName);
    this.unlistenByEvent.delete(eventName);
    this.inboundReady.delete(eventName);
  }

  /** Fans one envelope out with isolated failures and the declared source. */
  private deliver<K extends AppEventName>(
    eventName: K,
    envelope: EventEnvelope<K, AppEvents[K]>
  ): void {
    const event: AppEvent<K> = {
      event: eventName,
      payload: envelope.payload,
      id: envelope.id,
      emittedAt: envelope.emittedAt,
      correlationId: envelope.correlationId,
      source: isInboundEvent(eventName) ? 'inbound' : 'local'
    };
    for (const callback of [...(this.listeners.get(eventName) ?? [])]) {
      try {
        callback(event as AnyAppEvent);
      } catch (error) {
        console.error(`event ${eventName} listener ${event.id} failed:`, error);
      }
    }
  }
}

/** The app-wide event manager singleton. */
export const eventManager = new EventManager();
