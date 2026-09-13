export {
  parseJUnitXml,
  normalizeJUnitCases,
  mergeShardResults,
  summarizeResults,
  externalKeyForCase,
  type JUnitTestCase,
  type JUnitSuite,
  type JUnitReport,
  type NormalizedResult,
} from "./junit";

export {
  computeQualityPulse,
  type PulseInput,
  type QualityPulse,
} from "./pulse";

export {
  computeMilestoneReadiness,
  readinessBadgeLabel,
  DEFAULT_MILESTONE_THRESHOLDS,
  type MilestoneCase,
  type MilestoneThresholds,
  type ReadinessInputs,
  type ReadinessResult,
} from "./readiness";

export {
  buildTriageQueue,
  failureFingerprint,
  type TriageFailure,
  type TriageQueueItem,
} from "./triage";

export {
  detectFlakeSignal,
  flakeBadgeLabel,
  type FlakeHistoryPoint,
  type FlakeSignal,
} from "./flake";
