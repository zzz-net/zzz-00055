import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

const SAMPLE_DIR = path.join(projectRoot, 'data', 'samples');
const DB_PATH = path.join(projectRoot, 'data', 'db.json');
const BACKUP_PATH = path.join(projectRoot, 'data', 'db_test_backup.json');
const TEMP_DIR = path.join(projectRoot, 'data', 'test_temp');

function copySample(filename: string): string {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
  const src = path.join(SAMPLE_DIR, filename);
  const dest = path.join(TEMP_DIR, `${Date.now()}-${Math.random()}-${filename}`);
  fs.copyFileSync(src, dest);
  return dest;
}

function cleanupTemp() {
  if (fs.existsSync(TEMP_DIR)) {
    const files = fs.readdirSync(TEMP_DIR);
    for (const f of files) {
      try { fs.unlinkSync(path.join(TEMP_DIR, f)); } catch { /* ignore cleanup errors */ }
    }
    try { fs.rmdirSync(TEMP_DIR); } catch { /* ignore cleanup errors */ }
  }
}

describe('回归测试：缺陷复盘看板', () => {
  let db: any;
  let saveDb: any;
  let importPoints: any;
  let importDefects: any;
  let importRectification: any;
  let exportEventsCSV: any;
  let exportEventsJSON: any;
  let recalculateAllEvents: any;

  before(async () => {
    if (fs.existsSync(DB_PATH)) {
      fs.copyFileSync(DB_PATH, BACKUP_PATH);
    }

    const dbModule = await import('../api/models/db.js');
    db = dbModule.db;
    saveDb = dbModule.saveDb;

    const importModule = await import('../api/services/importService.js');
    importPoints = importModule.importPoints;
    importDefects = importModule.importDefects;
    importRectification = importModule.importRectification;

    const exportModule = await import('../api/services/exportService.js');
    exportEventsCSV = exportModule.exportEventsCSV;
    exportEventsJSON = exportModule.exportEventsJSON;

    const mergeModule = await import('../api/services/defectMergeService.js');
    recalculateAllEvents = mergeModule.recalculateAllEvents;
  });

  after(() => {
    if (fs.existsSync(BACKUP_PATH)) {
      fs.copyFileSync(BACKUP_PATH, DB_PATH);
      fs.unlinkSync(BACKUP_PATH);
    }
    cleanupTemp();
  });

  const resetDb = async () => {
    await db.read();
    db.data.batches = [];
    db.data.points = [];
    db.data.defects = [];
    db.data.rectifications = [];
    db.data.events = [];
    db.data.operationLogs = [];
    db.data.config = {
      id: 'default',
      distanceThreshold: 5.0,
      levelMapping: [
        { severity: 'critical', level: '一级', color: '#ef4444' },
        { severity: 'major', level: '二级', color: '#f59e0b' },
        { severity: 'medium', level: '三级', color: '#10b981' },
        { severity: 'minor', level: '四级', color: '#6366f1' },
      ],
      version: '1.0.0',
      updatedAt: new Date().toISOString(),
      updatedBy: 'system',
    };
    await saveDb();
  };

  describe('1. 数据导入 - 成功路径', () => {
    before(async () => {
      await resetDb();
    });

    it('导入点位CSV成功', async () => {
      const f = copySample('roof_points_202606.csv');
      const result = await importPoints(f, 'roof_points_202606.csv');

      assert.equal(result.success, true, '导入应该成功');
      assert.ok(result.batch, '应该返回批次信息');
      assert.equal(result.batch.status, 'success');
      assert.equal(result.batch.totalRecords, 12);
      assert.equal(result.batch.validRecords, 12);
      assert.equal(result.batch.invalidRecords, 0);
      assert.equal(db.data.points.length, 12);
    });

    it('导入缺陷JSON成功并生成事件', async () => {
      const f = copySample('defects_202606.json');
      const result = await importDefects(f, 'defects_202606.json');

      assert.equal(result.success, true, '导入应该成功');
      assert.equal(result.batch.status, 'success');
      assert.equal(result.batch.totalRecords, 8);
      assert.equal(result.batch.validRecords, 8);
      assert.equal(db.data.defects.length, 8);
      assert.ok(result.newEvents > 0, '应该生成新事件');
      assert.ok(db.data.events.length > 0);
    });

    it('导入整改CSV成功', async () => {
      const f = copySample('rectification_202606.csv');
      const result = await importRectification(f, 'rectification_202606.csv');

      assert.equal(result.success, true, '导入应该成功');
      assert.equal(result.batch.status, 'success');
      assert.equal(result.batch.totalRecords, 3);
      assert.equal(result.batch.validRecords, 3);
      assert.equal(db.data.rectifications.length, 3);
    });
  });

  describe('2. 重复导入校验', () => {
    before(async () => {
      await resetDb();
    });

    it('第一次导入点位成功', async () => {
      const f = copySample('roof_points_202606.csv');
      const result = await importPoints(f, 'roof_points_202606.csv');
      assert.equal(result.success, true);
    });

    it('重复导入相同点位批次失败', async () => {
      const f = copySample('roof_points_202606.csv');
      const result = await importPoints(f, 'roof_points_202606.csv');

      assert.equal(result.success, false);
      assert.ok(result.message?.includes('已存在'));
      assert.equal(
        db.data.batches.filter((b: any) => b.type === 'points' && b.status === 'success').length,
        1
      );
    });

    it('重复导入相同缺陷批次失败', async () => {
      const f1 = copySample('defects_202606.json');
      await importDefects(f1, 'defects_202606.json');

      const f2 = copySample('defects_202606.json');
      const result = await importDefects(f2, 'defects_202606.json');

      assert.equal(result.success, false);
      assert.ok(result.message?.includes('已存在'));
    });

    it('重复导入相同整改批次失败', async () => {
      const f1 = copySample('rectification_202606.csv');
      await importRectification(f1, 'rectification_202606.csv');

      const f2 = copySample('rectification_202606.csv');
      const result = await importRectification(f2, 'rectification_202606.csv');

      assert.equal(result.success, false);
      assert.ok(result.message?.includes('已存在'));
    });
  });

  describe('3. 非法数据导入 - 整批失败不留脏数据', () => {
    before(async () => {
      await resetDb();
      const f = copySample('roof_points_202606.csv');
      await importPoints(f, 'roof_points_202606.csv');
    });

    it('点位非法数据整批失败，不写入任何点位', async () => {
      const beforeCount = db.data.points.length;

      const f = copySample('roof_points_invalid.csv');
      const result = await importPoints(f, 'roof_points_invalid.csv');

      assert.equal(result.success, false);
      assert.equal(result.batch?.status, 'failed');
      assert.ok(result.errors && result.errors.length > 0);
      assert.ok(result.errors.some((e: any) => e.field === 'pointCode'));
      assert.ok(result.errors.some((e: any) => e.field === 'x'));
      assert.ok(result.errors.every((e: any) => typeof e.row === 'number' && e.row > 0));

      assert.equal(db.data.points.length, beforeCount, '不应该写入任何点位数据');
    });

    it('缺陷非法数据整批失败，不写入缺陷也不生成事件', async () => {
      const beforeDefectCount = db.data.defects.length;
      const beforeEventCount = db.data.events.length;

      const f = copySample('defects_invalid.json');
      const result = await importDefects(f, 'defects_invalid.json');

      assert.equal(result.success, false);
      assert.equal(result.batch?.status, 'failed');
      assert.ok(result.errors && result.errors.length > 0);

      assert.equal(db.data.defects.length, beforeDefectCount, '不应该写入缺陷');
      assert.equal(db.data.events.length, beforeEventCount, '不应该生成新事件');
    });

    it('整改非法数据整批失败，不写入任何整改记录', async () => {
      const beforeCount = db.data.rectifications.length;

      const f = copySample('rectification_invalid.csv');
      const result = await importRectification(f, 'rectification_invalid.csv');

      assert.equal(result.success, false);
      assert.equal(result.batch?.status, 'failed');
      assert.ok(result.errors && result.errors.length > 0);

      assert.equal(db.data.rectifications.length, beforeCount);
    });
  });

  describe('4. 规则切换立即生效', () => {
    let initialEventCount: number;

    before(async () => {
      await resetDb();
      const pf = copySample('roof_points_202606.csv');
      const df = copySample('defects_202606.json');
      await importPoints(pf, 'roof_points_202606.csv');
      await importDefects(df, 'defects_202606.json');
      initialEventCount = db.data.events.length;
    });

    it('初始事件规则版本与配置一致', () => {
      assert.ok(initialEventCount > 0);
      db.data.events.forEach((e: any) => {
        assert.equal(e.ruleVersion, db.data.config.version);
      });
    });

    it('增大距离阈值后事件减少，版本号更新', async () => {
      db.data.config.distanceThreshold = 50.0;
      db.data.config.version = '1.0.1';
      db.data.config.updatedAt = new Date().toISOString();
      await saveDb();

      const result = await recalculateAllEvents();

      assert.equal(result.previousEventCount, initialEventCount);
      assert.ok(result.newEventCount < initialEventCount, '阈值增大事件应减少');
      assert.ok(result.preservedStatusCount > 0, '应保留部分事件状态');

      assert.equal(db.data.events.length, result.newEventCount);
      db.data.events.forEach((e: any) => {
        assert.equal(e.ruleVersion, '1.0.1');
      });
    });

    it('减小距离阈值后事件增加', async () => {
      const beforeCount = db.data.events.length;

      db.data.config.distanceThreshold = 1.0;
      db.data.config.version = '1.0.2';
      db.data.config.updatedAt = new Date().toISOString();
      await saveDb();

      const result = await recalculateAllEvents();

      assert.ok(result.newEventCount > beforeCount, '阈值减小事件应增加');
      assert.equal(db.data.events.length, result.newEventCount);
    });

    it('修改等级映射后事件等级立即更新', async () => {
      const beforeLevels = new Set(db.data.events.map((e: any) => e.level));

      db.data.config.levelMapping = [
        { severity: 'critical', level: 'S级', color: '#ef4444' },
        { severity: 'major', level: 'A级', color: '#f59e0b' },
        { severity: 'medium', level: 'B级', color: '#10b981' },
        { severity: 'minor', level: 'C级', color: '#6366f1' },
      ];
      db.data.config.version = '1.0.3';
      db.data.config.updatedAt = new Date().toISOString();
      await saveDb();

      await recalculateAllEvents();

      const afterLevels = new Set(db.data.events.map((e: any) => e.level));
      assert.notDeepEqual(beforeLevels, afterLevels);
      assert.ok(Array.from(afterLevels).includes('S级'));
      assert.ok(Array.from(afterLevels).includes('A级'));
    });
  });

  describe('5. 数据导出增强', () => {
    before(async () => {
      await resetDb();
      const pf = copySample('roof_points_202606.csv');
      const df = copySample('defects_202606.json');
      const rf = copySample('rectification_202606.csv');
      await importPoints(pf, 'roof_points_202606.csv');
      await importDefects(df, 'defects_202606.json');
      await importRectification(rf, 'rectification_202606.csv');
    });

    it('CSV导出包含所有增强字段', () => {
      const csv = exportEventsCSV();
      const lines = csv.trim().split('\n');
      const header = lines[0];

      assert.ok(header.includes('primaryDefectPointCode'), '应有主缺陷点位编号');
      assert.ok(header.includes('ruleVersion'), '应有规则版本');
      assert.ok(header.includes('currentRuleVersion'), '应有当前规则版本');
      assert.ok(header.includes('sourceEvidenceCount'), '应有来源证据数量');
      assert.ok(header.includes('sourceEvidenceTypes'), '应有来源证据类型');
      assert.ok(header.includes('sourceEvidenceBatches'), '应有来源证据批次');
      assert.ok(header.includes('operationLogCount'), '应有操作日志数量');
      assert.ok(header.includes('lastStatusChangeAt'), '应有最后状态变更时间');

      assert.equal(lines.length - 1, db.data.events.length);
    });

    it('JSON导出结构完整', () => {
      const jsonStr = exportEventsJSON();
      const json = JSON.parse(jsonStr);

      assert.ok(json.exportedAt);
      assert.equal(typeof json.eventCount, 'number');
      assert.ok(json.currentRuleVersion);
      assert.ok(Array.isArray(json.events));
      assert.equal(json.events.length, json.eventCount);

      json.events.forEach((e: any) => {
        assert.ok(Array.isArray(e.defects));
        assert.ok(Array.isArray(e.rectifications));
        assert.ok(Array.isArray(e.operationLogs));
        assert.ok(e.ruleVersion);
        assert.ok(e.sourceEvidence);
      });
    });

    it('CSV与JSON导出一一对应（相同排序、相同数量）', () => {
      const csv = exportEventsCSV();
      const jsonStr = exportEventsJSON();
      const json = JSON.parse(jsonStr);

      const csvLines = csv.trim().split('\n').slice(1);
      const csvIds = csvLines.map(line => line.split(',')[0]);
      const jsonIds = json.events.map((e: any) => e.id);

      assert.equal(csvIds.length, jsonIds.length);
      assert.deepEqual(csvIds, jsonIds);
    });
  });

  describe('6. 重启持久化验证', () => {
    let beforeState: any;

    before(async () => {
      await resetDb();
      const pf = copySample('roof_points_202606.csv');
      const df = copySample('defects_202606.json');
      await importPoints(pf, 'roof_points_202606.csv');
      await importDefects(df, 'defects_202606.json');

      db.data.config.distanceThreshold = 10.0;
      db.data.config.version = '2.0.0';
      await saveDb();
      await recalculateAllEvents();

      beforeState = JSON.parse(JSON.stringify(db.data));
    });

    it('模拟重启后数据保持一致', async () => {
      await db.read();

      assert.equal(db.data.batches.length, beforeState.batches.length);
      assert.equal(db.data.points.length, beforeState.points.length);
      assert.equal(db.data.defects.length, beforeState.defects.length);
      assert.equal(db.data.events.length, beforeState.events.length);
      assert.equal(db.data.config.version, beforeState.config.version);
      assert.equal(db.data.config.distanceThreshold, beforeState.config.distanceThreshold);

      db.data.events.forEach((e: any, i: number) => {
        assert.equal(e.ruleVersion, beforeState.events[i].ruleVersion);
        assert.equal(e.status, beforeState.events[i].status);
      });
    });

    it('配置修改重启后不跳回旧版本', () => {
      assert.equal(db.data.config.version, '2.0.0');
      assert.equal(db.data.config.distanceThreshold, 10.0);
      db.data.events.forEach((e: any) => {
        assert.equal(e.ruleVersion, '2.0.0');
      });
    });
  });

  describe('7. 改配置后再导出', () => {
    it('配置修改后导出使用新规则', async () => {
      await resetDb();
      const pf = copySample('roof_points_202606.csv');
      const df = copySample('defects_202606.json');
      await importPoints(pf, 'roof_points_202606.csv');
      await importDefects(df, 'defects_202606.json');

      const csvBefore = exportEventsCSV();
      const jsonBefore = JSON.parse(exportEventsJSON());

      db.data.config.distanceThreshold = 50.0;
      db.data.config.version = '1.1.0';
      db.data.config.levelMapping = [
        { severity: 'critical', level: '严重', color: '#ef4444' },
        { severity: 'major', level: '较重', color: '#f59e0b' },
        { severity: 'medium', level: '一般', color: '#10b981' },
        { severity: 'minor', level: '轻微', color: '#6366f1' },
      ];
      await saveDb();
      await recalculateAllEvents();

      const csvAfter = exportEventsCSV();
      const jsonAfter = JSON.parse(exportEventsJSON());

      assert.notEqual(csvBefore.split('\n').length, csvAfter.split('\n').length);
      assert.notEqual(jsonBefore.eventCount, jsonAfter.eventCount);
      assert.equal(jsonAfter.currentRuleVersion, '1.1.0');

      const firstEvent = jsonAfter.events[0];
      assert.equal(firstEvent.ruleVersion, '1.1.0');
      assert.ok(['严重', '较重', '一般', '轻微'].includes(firstEvent.level));
    });
  });
});
