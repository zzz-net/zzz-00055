import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import db, { saveDb, PATHS } from '../models/db.js';
import {
  BackupRecord,
  BackupValidateResult,
  BackupConflictItem,
  BackupDiffItem,
  BackupPreviewResponse,
  RestoreResult,
  RollbackPoint,
  Database,
  Config,
  ConfigHistory,
  DEFAULT_CONFIG,
} from '../../shared/types.js';

let RESTORE_IN_PROGRESS: { backupId: string; startedAt: string } | null = null;

function versionToNum(v: string): number {
  const parts = v.split('.').map(Number);
  while (parts.length < 3) parts.push(0);
  const [a, b, c] = parts;
  return (a || 0) * 1_000_000 + (b || 0) * 1_000 + (c || 0);
}

function bumpVersion(v: string): string {
  const [maj, min, pat] = v.split('.').map(Number);
  return `${maj || 0}.${min || 0}.${(pat || 0) + 1}`;
}

function computeChecksum(obj: unknown): string {
  const str = JSON.stringify(obj);
  return crypto.createHash('sha256').update(str).digest('hex');
}

function currentTimestamp(): string {
  const d = new Date();
  return d.toISOString().replace(/[-:T.]/g, '').slice(0, 14);
}

function serializeFullDatabase(): Database & { _meta: { dataVersion: number; generatedAt: string; checksum?: string } } {
  const snapshot = JSON.parse(JSON.stringify(db.data)) as Database;
  const checksum = computeChecksum({
    config: snapshot.config,
    batches: snapshot.batches,
    points: snapshot.points,
    defects: snapshot.defects,
    rectifications: snapshot.rectifications,
    events: snapshot.events,
    operationLogs: snapshot.operationLogs,
    configHistory: snapshot.configHistory,
  });
  return {
    ...snapshot,
    _meta: {
      dataVersion: 1,
      generatedAt: new Date().toISOString(),
      checksum,
    },
  };
}

function getRestoreStatus(): { inProgress: boolean; info?: typeof RESTORE_IN_PROGRESS } {
  return { inProgress: RESTORE_IN_PROGRESS !== null, info: RESTORE_IN_PROGRESS || undefined };
}

export interface CreateBackupParams {
  name?: string;
  description?: string;
  createdBy: string;
}

export async function createBackup(params: CreateBackupParams): Promise<BackupRecord> {
  await db.read();
  if (!db.data) {
    throw new Error('数据库未初始化');
  }

  const timestamp = currentTimestamp();
  const backupName = params.name?.trim() || `backup_${timestamp}`;
  const fileName = `${backupName}_${uuidv4().slice(0, 8)}.json`;
  const filePath = path.join(PATHS.backupsDir, fileName);

  const snapshot = serializeFullDatabase();
  const jsonStr = JSON.stringify(snapshot, null, 2);
  fs.writeFileSync(filePath, jsonStr, 'utf-8');
  const fileSize = fs.statSync(filePath).size;

  const record: BackupRecord = {
    id: uuidv4(),
    name: backupName,
    description: params.description,
    createdAt: new Date().toISOString(),
    createdBy: params.createdBy,
    configVersion: snapshot.config.version,
    dataVersion: snapshot._meta.dataVersion,
    fileSize,
    recordCounts: {
      batches: snapshot.batches.length,
      points: snapshot.points.length,
      defects: snapshot.defects.length,
      rectifications: snapshot.rectifications.length,
      events: snapshot.events.length,
      operationLogs: snapshot.operationLogs.length,
      configHistory: snapshot.configHistory.length,
    },
    filePath,
    status: 'available',
    checksum: snapshot._meta.checksum,
  };

  db.data.backups.unshift(record);
  await saveDb();
  return record;
}

export function listBackups(): BackupRecord[] {
  if (!db.data) return [];
  return [...(db.data.backups || [])];
}

export function getBackupById(id: string): BackupRecord | undefined {
  if (!db.data) return undefined;
  return (db.data.backups || []).find(b => b.id === id);
}

export async function deleteBackup(id: string, deletedBy: string): Promise<boolean> {
  if (!db.data) return false;
  const idx = (db.data.backups || []).findIndex(b => b.id === id);
  if (idx === -1) return false;
  const backup = db.data.backups[idx];
  if (backup.filePath && fs.existsSync(backup.filePath)) {
    try { fs.unlinkSync(backup.filePath); } catch { /* ignore */ }
  }
  db.data.backups.splice(idx, 1);
  void deletedBy;
  await saveDb();
  return true;
}

export function readBackupFile(filePath: string): unknown | null {
  try {
    const str = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(str);
  } catch {
    return null;
  }
}

interface BackupFileContent {
  config: Config;
  batches: unknown[];
  points: unknown[];
  defects: unknown[];
  rectifications: unknown[];
  events: unknown[];
  operationLogs: unknown[];
  configHistory: unknown[];
  backups?: unknown[];
  auditLogs?: unknown[];
  rollbackPoints?: unknown[];
  _meta?: {
    dataVersion: number;
    generatedAt?: string;
    checksum?: string;
  };
}

const REQUIRED_TOP_LEVEL = ['config', 'batches', 'points', 'defects', 'rectifications', 'events', 'operationLogs', 'configHistory'];

function validateStructure(content: BackupFileContent): { valid: boolean; missing: string[]; extra: string[] } {
  const keys = Object.keys(content).filter(k => k !== '_meta');
  const missing = REQUIRED_TOP_LEVEL.filter(k => !(k in content));
  const known = new Set([...REQUIRED_TOP_LEVEL, 'backups', 'auditLogs', 'rollbackPoints']);
  const extra = keys.filter(k => !known.has(k));
  return { valid: missing.length === 0, missing, extra };
}

function findDuplicateBackup(content: BackupFileContent, _currentChecksum: string): BackupRecord | null {
  if (!db.data) return null;
  const contentChecksum = computeChecksum({
    config: content.config,
    batches: content.batches,
    points: content.points,
    defects: content.defects,
    rectifications: content.rectifications,
    events: content.events,
    operationLogs: content.operationLogs,
    configHistory: content.configHistory,
  });
  for (const b of db.data.backups || []) {
    if (b.checksum === contentChecksum) return b;
  }
  return null;
}

export async function validateBackup(contentRaw: unknown): Promise<BackupValidateResult> {
  await db.read();
  if (!db.data) {
    return { valid: false, errors: ['数据库未初始化'], summary: '无法校验：数据库未初始化' };
  }
  const warnings: string[] = [];
  const errors: string[] = [];
  const conflicts: BackupConflictItem[] = [];

  const content = contentRaw as BackupFileContent;

  const formatValid = contentRaw !== null && typeof contentRaw === 'object' && content !== null;
  if (!formatValid) {
    errors.push('备份文件不是有效的 JSON 对象');
    return { valid: false, format: { valid: false, jsonParseable: false }, errors, summary: '文件格式错误' };
  }

  const configExists = !!content.config && typeof content.config === 'object';
  let formatChecksumMatch = true;
  if (content._meta?.checksum) {
    const computed = computeChecksum({
      config: content.config,
      batches: content.batches,
      points: content.points,
      defects: content.defects,
      rectifications: content.rectifications,
      events: content.events,
      operationLogs: content.operationLogs,
      configHistory: content.configHistory,
    });
    formatChecksumMatch = computed === content._meta.checksum;
    if (!formatChecksumMatch) {
      warnings.push('备份校验和不匹配，文件可能被修改');
    }
  }

  if (!configExists) {
    errors.push('备份文件缺少 config 配置对象');
  }

  const structure = validateStructure(content);
  if (!structure.valid) {
    errors.push(`备份文件缺少必需字段：${structure.missing.join(', ')}`);
  }
  if (structure.extra.length > 0) {
    warnings.push(`备份文件包含额外字段：${structure.extra.join(', ')}`);
  }

  const backupVersion = (content.config as Config)?.version || '0.0.0';
  const currentVersion = db.data.config.version;
  const bv = versionToNum(backupVersion);
  const cv = versionToNum(currentVersion);
  const versionInfo = {
    backupVersion,
    currentVersion,
    isOlder: bv < cv,
    isSame: bv === cv,
    isNewer: bv > cv,
  };

  if (versionInfo.isOlder) {
    conflicts.push({
      type: 'config_version_downgrade',
      severity: 'error',
      field: 'config.version',
      backupValue: backupVersion,
      currentValue: currentVersion,
      message: `备份版本 v${backupVersion} 低于当前版本 v${currentVersion}，恢复后配置版本会回退`,
      suggestion: '建议仅在确认需要回退时选择强制恢复',
      canOverride: true,
    });
  }

  const dup = findDuplicateBackup(content, computeChecksum({
    config: db.data.config,
    batches: db.data.batches,
    points: db.data.points,
    defects: db.data.defects,
    rectifications: db.data.rectifications,
    events: db.data.events,
    operationLogs: db.data.operationLogs,
    configHistory: db.data.configHistory,
  }));
  if (dup) {
    conflicts.push({
      type: 'duplicate_backup',
      severity: 'warning',
      backupValue: dup.name,
      currentValue: dup.id,
      message: `该备份内容与已存在备份 "${dup.name}" (ID: ${dup.id.slice(0, 8)}...) 完全相同，重复导入无意义`,
      suggestion: '您可以直接使用已有备份进行恢复',
      canOverride: true,
    });
  }

  const curCounts = {
    batches: db.data.batches.length,
    points: db.data.points.length,
    defects: db.data.defects.length,
    rectifications: db.data.rectifications.length,
    events: db.data.events.length,
    operationLogs: db.data.operationLogs.length,
    configHistory: db.data.configHistory.length,
  };
  const backupCounts = {
    batches: (content.batches || []).length,
    points: (content.points || []).length,
    defects: (content.defects || []).length,
    rectifications: (content.rectifications || []).length,
    events: (content.events || []).length,
    operationLogs: (content.operationLogs || []).length,
    configHistory: (content.configHistory || []).length,
  };
  const lessRecords: string[] = [];
  for (const k of Object.keys(curCounts) as (keyof typeof curCounts)[]) {
    if (backupCounts[k] < curCounts[k]) {
      lessRecords.push(`${k}: ${curCounts[k]} → ${backupCounts[k]}`);
    }
  }
  if (lessRecords.length > 0) {
    conflicts.push({
      type: 'data_loss_risk',
      severity: 'warning',
      backupValue: backupCounts,
      currentValue: curCounts,
      message: '备份中某些记录数量少于当前数据库，恢复可能导致数据丢失：' + lessRecords.join('; '),
      suggestion: '请仔细预览差异，确认这是预期结果再继续',
      canOverride: true,
    });
  }

  const restoreStatus = getRestoreStatus();
  if (restoreStatus.inProgress) {
    conflicts.push({
      type: 'restore_in_progress',
      severity: 'error',
      message: `已有恢复任务正在进行中（备份ID ${restoreStatus.info?.backupId.slice(0, 8)}...），请等待完成后再试`,
      suggestion: '请等待当前任务完成，或系统超时后重试',
      canOverride: false,
    });
  }

  const hasBlockingError = conflicts.some(c => c.severity === 'error' && !c.canOverride) || errors.length > 0;
  const valid = formatValid && structure.valid && configExists && !hasBlockingError;

  let summary: string;
  if (!formatValid) summary = '文件格式错误，无法解析';
  else if (!structure.valid || !configExists) summary = '备份结构不完整';
  else if (conflicts.length === 0 && warnings.length === 0) summary = '备份校验通过，可以安全恢复';
  else if (conflicts.some(c => c.severity === 'error')) summary = '存在严重冲突，需强制覆盖才能恢复';
  else summary = '校验通过，存在警告信息，请预览差异后恢复';

  return {
    valid,
    version: versionInfo,
    structure: { valid: structure.valid, missingFields: structure.missing, extraFields: structure.extra },
    format: { valid: formatValid, checksumMatch: formatChecksumMatch, jsonParseable: formatValid },
    conflicts,
    warnings,
    errors,
    summary,
  };
}

export function computeDiff(contentRaw: unknown): BackupDiffItem[] {
  if (!db.data) return [];
  const content = contentRaw as BackupFileContent;
  const diff: BackupDiffItem[] = [];

  const bCfg = content.config;
  const cCfg = db.data.config;
  if (bCfg) {
    diff.push({
      section: 'config',
      field: 'distanceThreshold',
      backupValue: bCfg.distanceThreshold,
      currentValue: cCfg.distanceThreshold,
      changed: bCfg.distanceThreshold !== cCfg.distanceThreshold,
    });
    diff.push({
      section: 'config',
      field: 'version',
      backupValue: bCfg.version,
      currentValue: cCfg.version,
      changed: bCfg.version !== cCfg.version,
    });
    diff.push({
      section: 'config',
      field: 'levelMapping',
      backupValue: bCfg.levelMapping,
      currentValue: cCfg.levelMapping,
      changed: JSON.stringify(bCfg.levelMapping) !== JSON.stringify(cCfg.levelMapping),
    });
    diff.push({
      section: 'config',
      field: 'updatedBy',
      backupValue: bCfg.updatedBy,
      currentValue: cCfg.updatedBy,
      changed: bCfg.updatedBy !== cCfg.updatedBy,
    });
  }

  const curCounts = {
    batches: db.data.batches.length,
    points: db.data.points.length,
    defects: db.data.defects.length,
    rectifications: db.data.rectifications.length,
    events: db.data.events.length,
    operationLogs: db.data.operationLogs.length,
    configHistory: db.data.configHistory.length,
  };
  const backupCounts = {
    batches: (content.batches || []).length,
    points: (content.points || []).length,
    defects: (content.defects || []).length,
    rectifications: (content.rectifications || []).length,
    events: (content.events || []).length,
    operationLogs: (content.operationLogs || []).length,
    configHistory: (content.configHistory || []).length,
  };
  for (const k of Object.keys(curCounts) as (keyof typeof curCounts)[]) {
    diff.push({
      section: 'record_counts',
      field: k,
      backupValue: backupCounts[k],
      currentValue: curCounts[k],
      changed: backupCounts[k] !== curCounts[k],
    });
  }

  const bHist = content.configHistory || [] as ConfigHistory[];
  const cHist = db.data.configHistory || [];
  if (bHist.length > 0 && cHist.length > 0) {
    const b0 = bHist[0] as ConfigHistory;
    const c0 = cHist[0] as ConfigHistory;
    diff.push({
      section: 'config_history_latest',
      field: 'latest_version',
      backupValue: b0?.version,
      currentValue: c0?.version,
      changed: b0?.version !== c0?.version,
    });
    diff.push({
      section: 'config_history_latest',
      field: 'latest_action',
      backupValue: b0?.action,
      currentValue: c0?.action,
      changed: b0?.action !== c0?.action,
    });
  }

  return diff;
}

export async function previewBackup(contentRaw: unknown, backupName = '上传备份'): Promise<BackupPreviewResponse> {
  const validated = await validateBackup(contentRaw);
  const diff = computeDiff(contentRaw);
  const content = contentRaw as BackupFileContent;

  const blockingErrors = (validated.conflicts || []).filter(c => c.severity === 'error' && !c.canOverride);
  const canRestore = validated.valid && blockingErrors.length === 0;
  let reason: string | undefined;
  if (!canRestore) {
    if (validated.errors?.length) reason = validated.errors[0];
    else if (blockingErrors.length) reason = blockingErrors[0].message;
    else reason = validated.summary;
  }

  return {
    validated,
    diff,
    backupMeta: {
      name: backupName,
      configVersion: content?.config?.version || '未知',
      createdAt: content?._meta?.generatedAt || new Date().toISOString(),
      createdBy: (content?.config?.updatedBy as string) || 'unknown',
      recordCounts: {
        batches: (content?.batches || []).length,
        points: (content?.points || []).length,
        defects: (content?.defects || []).length,
        rectifications: (content?.rectifications || []).length,
        events: (content?.events || []).length,
        operationLogs: (content?.operationLogs || []).length,
        configHistory: (content?.configHistory || []).length,
      },
    },
    canRestore,
    reason,
  };
}

async function createRollbackPoint(operator: string, relatedBackupId?: string): Promise<RollbackPoint> {
  if (!db.data) throw new Error('数据库未初始化');
  const snapshot = serializeFullDatabase();
  const timestamp = currentTimestamp();
  const fileName = `rollback_${timestamp}_${uuidv4().slice(0, 8)}.json`;
  const filePath = path.join(PATHS.rollbacksDir, fileName);
  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
  const fileSize = fs.statSync(filePath).size;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const point: RollbackPoint = {
    id: uuidv4(),
    name: `恢复前回滚点_${timestamp}`,
    createdAt: new Date().toISOString(),
    createdBy: operator,
    expiresAt,
    filePath,
    fileSize,
    checksum: snapshot._meta.checksum,
    preRestoreSnapshot: {
      configVersion: db.data.config.version,
    },
    status: 'available',
    relatedRestoreBackupId: relatedBackupId,
  };
  db.data.rollbackPoints.unshift(point);
  await saveDb();
  return point;
}

export function listRollbackPoints(): RollbackPoint[] {
  if (!db.data) return [];
  const now = Date.now();
  return (db.data.rollbackPoints || []).map(rp => {
    if (rp.status === 'available' && new Date(rp.expiresAt).getTime() < now) {
      return { ...rp, status: 'expired' as const };
    }
    return rp;
  });
}

export function getRollbackPoint(id: string): RollbackPoint | undefined {
  if (!db.data) return undefined;
  return (db.data.rollbackPoints || []).find(r => r.id === id);
}

export interface RestoreBackupParams {
  content: unknown;
  operator: string;
  force?: boolean;
  backupId?: string;
  backupName?: string;
}

export async function restoreBackup(params: RestoreBackupParams): Promise<RestoreResult> {
  await db.read();
  if (!db.data) {
    return { success: false, message: '数据库未初始化' };
  }
  const startTime = Date.now();
  const validated = await validateBackup(params.content);

  if (!validated.valid) {
    return {
      success: false,
      message: validated.errors?.[0] || '备份校验失败，无法恢复',
      warnings: validated.warnings,
    };
  }

  const severe = (validated.conflicts || []).filter(c => c.severity === 'error');
  if (severe.length > 0) {
    const blocking = severe.find(c => !c.canOverride);
    if (blocking) {
      return { success: false, message: blocking.message };
    }
    if (!params.force) {
      return {
        success: false,
        message: '存在严重冲突，需要强制覆盖才能恢复，请带 force=true 参数重试',
        warnings: severe.map(c => c.message),
      };
    }
  }

  if (RESTORE_IN_PROGRESS) {
    return { success: false, message: '已有恢复任务进行中，请稍后重试' };
  }

  const content = params.content as BackupFileContent;
  const configVersionBefore = db.data.config.version;

  try {
    RESTORE_IN_PROGRESS = {
      backupId: params.backupId || 'uploaded',
      startedAt: new Date().toISOString(),
    };

    const rollbackPoint = await createRollbackPoint(params.operator, params.backupId);

    let finalVersion = content.config.version;
    if (versionToNum(content.config.version) < versionToNum(configVersionBefore)) {
      finalVersion = bumpVersion(configVersionBefore);
    }

    const finalConfig: Config = {
      ...content.config,
      id: 'default',
      version: finalVersion,
      updatedAt: new Date().toISOString(),
      updatedBy: params.operator,
    };

    const recordsRestored: Record<string, number> = {};
    db.data.batches = content.batches as []; recordsRestored.batches = db.data.batches.length;
    db.data.points = content.points as []; recordsRestored.points = db.data.points.length;
    db.data.defects = content.defects as []; recordsRestored.defects = db.data.defects.length;
    db.data.rectifications = content.rectifications as []; recordsRestored.rectifications = db.data.rectifications.length;
    db.data.events = content.events as []; recordsRestored.events = db.data.events.length;
    db.data.operationLogs = content.operationLogs as []; recordsRestored.operationLogs = db.data.operationLogs.length;
    db.data.config = finalConfig;
    db.data.configHistory = content.configHistory as []; recordsRestored.configHistory = db.data.configHistory.length;

    if (params.backupId) {
      const backup = getBackupById(params.backupId);
      if (backup) {
        backup.status = 'restored';
        backup.restoredAt = new Date().toISOString();
        backup.restoredBy = params.operator;
      }
    }

    rollbackPoint.preRestoreSnapshot.configVersionBefore = configVersionBefore;
    rollbackPoint.preRestoreSnapshot.configVersionAfter = finalVersion;

    const importHistories = db.data.configHistory || [];
    importHistories.unshift({
      id: uuidv4(),
      version: finalVersion,
      action: 'import',
      operator: params.operator,
      operatedAt: new Date().toISOString(),
      result: 'success',
      trigger: 'import',
      message: `从备份 ${params.backupName || '上传文件'} 恢复数据，配置版本 v${finalVersion}`,
      distanceThreshold: {
        before: (content.config.distanceThreshold),
        after: finalConfig.distanceThreshold,
      },
      levelMapping: {
        before: content.config.levelMapping,
        after: finalConfig.levelMapping,
      },
    });
    db.data.configHistory = importHistories;

    await saveDb();

    return {
      success: true,
      rollbackPointId: rollbackPoint.id,
      restoredConfigVersion: finalVersion,
      message: `恢复成功，当前配置版本 v${finalVersion}。回滚点已创建（24小时内可回滚）`,
      warnings: validated.warnings,
      details: {
        recordsRestored,
        durationMs: Date.now() - startTime,
      },
    };
  } catch (e: unknown) {
    const err = e as Error;
    return { success: false, message: `恢复过程中出现异常：${err.message}` };
  } finally {
    RESTORE_IN_PROGRESS = null;
  }
}

export function clearInterruptedRestore(): boolean {
  if (RESTORE_IN_PROGRESS) {
    RESTORE_IN_PROGRESS = null;
    return true;
  }
  return false;
}

export interface ApplyRollbackParams {
  rollbackId: string;
  operator: string;
}

export async function applyRollback(params: ApplyRollbackParams): Promise<RestoreResult> {
  await db.read();
  if (!db.data) {
    return { success: false, message: '数据库未初始化' };
  }
  const startTime = Date.now();
  const rp = getRollbackPoint(params.rollbackId);
  if (!rp) {
    return { success: false, message: '回滚点不存在' };
  }
  if (rp.status !== 'available') {
    return { success: false, message: `回滚点状态为 ${rp.status}，无法应用` };
  }
  if (new Date(rp.expiresAt).getTime() < Date.now()) {
    rp.status = 'expired';
    await saveDb();
    return { success: false, message: '回滚点已过期（超过24小时）' };
  }

  const content = readBackupFile(rp.filePath) as BackupFileContent;
  if (!content || !content.config) {
    return { success: false, message: '回滚点文件损坏或不存在' };
  }

  try {
    const recordsRestored: Record<string, number> = {};
    db.data.batches = content.batches as []; recordsRestored.batches = db.data.batches.length;
    db.data.points = content.points as []; recordsRestored.points = db.data.points.length;
    db.data.defects = content.defects as []; recordsRestored.defects = db.data.defects.length;
    db.data.rectifications = content.rectifications as []; recordsRestored.rectifications = db.data.rectifications.length;
    db.data.events = content.events as []; recordsRestored.events = db.data.events.length;
    db.data.operationLogs = content.operationLogs as []; recordsRestored.operationLogs = db.data.operationLogs.length;
    const rollbackVersion = bumpVersion(db.data.config.version);
    db.data.config = {
      ...content.config,
      id: 'default',
      version: rollbackVersion,
      updatedAt: new Date().toISOString(),
      updatedBy: params.operator + '_rollback',
    } as Config;
    const rbHistories: ConfigHistory[] = (content.configHistory as ConfigHistory[]) || [];
    rbHistories.unshift({
      id: uuidv4(),
      version: rollbackVersion,
      action: 'rollback',
      operator: params.operator,
      operatedAt: new Date().toISOString(),
      result: 'success',
      trigger: 'rollback',
      message: `回滚到 ID=${rp.id} 对应的状态，配置版本 v${rollbackVersion}`,
      distanceThreshold: {
        before: content.config.distanceThreshold,
        after: db.data.config.distanceThreshold,
      },
      levelMapping: {
        before: content.config.levelMapping,
        after: db.data.config.levelMapping,
      },
    });
    db.data.configHistory = rbHistories; recordsRestored.configHistory = db.data.configHistory.length;

    rp.status = 'applied';
    rp.appliedAt = new Date().toISOString();
    rp.appliedBy = params.operator;

    await saveDb();

    return {
      success: true,
      restoredConfigVersion: db.data.config.version,
      message: `已成功回滚到之前的状态，当前配置版本 v${db.data.config.version}`,
      details: {
        recordsRestored,
        durationMs: Date.now() - startTime,
      },
    };
  } catch (e: unknown) {
    const err = e as Error;
    return { success: false, message: `回滚过程中出现异常：${err.message}` };
  }
}

export async function deleteRollbackPoint(id: string, operator: string): Promise<boolean> {
  if (!db.data) return false;
  const idx = (db.data.rollbackPoints || []).findIndex(r => r.id === id);
  if (idx === -1) return false;
  const rp = db.data.rollbackPoints[idx];
  if (rp.filePath && fs.existsSync(rp.filePath)) {
    try { fs.unlinkSync(rp.filePath); } catch { /* ignore */ }
  }
  db.data.rollbackPoints[idx] = { ...rp, status: 'deleted' };
  void operator;
  await saveDb();
  return true;
}

export interface RegisterUploadedBackupParams {
  content: unknown;
  name: string;
  createdBy: string;
  uploadedFilePath: string;
  description?: string;
}

export async function registerUploadedBackup(params: RegisterUploadedBackupParams): Promise<BackupRecord> {
  await db.read();
  if (!db.data) throw new Error('数据库未初始化');
  const content = params.content as BackupFileContent;
  const fileSize = fs.existsSync(params.uploadedFilePath) ? fs.statSync(params.uploadedFilePath).size : 0;

  const checksum = computeChecksum({
    config: content.config,
    batches: content.batches,
    points: content.points,
    defects: content.defects,
    rectifications: content.rectifications,
    events: content.events,
    operationLogs: content.operationLogs,
    configHistory: content.configHistory,
  });

  const record: BackupRecord = {
    id: uuidv4(),
    name: params.name,
    description: params.description,
    createdAt: content._meta?.generatedAt || new Date().toISOString(),
    createdBy: (content.config?.updatedBy as string) || params.createdBy,
    configVersion: content.config?.version || DEFAULT_CONFIG.version,
    dataVersion: content._meta?.dataVersion || 1,
    fileSize,
    recordCounts: {
      batches: (content.batches || []).length,
      points: (content.points || []).length,
      defects: (content.defects || []).length,
      rectifications: (content.rectifications || []).length,
      events: (content.events || []).length,
      operationLogs: (content.operationLogs || []).length,
      configHistory: (content.configHistory || []).length,
    },
    filePath: params.uploadedFilePath,
    status: 'available',
    checksum,
  };
  db.data.backups.unshift(record);
  await saveDb();
  return record;
}
