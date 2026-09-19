export {
  parseJUnitXml,
  normalizeJUnitCases,
  dedupeNormalizedResults,
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
  latestOutcomeByCase,
  readinessBadgeLabel,
  type StampedResult,
  DEFAULT_MILESTONE_THRESHOLDS,
  type MilestoneCase,
  type MilestoneThresholds,
  type ReadinessInputs,
  type ReadinessResult,
} from "./readiness";

export {
  buildTriageQueue,
  failureFingerprint,
  clusterTriageBySignature,
  type TriageFailure,
  type TriageQueueItem,
  type TriageSignatureCluster,
} from "./triage";

export {
  detectFlakeSignal,
  flakeBadgeLabel,
  type FlakeHistoryPoint,
  type FlakeSignal,
} from "./flake";

export {
  computeReliability,
  detectReliabilityRegression,
  type ReliabilityDimension,
  type ReliabilityHistoryPoint,
  type ReliabilityRegression,
  type ReliabilityReport,
  type ReliabilitySlice,
  type ReliabilityStatus,
} from "./reliability";

export {
  normalizeErrorMessage,
  stackTopFrame,
  computeFailureSignature,
  failureSignatureHash,
  clusterFailuresBySignature,
  type FailureSignature,
  type FailureSignatureInput,
  type FailureSignatureCluster,
  type SignatureClusterMember,
} from "./failure-signature";

export {
  computeCoverage,
  type CoverageDimension,
  type CoverageEdge,
  type CoverageGap,
  type CoverageInput,
  type CoverageIntent,
  type CoverageReport,
  type CoverageRequirement,
  type CoverageRisk,
} from "./coverage";

export {
  computeFreshness,
  computeFreshnessDetail,
  freshnessLabel,
  type FreshnessState,
  type FreshnessInput,
  type FreshnessResult,
} from "./freshness";

export {
  computeImpact,
  pathMatchesRule,
  type ImpactPathRule,
  type ImpactComponent,
  type ImpactRequirement,
  type ImpactIntent,
  type ImpactImplementation,
  type ImpactEdge,
  type ImpactInput,
  type ImpactGapHint,
  type ImpactReport,
} from "./impact";

export {
  emptyRepresentation,
  normalizeRepresentation,
  isEmptyRepresentation,
  toStepTable,
  fromStepTable,
  toGherkin,
  fromGherkin,
  toNaturalLanguage,
  fromNaturalLanguage,
  toTraditionalSteps,
  fromTraditionalSteps,
  parseRepresentation,
  type ClauseKind,
  type StructuredRepresentation,
  type RepresentationStep,
  type TraditionalProjection,
} from "./representation";

export {
  EXECUTION_PROTOCOL_VERSION,
  executionStatuses,
  artifactKinds,
  executionEnvironmentSchema,
  executionArtifactSchema,
  executionResultSchema,
  executionReportSchema,
  parseExecutionReport,
  parseExecutionReportOrThrow,
  type ExecutionStatus,
  type ArtifactKind,
  type ExecutionEnvironment,
  type ExecutionArtifact,
  type ExecutionResult,
  type ExecutionReport,
  type ExecutionProtocolParseError,
  type ParseExecutionReportResult,
} from "./execution-protocol";

export {
  queryEntities,
  queryFilterOps,
  querySortDirections,
  validateQualityQuery,
  isQualityQuery,
  type QueryEntity,
  type QueryFilterOp,
  type QueryScalar,
  type QueryEqFilter,
  type QueryNeqFilter,
  type QueryInFilter,
  type QueryExistsFilter,
  type QueryFilter,
  type QuerySortDirection,
  type QuerySort,
  type QualityQuery,
  type QueryValidationIssue,
  type QueryValidationResult,
} from "./query-ast";

export {
  parseQualityQuery,
  parseQualityQueryOrThrow,
  type QueryParseResult,
} from "./query-parse";
export {
  computeReleaseQuality,
  type ReleaseExecutionSummary,
  type ReleaseQualityGap,
  type ReleaseQualityInput,
  type ReleaseQualitySummary,
} from "./release-quality";

export {
  compareReleases,
  type CountDelta,
  type CoverageDimensionDelta,
  type ReleaseComparison,
  type ReleaseSnapshot,
} from "./compare-releases";

export {
  proposalEntityTypes,
  proposalActions,
  proposalStatuses,
  proposalActorTypes,
  validateProposalPayload,
  isProposalPayload,
  isProposalStatus,
  isProposalActorType,
  type ProposalEntityType,
  type ProposalAction,
  type ProposalStatus,
  type ProposalActorType,
  type ProposalSnapshot,
  type ProposalDiff,
  type ProposalPayload,
  type Proposal,
  type ProposalValidationIssue,
  type ProposalValidationResult,
} from "./proposal";