import { v4 as uuidv4 } from 'uuid';
import db, { saveDb } from '../models/db.js';
import { Defect, Event, Point, SourceEvidence, SEVERITY_ORDER, DefectSeverity } from '../../shared/types.js';
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

export function mergeDefects(): Event[] {
  const config = db.data?.config;
  if (!config) return [];
  
  const threshold = config.distanceThreshold;
  const defectsWithPoints = getDefectsWithPoints();
  const existingEventDefectIds = new Set<string>();
  
  db.data?.events.forEach(e => {
    e.mergedDefectIds.forEach(id => existingEventDefectIds.add(id));
  });
  
  const unprocessedDefects = defectsWithPoints.filter(
    d => !existingEventDefectIds.has(d.id)
  );
  
  const sortedDefects = [...unprocessedDefects].sort(
    (a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]
  );
  
  const newEvents: Event[] = [];
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
      ruleVersion: config.version,
      sourceEvidence,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    newEvents.push(event);
  }
  
  return newEvents;
}

export async function processAndSaveMergedDefects(): Promise<Event[]> {
  const newEvents = mergeDefects();
  
  if (newEvents.length > 0 && db.data) {
    db.data.events.push(...newEvents);
    await saveDb();
  }
  
  return newEvents;
}
