import { Router } from 'express';
import db, { saveDb } from '../models/db.js';
import { validateConfig } from '../utils/validators.js';
import { DEFAULT_CONFIG } from '../../shared/types.js';

const router = Router();

router.get('/', async (req, res) => {
  await db.read();
  res.json(db.data?.config || DEFAULT_CONFIG);
});

router.put('/', async (req, res) => {
  try {
    const errors = validateConfig(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }
    
    await db.read();
    
    if (!db.data) {
      return res.status(500).json({ success: false, message: '数据库未初始化' });
    }
    
    const currentVersion = db.data.config.version;
    const [major, minor, patch] = currentVersion.split('.').map(Number);
    
    db.data.config = {
      ...req.body,
      id: 'default',
      version: `${major}.${minor}.${patch + 1}`,
      updatedAt: new Date().toISOString(),
      updatedBy: req.body.updatedBy || 'admin',
    };
    
    await saveDb();
    res.json({ success: true, config: db.data.config });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/reset', async (req, res) => {
  try {
    await db.read();
    
    if (!db.data) {
      return res.status(500).json({ success: false, message: '数据库未初始化' });
    }
    
    db.data.config = {
      ...DEFAULT_CONFIG,
      updatedAt: new Date().toISOString(),
      updatedBy: req.body.updatedBy || 'admin',
    };
    
    await saveDb();
    res.json({ success: true, config: db.data.config });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
