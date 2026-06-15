import { v4 as uuidv4 } from 'uuid';
import db, { saveDb } from '../models/db.js';
import { EventStatus, OperationLog, Event } from '../../shared/types.js';

const VALID_TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  pending: ['need_rectify', 'cancelled'],
  need_rectify: ['reviewed'],
  reviewed: ['closed', 'need_rectify'],
  closed: ['need_rectify'],
  cancelled: [],
};

export function canTransition(from: EventStatus, to: EventStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) || false;
}

export async function updateEventStatus(
  eventId: string,
  newStatus: EventStatus,
  operator: string,
  remark?: string
): Promise<Event | null> {
  await db.read();
  
  const event = db.data?.events.find(e => e.id === eventId);
  if (!event) return null;
  
  if (!canTransition(event.status, newStatus)) {
    throw new Error(`无法从 ${event.status} 转换到 ${newStatus}`);
  }
  
  const oldStatus = event.status;
  event.status = newStatus;
  event.updatedAt = new Date().toISOString();
  
  if (newStatus === 'reviewed') {
    event.reviewedAt = new Date().toISOString();
  }
  
  if (newStatus === 'closed') {
    event.closedAt = new Date().toISOString();
    event.closer = operator;
  }
  
  const log: OperationLog = {
    id: uuidv4(),
    eventId,
    operator,
    action: 'status_change',
    oldStatus,
    newStatus,
    remark,
    operatedAt: new Date().toISOString(),
  };
  
  db.data?.operationLogs.push(log);
  await saveDb();
  
  return event;
}

export async function addReviewRemark(
  eventId: string,
  remark: string,
  reviewer: string
): Promise<Event | null> {
  await db.read();
  
  const event = db.data?.events.find(e => e.id === eventId);
  if (!event) return null;
  
  event.reviewRemark = remark;
  event.reviewer = reviewer;
  event.reviewedAt = new Date().toISOString();
  event.updatedAt = new Date().toISOString();
  
  const log: OperationLog = {
    id: uuidv4(),
    eventId,
    operator: reviewer,
    action: 'add_remark',
    remark,
    operatedAt: new Date().toISOString(),
  };
  
  db.data?.operationLogs.push(log);
  await saveDb();
  
  return event;
}

export function getEventLogs(eventId: string): OperationLog[] {
  return db.data?.operationLogs.filter(log => log.eventId === eventId) || [];
}

export function getEventWithDetails(eventId: string) {
  const event = db.data?.events.find(e => e.id === eventId);
  if (!event) return null;
  
  const defects = db.data?.defects.filter(d => event.mergedDefectIds.includes(d.id)) || [];
  const rectifications = db.data?.rectifications.filter(r => r.eventId === eventId) || [];
  const logs = getEventLogs(eventId);
  
  return {
    event,
    defects,
    rectifications,
    logs,
  };
}
