/**
 * Typed synchronous delivery for facts that stay inside one window.
 *
 * Example: emitting `workspace_changed` for `/notes/history` updates the tree
 * before `emit` returns; it does not serialize the path through Tauri.
 *
 * May import: nothing. Upholds: one subscription table delivers each fact to
 * every current listener in order without letting one failure block the rest.
 */

/** One immutable fact delivered to local listeners. */
export interface EventEnvelope<
  Name extends PropertyKey,
  Payload
> {
  readonly id: string;
  readonly name: Name;
  readonly payload: Payload;
  readonly emittedAt: number;
  readonly correlationId: string | null;
}

/** Options a caller can attach to one event delivery. */
export interface EmitOptions {
  readonly correlationId?: string;
}

/** Test seams and diagnostic ownership for one bus. */
export interface LocalEventBusOptions {
  readonly idPrefix?: string;
  readonly now?: () => number;
  readonly onListenerError?: (error: unknown) => void;
}

type EventMap = Record<PropertyKey, unknown>;
type AnyEnvelope<Events extends EventMap> = {
  [Name in keyof Events]: EventEnvelope<Name, Events[Name]>;
}[keyof Events];
type AnyListener<Events extends EventMap> = (
  event: AnyEnvelope<Events>
) => void;

/**
 * A LocalEventBus owns only subscriptions and synchronous fact delivery.
 *
 * Example: `on('hint', showHint)` returns an unsubscribe function, so a
 * component can stop hearing hints without changing the bus's global state.
 */
export class LocalEventBus<Events extends EventMap> {
  private readonly listeners = new Map<
    keyof Events,
    Set<AnyListener<Events>>
  >();
  private readonly idPrefix: string;
  private readonly now: () => number;
  private readonly onListenerError: (error: unknown) => void;
  private sequence = 0;

  constructor(options: LocalEventBusOptions = {}) {
    this.idPrefix = options.idPrefix ?? 'event';
    this.now = options.now ?? (() => Date.now());
    this.onListenerError =
      options.onListenerError ??
      ((error) => console.error('local event listener failed:', error));
  }

  /**
   * Subscribes one listener and returns the function that removes it.
   *
   * Example: `const off = bus.on('hint', showHint); off();` leaves the bus with
   * no callback from this component without disturbing other subscribers.
   */
  on<Name extends keyof Events>(
    name: Name,
    listener: (event: EventEnvelope<Name, Events[Name]>) => void
  ): () => void {
    let listeners = this.listeners.get(name);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(name, listeners);
    }
    const stored = listener as unknown as AnyListener<Events>;
    listeners.add(stored);
    return () => {
      const current = this.listeners.get(name);
      current?.delete(stored);
      if (current?.size === 0) {
        this.listeners.delete(name);
      }
    };
  }

  /**
   * Delivers one already-committed fact to same-window listeners.
   *
   * Example: `emit('workspace_changed', '/notes/history')` updates the tree and
   * returns after every local listener has seen that exact path.
   */
  emit<Name extends keyof Events>(
    name: Name,
    payload: Events[Name],
    options: EmitOptions = {}
  ): EventEnvelope<Name, Events[Name]> {
    this.sequence += 1;
    const event: EventEnvelope<Name, Events[Name]> = {
      id: `${this.idPrefix}-${this.sequence.toString(36)}`,
      name,
      payload,
      emittedAt: this.now(),
      correlationId: options.correlationId ?? null
    };
    const listeners = this.listeners.get(name);
    for (const listener of [...(listeners ?? [])]) {
      try {
        listener(event as unknown as AnyEnvelope<Events>);
      } catch (error) {
        this.onListenerError(error);
      }
    }
    return event;
  }
}
