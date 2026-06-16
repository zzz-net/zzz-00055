import { v4 as uuidv4 } from 'uuid';
import db, { saveDb } from '../models/db.js';
import { AuditLog, BackupAction, UserRole } from '../../shared/types.js';

export interface CreateAuditLogParams {
  action: BackupAction;
  operator: string;
  operatorRole: UserRole;
  targetBackupId?: string;
  targetBackupName?: string;
  detail?: Record<string, unknown>;
  result: 'success' | 'failed' | 'skipped' | 'denied';
  message?: string;
  ipAddress?: string;
}

export async function addAuditLog(params: CreateAuditLogParams): Promise<AuditLog> {
  await db.read();
  if (!db.data) {
    throw new Error('数据库未初始化');
  }
  const log: AuditLog = {
    id: uuidv4(),
    action: params.action,
    operator: params.operator,
    operatorRole: params.operatorRole,
    targetBackupId: params.targetBackupId,
    targetBackupName: params.targetBackupName,
    detail: params.detail,
    result: params.result,
    message: params.message,
    operatedAt: new Date().toISOString(),
    ipAddress: params.ipAddress,
  };
  db.data.auditLogs.unshift(log);
  await saveDb();
  return log;
}

export function getAuditLogs(limit = 100): AuditLog[] {
  if (!db.data) return [];
  return (db.data.auditLogs || []).slice(0, limit);
}

export function getAuditLogsByBackup(backupId: string, limit = 50): AuditLog[] {
  if (!db.data) return [];
  return (db.data.auditLogs || [])
    .filter(l => l.targetBackupId === backupId)
    .slice(0, limit);
}

export function getAuditLogsByAction(action: BackupAction, limit = 50): AuditLog[] {
  if (!db.data) return [];
  return (db.data.auditLogs || [])
    .filter(l => l.action === action)
    .slice(0, limit);
}
