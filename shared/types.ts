export type EventStatus = 'pending' | 'need_rectify' | 'reviewed' | 'closed' | 'cancelled';

export type DefectSeverity = 'minor' | 'medium' | 'major' | 'critical';

export type BatchType = 'points' | 'defects' | 'rectification';

export interface Batch {
  id: string;
  name: string;
  type: BatchType;
  status: 'importing' | 'success' | 'failed';
  importedAt: string;
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  errorMessage?: string;
  errors?: ValidationError[];
}

export interface ValidationError {
  row: number;
  field: string;
  message: string;
  value?: string;
}

export interface Point {
  id: string;
  batchId: string;
  pointCode: string;
  x: number;
  y: number;
  z: number;
  description?: string;
}

export interface Defect {
  id: string;
  batchId: string;
  pointCode: string;
  defectType: string;
  severity: DefectSeverity;
  description: string;
  imageUrl?: string;
  detectedAt: string;
}

export interface Rectification {
  id: string;
  batchId: string;
  eventId?: string;
  pointCode: string;
  rectificationMeasure: string;
  rectifier: string;
  rectifiedAt: string;
  remark?: string;
}

export interface Event {
  id: string;
  status: EventStatus;
  mergedDefectIds: string[];
  primaryDefectId: string;
  centerX: number;
  centerY: number;
  level: string;
  reviewer?: string;
  reviewRemark?: string;
  reviewedAt?: string;
  closer?: string;
  closedAt?: string;
  ruleVersion: string;
  sourceEvidence: SourceEvidence[];
  createdAt: string;
  updatedAt: string;
}

export interface SourceEvidence {
  type: 'defect' | 'point' | 'rectification';
  batchId: string;
  batchName: string;
  recordId: string;
  data: Record<string, unknown>;
}

export interface OperationLog {
  id: string;
  eventId: string;
  operator: string;
  action: string;
  oldStatus?: EventStatus;
  newStatus?: EventStatus;
  remark?: string;
  operatedAt: string;
}

export type ConfigHistoryAction = 'save' | 'reset' | 'force_save' | 'conflict_failed' | 'skip_duplicate' | 'import' | 'force_reset' | 'rollback';

export interface ConfigHistory {
  id: string;
  version: string;
  action: ConfigHistoryAction;
  operator: string;
  operatedAt: string;
  result: 'success' | 'failed' | 'skipped';
  trigger: 'user' | 'system' | 'import' | 'rollback';
  conflictNote?: string;
  message?: string;
  distanceThreshold: {
    before: number;
    after: number;
  };
  levelMapping: {
    before: LevelMappingItem[];
    after: LevelMappingItem[];
  };
}

export interface Config {
  id: string;
  distanceThreshold: number;
  levelMapping: LevelMappingItem[];
  version: string;
  updatedAt: string;
  updatedBy: string;
}

export interface LevelMappingItem {
  severity: DefectSeverity;
  level: string;
  color: string;
}

export type UserRole = 'admin' | 'viewer' | 'operator';

export interface BackupRecord {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  createdBy: string;
  configVersion: string;
  dataVersion: number;
  fileSize: number;
  recordCounts: {
    batches: number;
    points: number;
    defects: number;
    rectifications: number;
    events: number;
    operationLogs: number;
    configHistory: number;
  };
  filePath?: string;
  status: 'available' | 'restoring' | 'restored' | 'rollback' | 'failed';
  checksum: string;
  restoredAt?: string;
  restoredBy?: string;
}

export type BackupAction =
  | 'backup_create'
  | 'backup_download'
  | 'backup_delete'
  | 'backup_upload'
  | 'restore_preview'
  | 'restore_start'
  | 'restore_success'
  | 'restore_failed'
  | 'restore_interrupted'
  | 'rollback_create'
  | 'rollback_apply'
  | 'rollback_delete';

export interface AuditLog {
  id: string;
  action: BackupAction;
  operator: string;
  operatorRole: UserRole;
  targetBackupId?: string;
  targetBackupName?: string;
  detail?: Record<string, unknown>;
  result: 'success' | 'failed' | 'skipped' | 'denied';
  message?: string;
  operatedAt: string;
  ipAddress?: string;
}

export interface RollbackPoint {
  id: string;
  name: string;
  createdAt: string;
  createdBy: string;
  expiresAt: string;
  filePath: string;
  fileSize: number;
  checksum: string;
  preRestoreSnapshot: {
    configVersion: string;
    configVersionBefore?: string;
    configVersionAfter?: string;
  };
  status: 'available' | 'applied' | 'expired' | 'deleted';
  appliedAt?: string;
  appliedBy?: string;
  relatedRestoreBackupId?: string;
}

export interface BackupValidateResult {
  valid: boolean;
  version?: {
    backupVersion: string;
    currentVersion: string;
    isOlder: boolean;
    isSame: boolean;
    isNewer: boolean;
  };
  structure?: {
    valid: boolean;
    missingFields: string[];
    extraFields: string[];
  };
  format?: {
    valid: boolean;
    checksumMatch?: boolean;
    jsonParseable?: boolean;
  };
  conflicts?: BackupConflictItem[];
  warnings?: string[];
  errors?: string[];
  summary?: string;
}

export interface BackupConflictItem {
  type: 'config_version_downgrade' | 'duplicate_backup' | 'data_loss_risk' | 'restore_in_progress' | 'record_conflict';
  severity: 'error' | 'warning' | 'info';
  field?: string;
  backupValue?: unknown;
  currentValue?: unknown;
  message: string;
  suggestion?: string;
  canOverride: boolean;
}

export interface BackupDiffItem {
  section: 'config' | 'record_counts' | 'config_history_latest';
  field: string;
  backupValue: unknown;
  currentValue: unknown;
  changed: boolean;
}

export interface BackupPreviewResponse {
  validated: BackupValidateResult;
  diff: BackupDiffItem[];
  backupMeta: Pick<BackupRecord, 'name' | 'configVersion' | 'createdAt' | 'createdBy' | 'recordCounts'>;
  canRestore: boolean;
  reason?: string;
}

export interface RestoreResult {
  success: boolean;
  rollbackPointId?: string;
  restoredConfigVersion?: string;
  message: string;
  warnings?: string[];
  details?: {
    recordsRestored: Record<string, number>;
    durationMs: number;
  };
}

export interface Database {
  batches: Batch[];
  points: Point[];
  defects: Defect[];
  rectifications: Rectification[];
  events: Event[];
  operationLogs: OperationLog[];
  config: Config;
  configHistory: ConfigHistory[];
  backups: BackupRecord[];
  auditLogs: AuditLog[];
  rollbackPoints: RollbackPoint[];
}

export const STATUS_LABELS: Record<EventStatus, string> = {
  pending: '待确认',
  need_rectify: '需整改',
  reviewed: '已复核',
  closed: '已关闭',
  cancelled: '已作废',
};

export const SEVERITY_ORDER: Record<DefectSeverity, number> = {
  critical: 4,
  major: 3,
  medium: 2,
  minor: 1,
};

export interface EventDetailResponse {
  event: Event;
  defects: Defect[];
  rectifications: Rectification[];
  logs: OperationLog[];
}

export interface ExportSummary {
  exportedAt: string;
  ruleVersion: string;
  batchFilter: {
    applied: boolean;
    batchId?: string;
    batchName?: string;
  };
  eventCount: number;
  statusCounts: Record<string, number>;
  levelCounts: Record<string, number>;
}

export const DEFAULT_CONFIG: Config = {
  id: 'default',
  distanceThreshold: 5.0,
  levelMapping: [
    { severity: 'critical', level: '一级', color: '#ef4444' },
    { severity: 'major', level: '二级', color: '#f59e0b' },
    { severity: 'medium', level: '三级', color: '#10b981' },
    { severity: 'minor', level: '四级', color: '#6366f1' },
  ],
  version: '1.0.0',
  updatedAt: new Date().toISOString(),
  updatedBy: 'system',
};
