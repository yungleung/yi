/**
 * The public event-domain facade.
 *
 * Example: consumers import `eventManager`, `AppEvents` and `AppEventName` from here; the typed
 * contract stays in `contracts.ts` and transport/delivery stays in `manager.ts`.
 *
 * May import: the event contract and manager siblings. Upholds: one explicit event public surface.
 */

export {
  DOCUMENT_CHANGED,
  EVENT_BOUNDARIES,
  isInboundEvent
} from './contracts';
export type {
  AppEventName,
  AppEvents,
  DocumentChanged,
  DocumentChangeReason,
  EventBoundary
} from './contracts';
export type { ExportActivityState } from '../export_activity';
export { EventManager, eventManager } from './manager';
export type { AppEvent } from './manager';
