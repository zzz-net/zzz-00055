import { Router } from 'express';
import db from '../models/db.js';
import { updateEventStatus, addReviewRemark, getEventWithDetails } from '../services/eventService.js';
import { EventStatus } from '../../shared/types.js';

const router = Router();

router.get('/', async (req, res) => {
  await db.read();
  
  const { status, batchId } = req.query;
  let events = db.data?.events || [];
  
  if (status) {
    events = events.filter(e => e.status === status);
  }
  
  if (batchId) {
    events = events.filter(e => 
      e.sourceEvidence.some(ev => ev.batchId === batchId)
    );
  }
  
  res.json(events);
});

router.get('/:id', async (req, res) => {
  await db.read();
  const details = getEventWithDetails(req.params.id);
  
  if (!details) {
    return res.status(404).json({ message: '事件不存在' });
  }
  
  res.json(details);
});

router.patch('/:id/status', async (req, res) => {
  try {
    const { newStatus, operator, remark } = req.body;
    
    if (!newStatus || !operator) {
      return res.status(400).json({ 
        success: false, 
        message: 'newStatus 和 operator 必填' 
      });
    }
    
    const result = await updateEventStatus(
      req.params.id,
      newStatus as EventStatus,
      operator,
      remark
    );
    
    if (!result) {
      return res.status(404).json({ success: false, message: '事件不存在' });
    }
    
    res.json({ success: true, event: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.patch('/:id/remark', async (req, res) => {
  try {
    const { remark, reviewer } = req.body;
    
    if (!remark || !reviewer) {
      return res.status(400).json({ 
        success: false, 
        message: 'remark 和 reviewer 必填' 
      });
    }
    
    const result = await addReviewRemark(
      req.params.id,
      remark,
      reviewer
    );
    
    if (!result) {
      return res.status(404).json({ success: false, message: '事件不存在' });
    }
    
    res.json({ success: true, event: result });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
