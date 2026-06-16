import db from '../models/db.js';
import { Event, OperationLog, ConfigHistory, ExportSummary } from '../../shared/types.js';

function toCSV(data: any[], headers: string[]): string {
  const headerRow = headers.join(',');
  const dataRows = data.map(row =>
    headers.map(h => {
      const val = row[h];
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(',')
  );
  return [headerRow, ...dataRows].join('\n');
}

function getLastStatusChangeTime(eventId: string): string {
  const logs = db.data?.operationLogs.filter(
    (l: OperationLog) => l.eventId === eventId && l.action === 'status_change'
  ) || [];
  if (logs.length === 0) return '';
  return logs.reduce(
    (latest, log) => log.operatedAt > latest.operatedAt ? log : latest
  ).operatedAt;
}

function getOperationLogCount(eventId: string): number {
  return db.data?.operationLogs.filter((l: OperationLog) => l.eventId === eventId).length || 0;
}

function getSourceEvidenceSummary(event: Event): {
  evidenceCount: number;
  evidenceTypes: string;
  evidenceBatchNames: string;
  primaryDefectPointCode: string;
} {
  const evidence = event.sourceEvidence || [];
  const evidenceCount = evidence.length;

  const typeSet = new Set(evidence.map(e => e.type));
  const evidenceTypes = Array.from(typeSet).join('|');

  const batchNameSet = new Set(evidence.map(e => e.batchName));
  const evidenceBatchNames = Array.from(batchNameSet).join('|');

  const defectEvidence = evidence.find(e => e.type === 'defect' && e.recordId === event.primaryDefectId);
  const primaryDefectPointCode = defectEvidence?.data?.pointCode || '';

  return {
    evidenceCount,
    evidenceTypes,
    evidenceBatchNames,
    primaryDefectPointCode,
  };
}

function getSortedEvents(batchId?: string): Event[] {
  let events = [...(db.data?.events || [])];

  if (batchId) {
    events = events.filter(e =>
      e.sourceEvidence.some(ev => ev.batchId === batchId)
    );
  }

  events.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return events;
}

export function getExportSummary(batchId?: string): ExportSummary {
  const events = getSortedEvents(batchId);
  const config = db.data?.config;
  const batch = batchId ? db.data?.batches.find(b => b.id === batchId) : undefined;

  const statusCounts = events.reduce((acc, e) => {
    acc[e.status] = (acc[e.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const levelCounts = events.reduce((acc, e) => {
    acc[e.level] = (acc[e.level] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    exportedAt: new Date().toISOString(),
    ruleVersion: config?.version || '',
    batchFilter: {
      applied: !!batchId,
      batchId: batchId || undefined,
      batchName: batch?.name || undefined,
    },
    eventCount: events.length,
    statusCounts,
    levelCounts,
  };
}

export function exportEventsCSV(batchId?: string): string {
  const events = getSortedEvents(batchId);
  const config = db.data?.config;

  const flattened = events.map(e => {
    const evidenceSummary = getSourceEvidenceSummary(e);
    const lastStatusChange = getLastStatusChangeTime(e.id);
    const logCount = getOperationLogCount(e.id);

    return {
      id: e.id,
      status: e.status,
      level: e.level,
      centerX: Number(e.centerX.toFixed(4)),
      centerY: Number(e.centerY.toFixed(4)),
      mergedDefectCount: e.mergedDefectIds.length,
      primaryDefectId: e.primaryDefectId,
      primaryDefectPointCode: evidenceSummary.primaryDefectPointCode,
      reviewer: e.reviewer || '',
      reviewRemark: e.reviewRemark || '',
      reviewedAt: e.reviewedAt || '',
      closer: e.closer || '',
      closedAt: e.closedAt || '',
      ruleVersion: e.ruleVersion,
      currentRuleVersion: config?.version || '',
      sourceEvidenceCount: evidenceSummary.evidenceCount,
      sourceEvidenceTypes: evidenceSummary.evidenceTypes,
      sourceEvidenceBatches: evidenceSummary.evidenceBatchNames,
      operationLogCount: logCount,
      lastStatusChangeAt: lastStatusChange,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    };
  });

  return toCSV(flattened, [
    'id', 'status', 'level', 'centerX', 'centerY', 'mergedDefectCount',
    'primaryDefectId', 'primaryDefectPointCode',
    'reviewer', 'reviewRemark', 'reviewedAt',
    'closer', 'closedAt',
    'ruleVersion', 'currentRuleVersion',
    'sourceEvidenceCount', 'sourceEvidenceTypes', 'sourceEvidenceBatches',
    'operationLogCount', 'lastStatusChangeAt',
    'createdAt', 'updatedAt'
  ]);
}

export function exportEventsJSON(batchId?: string): string {
  const events = getSortedEvents(batchId);
  const summary = getExportSummary(batchId);

  const enriched = events.map(e => {
    const defects = db.data?.defects.filter(d => e.mergedDefectIds.includes(d.id)) || [];
    const rectifications = db.data?.rectifications.filter(r => r.eventId === e.id) || [];
    const logs = db.data?.operationLogs.filter(l => l.eventId === e.id) || [];

    return {
      ...e,
      defects,
      rectifications,
      operationLogs: logs,
    };
  });

  return JSON.stringify({
    exportedAt: summary.exportedAt,
    eventCount: enriched.length,
    currentRuleVersion: summary.ruleVersion,
    summary,
    events: enriched,
  }, null, 2);
}

export function exportFullDataJSON(): string {
  const summary = getExportSummary();

  return JSON.stringify({
    exportedAt: summary.exportedAt,
    summary,
    batches: db.data?.batches || [],
    points: db.data?.points || [],
    defects: db.data?.defects || [],
    rectifications: db.data?.rectifications || [],
    events: db.data?.events || [],
    operationLogs: db.data?.operationLogs || [],
    config: db.data?.config,
    configHistory: db.data?.configHistory || [],
  }, null, 2);
}

export function exportConfigHistoryCSV(): string {
  const history = db.data?.configHistory || [];

  const flattened = history.map(item => {
    const levelMappingBefore = item.levelMapping.before
      .sort((a, b) => a.severity.localeCompare(b.severity))
      .map(m => `${m.severity}:${m.level}:${m.color}`)
      .join('|');
    const levelMappingAfter = item.levelMapping.after
      .sort((a, b) => a.severity.localeCompare(b.severity))
      .map(m => `${m.severity}:${m.level}:${m.color}`)
      .join('|');

    return {
      id: item.id,
      version: item.version,
      action: item.action,
      operator: item.operator,
      operatedAt: item.operatedAt,
      conflictNote: item.conflictNote || '',
      distanceThresholdBefore: item.distanceThreshold.before,
      distanceThresholdAfter: item.distanceThreshold.after,
      levelMappingBefore,
      levelMappingAfter,
    };
  });

  return toCSV(flattened, [
    'id', 'version', 'action', 'operator', 'operatedAt', 'conflictNote',
    'distanceThresholdBefore', 'distanceThresholdAfter',
    'levelMappingBefore', 'levelMappingAfter',
  ]);
}
