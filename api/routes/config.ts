import { Router } from 'express';
import db, { saveDb } from '../models/db.js';
import { validateConfig } from '../utils/validators.js';
import { DEFAULT_CONFIG } from '../../shared/types.js';
import { recalculateAllEvents } from '../services/defectMergeService.js';
import { addConfigHistory, shouldCreateHistory, getConfigHistory } from '../services/configHistoryService.js';
import { exportConfigHistoryCSV } from '../services/exportService.js';

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

router.get('/history/csv', (_req, res) => {
  const csv = exportConfigHistoryCSV();

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="config_history_${Date.now()}.csv"`);
  res.send('\uFEFF' + csv);
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

    const expectedVersion = req.body.expectedVersion;
    const force = req.body.force === true;
    const currentVersion = db.data.config.version;

    if (!force && expectedVersion && expectedVersion !== currentVersion) {
      return res.status(409).json({
        success: false,
        conflict: true,
        currentVersion,
        expectedVersion,
        currentConfig: db.data.config,
        message: `配置已被他人修改（当前版本 v${currentVersion}，您基于的版本 v${expectedVersion}），请确认后选择强制覆盖或刷新`,
      });
    }

    const [major, minor, patch] = currentVersion.split('.').map(Number);
    const operator = req.body.updatedBy || 'admin';
    const isForceSave = force && expectedVersion && expectedVersion !== currentVersion;

    db.data.config = {
      ...req.body,
      id: 'default',
      version: `${major}.${minor}.${patch + 1}`,
      updatedAt: new Date().toISOString(),
      updatedBy: operator,
    };

    const action = isForceSave ? 'force_save' : 'save';
    const conflictNote = isForceSave
      ? `覆盖冲突：基于版本 v${expectedVersion} 强制覆盖当前版本 v${currentVersion}`
      : undefined;

    addConfigHistory(oldConfig, db.data.config, action, operator, conflictNote);

    await saveDb();

    const recalcResult = await recalculateAllEvents();

    res.json({
      success: true,
      config: db.data.config,
      recalculated: recalcResult,
      skipped: false,
      message: isForceSave ? '配置已强制覆盖保存' : '配置保存成功',
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

    const expectedVersion = req.body?.expectedVersion;
    const force = req.body?.force === true;
    const currentVersion = db.data.config.version;

    if (!force && expectedVersion && expectedVersion !== currentVersion) {
      return res.status(409).json({
        success: false,
        conflict: true,
        currentVersion,
        expectedVersion,
        currentConfig: db.data.config,
        message: `配置已被他人修改（当前版本 v${currentVersion}，您基于的版本 v${expectedVersion}），请确认后选择强制重置或刷新`,
      });
    }

    const operator = req.body?.updatedBy || 'admin';
    const isForceReset = force && expectedVersion && expectedVersion !== currentVersion;

    db.data.config = {
      ...DEFAULT_CONFIG,
      updatedAt: new Date().toISOString(),
      updatedBy: operator,
    };

    const action = isForceReset ? 'force_save' : 'reset';
    const conflictNote = isForceReset
      ? `覆盖冲突：基于版本 v${expectedVersion} 强制重置覆盖当前版本 v${currentVersion}`
      : undefined;

    addConfigHistory(oldConfig, db.data.config, action, operator, conflictNote);

    await saveDb();

    const recalcResult = await recalculateAllEvents();

    res.json({
      success: true,
      config: db.data.config,
      recalculated: recalcResult,
      skipped: false,
      message: isForceReset ? '配置已强制重置' : '配置重置成功',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
