/**
 * The versioning rules and living version-list domain.
 *
 * Example: callers use `versioningPlan` from the pure side and `versionsOfDocument` from the living
 * side; neither needs to know how the implementation modules depend on each other.
 *
 * May import: the pure rules and living version list. Upholds: one versioning public facade without
 * a cycle through this index.
 */

export {
  APP_IDENTITY,
  consentFrom,
  versionLocation,
  versionMessage,
  versionStamp,
  versionTitle,
  versionedNow,
  versioningPlan,
  versionsState,
  versionsVisible
} from './rules';
export type {
  CloudKind,
  Consent,
  GitIdentity,
  RepositoryShape,
  StoredConsent,
  Version,
  VersioningFacts,
  VersioningPlan,
  VersioningReport,
  VersionsState
} from './rules';
export {
  VERSIONS_CHANGED,
  versionsOfDocument
} from './versions';
export type { VersionsReading } from './versions';
