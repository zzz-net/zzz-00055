import { v4 as uuidv4 } from 'uuid';
import db, { saveDb } from '../models/db.js';
import { Defect, Event, Point, SourceEvidence, SEVERITY_ORDER, DefectSeverity, OperationLog } from '../../shared/types.js';
import { calculateDistance } from '../utils/distance.js';

interface DefectWithPoint extends Defect {
  x: number;
  y: number;
}

export function getDefectsWithPoints(): DefectWithPoint[] {
  const defects = db.data?.defects || [];
  const points = db.data?.points || [];

  const pointMap = new Map<string, Point>();
  points.forEach(p => pointMap.set(p.pointCode, p));

  return defects.map(d => {
    const point = pointMap.get(d.pointCode);
    return {
      ...d,
      x: point?.x || 0,
      y: point?.y || 0,
    };
  });
}

export function getSeverityLevel(severity: DefectSeverity): string {
  const config = db.data?.config;
  const mapping = config?.levelMapping.find(m => m.severity === severity);
  return mapping?.level || '未知';
}

function buildEventsFromDefects(defectsWithPoints: DefectWithPoint[], configVersion: string): Event[] {
  const threshold = db.data?.config?.distanceThreshold || 5.0;

  const sortedDefects = [...defectsWithPoints].sort(
    (a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]
  );

  const events: Event[] = [];
  const processedIds = new Set<string>();

  for (let i = 0; i < sortedDefects.length; i++) {
    const primaryDefect = sortedDefects[i];
    if (processedIds.has(primaryDefect.id)) continue;

    const mergedDefects: DefectWithPoint[] = [primaryDefect];
    processedIds.add(primaryDefect.id);

    for (let j = i + 1; j < sortedDefects.length; j++) {
      const otherDefect = sortedDefects[j];
      if (processedIds.has(otherDefect.id)) continue;

      const distance = calculateDistance(
        primaryDefect.x, primaryDefect.y,
        otherDefect.x, otherDefect.y
      );

      if (distance <= threshold) {
        mergedDefects.push(otherDefect);
        processedIds.add(otherDefect.id);
      }
    }

    const highestSeverity = mergedDefects.reduce(
      (max, d) => SEVERITY_ORDER[d.severity] > SEVERITY_ORDER[max.severity] ? d : max,
      primaryDefect
    ).severity;

    const centerX = mergedDefects.reduce((sum, d) => sum + d.x, 0) / mergedDefects.length;
    const centerY = mergedDefects.reduce((sum, d) => sum + d.y, 0) / mergedDefects.length;

    const sourceEvidence: SourceEvidence[] = mergedDefects.map(d => {
      const batch = db.data?.batches.find(b => b.id === d.batchId);
      return {
        type: 'defect',
        batchId: d.batchId,
        batchName: batch?.name || '未知批次',
        recordId: d.id,
        data: { ...d },
      };
    });

    const event: Event = {
      id: uuidv4(),
      status: 'pending',
      mergedDefectIds: mergedDefects.map(d => d.id),
      primaryDefectId: primaryDefect.id,
      centerX,
      centerY,
      level: getSeverityLevel(highestSeverity),
      ruleVersion: configVersion,
      sourceEvidence,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    events.push(event);
  }

  return events;
}

export function mergeDefects(): Event[] {
  const config = db.data?.config;
  if (!config) return [];

  const defectsWithPoints = getDefectsWithPoints();
  const existingEventDefectIds = new Set<string>();

  db.data?.events.forEach(e => {
    e.mergedDefectIds.forEach(id => existingEventDefectIds.add(id));
  });

  const unprocessedDefects = defectsWithPoints.filter(
    d => !existingEventDefectIds.has(d.id)
  );

  return buildEventsFromDefects(unprocessedDefects, config.version);
}

export async function processAndSaveMergedDefects(): Promise<Event[]> {
  const newEvents = mergeDefects();

  if (newEvents.length > 0 && db.data) {
    db.data.events.push(...newEvents);
    await saveDb();
  }

  return newEvents;
}

export interface RecalculateResult {
  previousEventCount: number;
  newEventCount: number;
  preservedStatusCount: number;
}

export async function recalculateAllEvents(): Promise<RecalculateResult> {
  const config = db.data?.config;
  if (!config || !db.data) {
    return { previousEventCount: 0, newEventCount: 0, preservedStatusCount: 0 };
  }

  const previousEventCount = db.data.events.length;

  const oldEvents = [...db.data.events];
  const oldEventsByPrimaryDefect = new Map<string, Event>();
  oldEvents.forEach(e => {
    oldEventsByPrimaryDefect.set(e.primaryDefectId, e);
  });

  const oldLogsByEventId = new Map<string, OperationLog[]>();
  db.data.operationLogs.forEach(log => {
    if (!oldLogsByEventId.has(log.eventId)) {
      oldLogsByEventId.set(log.eventId, []);
    }
    oldLogsByEventId.get(log.eventId)!.push(log);
  });

  const defectsWithPoints = getDefectsWithPoints();
  const newEvents = buildEventsFromDefects(defectsWithPoints, config.version);

  let preservedStatusCount = 0;
  const newLogList: OperationLog[] = [];

  newEvents.forEach(newEvent => {
    const oldEvent = oldEventsByPrimaryDefect.get(newEvent.primaryDefectId);
    if (oldEvent) {
      newEvent.id = oldEvent.id;
      newEvent.status = oldEvent.status;
      newEvent.reviewer = oldEvent.reviewer;
      newEvent.reviewRemark = oldEvent.reviewRemark;
      newEvent.reviewedAt = oldEvent.reviewedAt;
      newEvent.closer = oldEvent.closer;
      newEvent.closedAt = oldEvent.closedAt;
      newEvent.createdAt = oldEvent.createdAt;
      newEvent.updatedAt = new Date().toISOString();

      const oldLogs = oldLogsByEventId.get(oldEvent.id);
      if (oldLogs) {
        newLogList.push(...oldLogs);
      }

      preservedStatusCount++;
    } else {
      newLogList.push(...(oldLogsByEventId.get(newEvent.id) || []));
    }

    const eventDefectPointCodes = new Set(
      newEvent.mergedDefectIds
        .map(dId => db.data!.defects.find(d => d.id === dId)?.pointCode)
        .filter(Boolean) as string[]
    );

    const rectifications = db.data!.rectifications.filter(r => {
      if (r.eventId && r.eventId === newEvent.id) return true;
      return eventDefectPointCodes.has(r.pointCode);
    });

    const rectificationEvidence: SourceEvidence[] = rectifications.map(r => {
      const batch = db.data!.batches.find(b => b.id === r.batchId);
      return {
        type: 'rectification',
        batchId: r.batchId,
        batchName: batch?.name || '未知批次',
        recordId: r.id,
        data: { ...r },
      };
    });

    newEvent.sourceEvidence = [...newEvent.sourceEvidence, ...rectificationEvidence];
  });

  const recalcLog: OperationLog = {
    id: uuidv4(),
    eventId: 'system',
    operator: 'system',
    action: 'rule_recalculated',
    remark: `规则版本从 ${oldEvents[0]?.ruleVersion || 'unknown'} 更新到 ${config.version}，重算 ${newEvents.length} 个事件`,
    operatedAt: new Date().toISOString(),
  };
  newLogList.push(recalcLog);

  db.data.events = newEvents;
  db.data.operationLogs = newLogList;

  await saveDb();

  return {
    previousEventCount,
    newEventCount: newEvents.length,
    preservedStatusCount,
  };
}
