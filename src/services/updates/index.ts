/**
 * Public entrypoint for the app's update domain.
 *
 * May import: the update flow and contracts. Upholds: consumers see the
 * controller and its ports without reaching into implementation files.
 */

export { UpdateController } from './flow';
export type {
  RemoteUpdate,
  UpdateBackend,
  UpdateMode,
  UpdatePresenter,
  UpdateResult,
  UpdateSummary
} from './contracts';
