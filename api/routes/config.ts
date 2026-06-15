import { Router } from 'express';
import db, { saveDb } from '../models/db.js';
import { validateConfig } from '../utils/validators.js';
import { DEFAULT_CONFIG } from '../../shared/types.js';
import { recalculateAllEvents } from '../services/defectMergeService.js';
import { addConfigHistory, shouldCreateHistory, getConfigHistory } from '../services/configHistoryService.js';

const router = Router();

router.get('/', async (req, res) => {
  await db.read();
  res.json(db.data?.config || DEFAULT_CONFIG);
});

router.get('/history', async (req, res) => {
  await db.read();
  const limit = parseInt(req.query.limit as string) || 10;
  res.json(getConfigHistory(limit));
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

    const oldConfig = { ...db.data.config };
    const newConfigData = {
      distanceThreshold: req.body.distanceThreshold,
      levelMapping: req.body.levelMapping,
    };

    if (!shouldCreateHistory(newConfigData)) {
      return res.json({
        success: true,
        config: oldConfig,
        skipped: true,
        message: '配置未发生变化，已跳过保存',
      });
    }

    const currentVersion = db.data.config.version;
    const [major, minor, patch] = currentVersion.split('.').map(Number);
    const operator = req.body.updatedBy || 'admin';

    db.data.config = {
      ...req.body,
      id: 'default',
      version: `${major}.${minor}.${patch + 1}`,
      updatedAt: new Date().toISOString(),
      updatedBy: operator,
    };

    addConfigHistory(oldConfig, db.data.config, 'save', operator);

    await saveDb();

    const recalcResult = await recalculateAllEvents();

    res.json({
      success: true,
      config: db.data.config,
      recalculated: recalcResult,
      skipped: false,
      message: '配置保存成功',
    });
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

    const oldConfig = { ...db.data.config };
    const resetConfig = {
      distanceThreshold: DEFAULT_CONFIG.distanceThreshold,
      levelMapping: DEFAULT_CONFIG.levelMapping,
    };

    if (!shouldCreateHistory(resetConfig)) {
      return res.json({
        success: true,
        config: oldConfig,
        skipped: true,
        message: '已经是默认配置，已跳过重置',
      });
    }

    const operator = req.body?.updatedBy || 'admin';

    db.data.config = {
      ...DEFAULT_CONFIG,
      updatedAt: new Date().toISOString(),
      updatedBy: operator,
    };

    addConfigHistory(oldConfig, db.data.config, 'reset', operator);

    await saveDb();

    const recalcResult = await recalculateAllEvents();

    res.json({
      success: true,
      config: db.data.config,
      recalculated: recalcResult,
      skipped: false,
      message: '配置重置成功',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
