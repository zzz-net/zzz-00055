import { Router } from 'express';
import db from '../models/db.js';

const router = Router();

router.get('/', async (req, res) => {
  await db.read();
  res.json(db.data?.batches || []);
});

router.get('/:id', async (req, res) => {
  await db.read();
  const batch = db.data?.batches.find(b => b.id === req.params.id);
  
  if (!batch) {
    return res.status(404).json({ message: '批次不存在' });
  }
  
  const points = db.data?.points.filter(p => p.batchId === batch.id) || [];
  const defects = db.data?.defects.filter(d => d.batchId === batch.id) || [];
  const rectifications = db.data?.rectifications.filter(r => r.batchId === batch.id) || [];
  
  res.json({
    batch,
    points,
    defects,
    rectifications,
  });
});

export default router;
