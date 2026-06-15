import db from '../models/db.js';
import { Event, Batch, Point, Defect, Rectification } from '../../shared/types.js';

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

export function exportEventsCSV(batchId?: string): string {
  let events = db.data?.events || [];
  
  if (batchId) {
    events = events.filter(e => 
      e.sourceEvidence.some(ev => ev.batchId === batchId)
    );
  }
  
  const flattened = events.map(e => ({
    id: e.id,
    status: e.status,
    level: e.level,
    centerX: e.centerX,
    centerY: e.centerY,
    mergedDefectCount: e.mergedDefectIds.length,
    primaryDefectId: e.primaryDefectId,
    reviewer: e.reviewer || '',
    reviewRemark: e.reviewRemark || '',
    reviewedAt: e.reviewedAt || '',
    closer: e.closer || '',
    closedAt: e.closedAt || '',
    ruleVersion: e.ruleVersion,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  }));
  
  return toCSV(flattened, [
    'id', 'status', 'level', 'centerX', 'centerY', 'mergedDefectCount',
    'primaryDefectId', 'reviewer', 'reviewRemark', 'reviewedAt',
    'closer', 'closedAt', 'ruleVersion', 'createdAt', 'updatedAt'
  ]);
}

export function exportEventsJSON(batchId?: string): string {
  let events = db.data?.events || [];
  
  if (batchId) {
    events = events.filter(e => 
      e.sourceEvidence.some(ev => ev.batchId === batchId)
    );
  }
  
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
  
  return JSON.stringify(enriched, null, 2);
}

export function exportFullDataJSON(): string {
  return JSON.stringify({
    batches: db.data?.batches || [],
    points: db.data?.points || [],
    defects: db.data?.defects || [],
    rectifications: db.data?.rectifications || [],
    events: db.data?.events || [],
    operationLogs: db.data?.operationLogs || [],
    config: db.data?.config,
    exportedAt: new Date().toISOString(),
  }, null, 2);
}
