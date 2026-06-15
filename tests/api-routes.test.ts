import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

const DB_PATH = path.join(projectRoot, 'data', 'db.json');
const BACKUP_PATH = path.join(projectRoot, 'data', 'db_routes_test_backup.json');
const SAMPLE_DIR = path.join(projectRoot, 'data', 'samples');
const TEMP_DIR = path.join(projectRoot, 'data', 'test_temp_routes');

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

function httpRequest(
  hostname: string,
  port: number,
  path: string,
  method: string,
  body?: string,
  contentType?: string
): Promise<{ status: number; body: string; headers: Record<string, string | string[]> }> {
  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      hostname,
      port,
      path,
      method,
      headers: {},
    };

    if (body && contentType) {
      options.headers = {
        'Content-Type': contentType,
        'Content-Length': Buffer.byteLength(body),
      };
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode || 0,
          body: data,
          headers: res.headers as Record<string, string | string[]>,
        });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

function httpUpload(
  hostname: string,
  port: number,
  pathStr: string,
  fieldName: string,
  filePath: string
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const boundary = `----TestBoundary${Date.now()}`;
    const fileContent = fs.readFileSync(filePath);
    const fileName = filePath.split('\\').pop()?.split('/').pop() || 'file';

    const preamble = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\n` +
      `Content-Type: application/octet-stream\r\n` +
      `\r\n`
    );

    const epilogue = Buffer.from(`\r\n--${boundary}--\r\n`);

    const totalLength = preamble.length + fileContent.length + epilogue.length;

    const options: http.RequestOptions = {
      hostname,
      port,
      path: pathStr,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': totalLength,
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode || 0, body: data });
      });
    });

    req.on('error', reject);
    req.write(preamble);
    req.write(fileContent);
    req.write(epilogue);
    req.end();
  });
}

const HOST = '127.0.0.1';
const PORT = 39876;

describe('API 路由一致性测试（文档 vs 实际路由）', () => {
  let server: http.Server;

  before(async () => {
    if (fs.existsSync(DB_PATH)) {
      fs.copyFileSync(DB_PATH, BACKUP_PATH);
    }

    const appModule = await import('../api/app.js');
    const app = appModule.default;

    server = http.createServer(app);

    await new Promise<void>((resolve) => {
      server.listen(PORT, HOST, () => resolve());
    });

    const dbModule = await import('../api/models/db.js');
    const db = dbModule.db;
    const saveDb = dbModule.saveDb;
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
  });

  after(() => {
    server.close();

    if (fs.existsSync(BACKUP_PATH)) {
      fs.copyFileSync(BACKUP_PATH, DB_PATH);
      fs.unlinkSync(BACKUP_PATH);
    }
    cleanupTemp();
  });

  describe('1. 导出接口 - 正确路径（与 README 一致）', () => {
    before(async () => {
      const pointsFile = copySample('roof_points_202606.csv');
      await httpUpload(HOST, PORT, '/api/import/points', 'file', pointsFile);

      const defectsFile = copySample('defects_202606.json');
      await httpUpload(HOST, PORT, '/api/import/defects', 'file', defectsFile);
    });

    it('GET /api/export/events/csv 应返回 200 且是 CSV 格式（带 BOM）', async () => {
      const res = await httpRequest(HOST, PORT, '/api/export/events/csv', 'GET');
      assert.equal(res.status, 200);
      const contentType = res.headers['content-type'] as string;
      assert.ok(contentType.includes('text/csv'), `Content-Type 应包含 text/csv，实际：${contentType}`);
      assert.ok(res.body.startsWith('\uFEFF'), 'CSV 应以 BOM 开头，便于 Excel 识别');
      assert.ok(res.body.includes('id,status,level'), 'CSV 表头应包含基础字段');
      assert.ok(res.body.includes('primaryDefectPointCode'), 'CSV 应包含追溯字段：primaryDefectPointCode');
      assert.ok(res.body.includes('ruleVersion'), 'CSV 应包含追溯字段：ruleVersion');
      assert.ok(res.body.includes('sourceEvidenceCount'), 'CSV 应包含追溯字段：sourceEvidenceCount');
      assert.ok(res.body.includes('operationLogCount'), 'CSV 应包含追溯字段：operationLogCount');
      assert.ok(res.body.includes('lastStatusChangeAt'), 'CSV 应包含追溯字段：lastStatusChangeAt');
    });

    it('GET /api/export/events/json 应返回 200 且结构完整（与 README 一致）', async () => {
      const res = await httpRequest(HOST, PORT, '/api/export/events/json', 'GET');
      assert.equal(res.status, 200);
      const contentType = res.headers['content-type'] as string;
      assert.ok(contentType.includes('application/json'), `Content-Type 应是 application/json，实际：${contentType}`);

      const data = JSON.parse(res.body);
      assert.ok('exportedAt' in data, 'JSON 顶层应有 exportedAt');
      assert.ok('eventCount' in data, 'JSON 顶层应有 eventCount');
      assert.ok('currentRuleVersion' in data, 'JSON 顶层应有 currentRuleVersion');
      assert.ok(Array.isArray(data.events), 'JSON 顶层应有 events 数组');
      assert.equal(data.events.length, data.eventCount, 'eventCount 应与 events 数组长度一致');

      if (data.events.length > 0) {
        const ev = data.events[0];
        assert.ok('defects' in ev, '每个事件应有 defects 字段');
        assert.ok('rectifications' in ev, '每个事件应有 rectifications 字段');
        assert.ok('operationLogs' in ev, '每个事件应有 operationLogs 字段');
        assert.ok('ruleVersion' in ev, '每个事件应有 ruleVersion 字段');
      }
    });

    it('GET /api/export/full/json 应返回 200 且包含完整库数据', async () => {
      const res = await httpRequest(HOST, PORT, '/api/export/full/json', 'GET');
      assert.equal(res.status, 200);

      const data = JSON.parse(res.body);
      assert.ok('exportedAt' in data, '完整导出应有 exportedAt');
      assert.ok(Array.isArray(data.batches), '完整导出应有 batches');
      assert.ok(Array.isArray(data.points), '完整导出应有 points');
      assert.ok(Array.isArray(data.defects), '完整导出应有 defects');
      assert.ok(Array.isArray(data.events), '完整导出应有 events');
      assert.ok(Array.isArray(data.operationLogs), '完整导出应有 operationLogs');
      assert.ok(data.config, '完整导出应有 config');
    });

    it('CSV 与 JSON 导出一一对应（按创建时间升序，相同数量相同 ID 顺序）', async () => {
      const csvRes = await httpRequest(HOST, PORT, '/api/export/events/csv', 'GET');
      const jsonRes = await httpRequest(HOST, PORT, '/api/export/events/json', 'GET');

      const csvLines = csvRes.body.replace(/^\uFEFF/, '').split('\n').filter(Boolean);
      const csvHeader = csvLines[0].split(',');
      const idIndex = csvHeader.indexOf('id');
      assert.ok(idIndex !== -1, 'CSV 应有 id 列');

      const csvIds = csvLines.slice(1).map(line => {
        const cols = line.split(',');
        return cols[idIndex];
      });

      const jsonData = JSON.parse(jsonRes.body);
      const jsonIds = jsonData.events.map((e: any) => e.id);

      assert.equal(csvIds.length, jsonIds.length, 'CSV 与 JSON 的事件数量应一致');
      for (let i = 0; i < csvIds.length; i++) {
        assert.equal(csvIds[i], jsonIds[i], `第 ${i} 条事件 ID 应一致`);
      }
    });
  });

  describe('2. 导出接口 - 错误路径（旧版错误写法应 404）', () => {
    it('GET /api/export/events.csv 返回 404（README 旧错写路径）', async () => {
      const res = await httpRequest(HOST, PORT, '/api/export/events.csv', 'GET');
      assert.equal(res.status, 404, 'events.csv 是错误路径，应返回 404');
      const data = JSON.parse(res.body);
      assert.equal(data.success, false);
      assert.ok(data.error || data.message, '404 响应应有错误描述');
    });

    it('GET /api/export/events.json 返回 404（README 旧错写路径）', async () => {
      const res = await httpRequest(HOST, PORT, '/api/export/events.json', 'GET');
      assert.equal(res.status, 404, 'events.json 是错误路径，应返回 404');
    });

    it('GET /api/export/full.json 返回 404（README 旧错写路径）', async () => {
      const res = await httpRequest(HOST, PORT, '/api/export/full.json', 'GET');
      assert.equal(res.status, 404, 'full.json 是错误路径，应返回 404');
    });
  });

  describe('3. 备注接口 - 正确方法与路径（与 README 一致）', () => {
    let eventId: string;

    before(async () => {
      const res = await httpRequest(HOST, PORT, '/api/events', 'GET');
      const events = JSON.parse(res.body);
      assert.ok(events.length > 0, '应有事件数据');
      eventId = events[0].id;
    });

    it('PATCH /api/events/:id/remark 成功添加备注（与 README 一致）', async () => {
      const body = JSON.stringify({
        remark: 'API路由测试复核备注',
        reviewer: '测试员A',
      });

      const res = await httpRequest(
        HOST, PORT, `/api/events/${eventId}/remark`,
        'PATCH', body, 'application/json'
      );

      assert.equal(res.status, 200);
      const data = JSON.parse(res.body);
      assert.equal(data.success, true, '添加备注应返回 success: true');
      assert.ok(data.event, '返回的 event 应存在');
      assert.equal(data.event.reviewRemark, 'API路由测试复核备注', '备注内容应一致');
      assert.equal(data.event.reviewer, '测试员A', '复核人应一致');
    });

    it('GET /api/events/:id 能查到刚添加的备注', async () => {
      const res = await httpRequest(HOST, PORT, `/api/events/${eventId}`, 'GET');
      assert.equal(res.status, 200);
      const data = JSON.parse(res.body);
      assert.equal(data.event.reviewRemark, 'API路由测试复核备注');
    });
  });

  describe('4. 备注接口 - 错误方法（POST 旧版错误写法应 404）', () => {
    let eventId: string;

    before(async () => {
      const res = await httpRequest(HOST, PORT, '/api/events', 'GET');
      const events = JSON.parse(res.body);
      eventId = events[0].id;
    });

    it('POST /api/events/:id/remark 返回 404（README 旧错写方法）', async () => {
      const body = JSON.stringify({
        remark: '错误方法测试',
        reviewer: '测试员B',
      });

      const res = await httpRequest(
        HOST, PORT, `/api/events/${eventId}/remark`,
        'POST', body, 'application/json'
      );

      assert.equal(res.status, 404, 'POST 方法访问 remark 接口应返回 404（正确方法是 PATCH）');
    });
  });

  describe('4.5 状态接口 - 正确状态值与筛选', () => {
    let eventId: string;

    before(async () => {
      const res = await httpRequest(HOST, PORT, '/api/events', 'GET');
      const events = JSON.parse(res.body);
      eventId = events[0].id;
    });

    it('初始状态为 pending（待确认）', async () => {
      const res = await httpRequest(HOST, PORT, `/api/events/${eventId}`, 'GET');
      const data = JSON.parse(res.body);
      assert.equal(data.event.status, 'pending', '新生成的事件初始状态应为 pending');
    });

    it('GET /api/events?status=pending 能筛选出待确认事件', async () => {
      const res = await httpRequest(HOST, PORT, '/api/events?status=pending', 'GET');
      assert.equal(res.status, 200);
      const events = JSON.parse(res.body);
      assert.ok(events.length > 0, 'pending 状态应有事件');
      for (const ev of events) {
        assert.equal(ev.status, 'pending');
      }
    });

    it('GET /api/events?status=need_rectify 筛选需整改（初始应为 0）', async () => {
      const res = await httpRequest(HOST, PORT, '/api/events?status=need_rectify', 'GET');
      assert.equal(res.status, 200);
      const events = JSON.parse(res.body);
      assert.equal(events.length, 0, '初始时 need_rectify 状态应有 0 个事件');
    });

    it('PATCH /api/events/:id/status pending → need_rectify 成功', async () => {
      const body = JSON.stringify({
        newStatus: 'need_rectify',
        operator: '测试员C',
        remark: '确认需要整改',
      });

      const res = await httpRequest(
        HOST, PORT, `/api/events/${eventId}/status`,
        'PATCH', body, 'application/json'
      );

      assert.equal(res.status, 200);
      const data = JSON.parse(res.body);
      assert.equal(data.success, true);
      assert.equal(data.event.status, 'need_rectify', '状态应更新为 need_rectify');
    });

    it('状态更新后产生操作日志', async () => {
      const res = await httpRequest(HOST, PORT, `/api/events/${eventId}`, 'GET');
      const data = JSON.parse(res.body);
      assert.ok(data.logs.length > 0, '状态更新后应有操作日志');
      const lastLog = data.logs[data.logs.length - 1];
      assert.equal(lastLog.oldStatus, 'pending');
      assert.equal(lastLog.newStatus, 'need_rectify');
      assert.equal(lastLog.operator, '测试员C');
    });

    it('need_rectify → reviewed 成功（二级流转）', async () => {
      const body = JSON.stringify({
        newStatus: 'reviewed',
        operator: '测试员D',
        remark: '复核通过',
      });

      const res = await httpRequest(
        HOST, PORT, `/api/events/${eventId}/status`,
        'PATCH', body, 'application/json'
      );

      assert.equal(res.status, 200);
      const data = JSON.parse(res.body);
      assert.equal(data.success, true);
      assert.equal(data.event.status, 'reviewed');
    });
  });

  describe('4.6 状态接口 - 错误状态值与非法流转', () => {
    let eventId: string;

    before(async () => {
      const res = await httpRequest(HOST, PORT, '/api/events?status=pending', 'GET');
      const events = JSON.parse(res.body);
      assert.ok(events.length > 0, '应有 pending 状态的事件用于测试');
      eventId = events[0].id;
    });

    it('错误状态值 confirmed 返回失败（README 旧错写值）', async () => {
      const body = JSON.stringify({
        newStatus: 'confirmed',
        operator: '测试员E',
        remark: '旧错写状态值',
      });

      const res = await httpRequest(
        HOST, PORT, `/api/events/${eventId}/status`,
        'PATCH', body, 'application/json'
      );

      assert.equal(res.status, 400, 'confirmed 是无效状态值，应返回 400');
      const data = JSON.parse(res.body);
      assert.equal(data.success, false);
      assert.ok(data.message || data.error, '应有错误描述');
    });

    it('非法状态流转 pending → closed 返回失败', async () => {
      const body = JSON.stringify({
        newStatus: 'closed',
        operator: '测试员F',
        remark: '跳过中间状态',
      });

      const res = await httpRequest(
        HOST, PORT, `/api/events/${eventId}/status`,
        'PATCH', body, 'application/json'
      );

      assert.equal(res.status, 400, 'pending 不能直接到 closed，应返回 400');
      const data = JSON.parse(res.body);
      assert.equal(data.success, false);
      assert.ok(data.message, '应有错误描述');
    });

    it('GET /api/events?status=confirmed 返回 200 但结果为空（无效枚举值不会报错，只返回空）', async () => {
      const res = await httpRequest(HOST, PORT, '/api/events?status=confirmed', 'GET');
      assert.equal(res.status, 200, '筛选接口不校验枚举合法性，无效值返回空数组');
      const events = JSON.parse(res.body);
      assert.equal(events.length, 0, 'confirmed 是无效状态，结果应为空');
    });

    it('状态更新后事件状态没有被脏改', async () => {
      const res = await httpRequest(HOST, PORT, `/api/events/${eventId}`, 'GET');
      const data = JSON.parse(res.body);
      assert.equal(data.event.status, 'pending', '失败的状态更新不应改变原状态');
    });
  });

  describe('5. README 验证步骤完整复现（从头跑通）', () => {
    before(async () => {
      const dbModule = await import('../api/models/db.js');
      const db = dbModule.db;
      const saveDb = dbModule.saveDb;
      await db.read();
      db.data.batches = [];
      db.data.points = [];
      db.data.defects = [];
      db.data.rectifications = [];
      db.data.events = [];
      db.data.operationLogs = [];
      db.data.config.version = '1.0.0';
      await saveDb();
    });

    it('README 完整流程：导入 → 查看事件 → 加备注 → 改配置 → 导出', async () => {
      const pointsFile = copySample('roof_points_202606.csv');
      const r1 = await httpUpload(HOST, PORT, '/api/import/points', 'file', pointsFile);
      assert.equal(r1.status, 200);
      const pointsResult = JSON.parse(r1.body);
      assert.equal(pointsResult.success, true, '点位导入应成功');
      assert.equal(pointsResult.batch.status, 'success');
      assert.equal(pointsResult.batch.validRecords, 12, '应导入 12 个点位');

      const defectsFile = copySample('defects_202606.json');
      const r2 = await httpUpload(HOST, PORT, '/api/import/defects', 'file', defectsFile);
      assert.equal(r2.status, 200);
      const defectsResult = JSON.parse(r2.body);
      assert.equal(defectsResult.success, true, '缺陷导入应成功');
      assert.ok(defectsResult.newEvents > 0, '应生成新事件');
      const initialEventCount = defectsResult.newEvents;

      const r3 = await httpRequest(HOST, PORT, '/api/events', 'GET');
      assert.equal(r3.status, 200);
      const events = JSON.parse(r3.body);
      assert.equal(events.length, initialEventCount, '事件数量应匹配');
      const firstEventId = events[0].id;

      const r4 = await httpRequest(
        HOST, PORT, `/api/events/${firstEventId}/remark`,
        'PATCH',
        JSON.stringify({ remark: 'README 复现测试', reviewer: '验证员' }),
        'application/json'
      );
      assert.equal(r4.status, 200);
      const remarkResult = JSON.parse(r4.body);
      assert.equal(remarkResult.success, true);

      const r5 = await httpRequest(
        HOST, PORT, '/api/config',
        'PUT',
        JSON.stringify({
          distanceThreshold: 50.0,
          levelMapping: [
            { severity: 'critical', level: '一级', color: '#ef4444' },
            { severity: 'major', level: '二级', color: '#f59e0b' },
            { severity: 'medium', level: '三级', color: '#10b981' },
            { severity: 'minor', level: '四级', color: '#6366f1' },
          ],
        }),
        'application/json'
      );
      assert.equal(r5.status, 200);
      const configResult = JSON.parse(r5.body);
      assert.equal(configResult.success, true);
      assert.ok(configResult.recalculated, '配置更新应触发重算');
      assert.ok(configResult.recalculated.previousEventCount > configResult.recalculated.newEventCount,
        '阈值增大后事件数应减少');
      assert.notEqual(configResult.config.version, '1.0.0', '规则版本应自增');

      const csvRes = await httpRequest(HOST, PORT, '/api/export/events/csv', 'GET');
      assert.equal(csvRes.status, 200);
      assert.ok(csvRes.body.includes(configResult.config.version),
        '导出 CSV 应包含最新规则版本');

      const jsonRes = await httpRequest(HOST, PORT, '/api/export/events/json', 'GET');
      assert.equal(jsonRes.status, 200);
      const jsonData = JSON.parse(jsonRes.body);
      assert.equal(jsonData.currentRuleVersion, configResult.config.version,
        '导出 JSON 的 currentRuleVersion 应与配置版本一致');

      const fullRes = await httpRequest(HOST, PORT, '/api/export/full/json', 'GET');
      assert.equal(fullRes.status, 200);
    });
  });

  describe('6. 错误路径与方法综合验证', () => {
    it('完全不存在的路径返回 404', async () => {
      const res = await httpRequest(HOST, PORT, '/api/nonexistent/foobar', 'GET');
      assert.equal(res.status, 404);
    });

    it('PATCH 导入接口返回 404（方法错误）', async () => {
      const res = await httpRequest(HOST, PORT, '/api/import/points', 'PATCH');
      assert.equal(res.status, 404);
    });

    it('GET 导入接口返回 404（方法错误）', async () => {
      const res = await httpRequest(HOST, PORT, '/api/import/points', 'GET');
      assert.equal(res.status, 404);
    });

    it('不存在的事件详情返回 404', async () => {
      const res = await httpRequest(HOST, PORT, '/api/events/non-existent-id', 'GET');
      assert.equal(res.status, 404);
    });
  });
});
