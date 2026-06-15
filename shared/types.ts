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
  data: Record<string, any>;
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

export type ConfigHistoryAction = 'save' | 'reset';

export interface ConfigHistory {
  id: string;
  version: string;
  action: ConfigHistoryAction;
  operator: string;
  operatedAt: string;
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

export interface Database {
  batches: Batch[];
  points: Point[];
  defects: Defect[];
  rectifications: Rectification[];
  events: Event[];
  operationLogs: OperationLog[];
  config: Config;
  configHistory: ConfigHistory[];
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
