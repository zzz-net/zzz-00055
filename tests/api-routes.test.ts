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
const PORT = 39877;

describe('API 路由一致性测试（文档 vs 实际路由）', () => {
  let server: http.Server;

  before(async () => {
    if (fs.existsSync(DB_PATH)) {
      fs.copyFileSync(DB_PATH, BACKUP_PATH);
    }

    const appModule = await import('../api/app.js');
    const app = appModule.default;

    server = http.createServer(app);

    await new Promise<void>((resolve, reject) => {
      server.on('error', reject);
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
    db.data.configHistory = [];
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

  after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });

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

  describe('4.7 README 文档状态枚举一致性验证', () => {
    let pendingEventId1: string;
    let pendingEventId2: string;
    let pendingEventId3: string;

    async function getPendingEventId(): Promise<string> {
      const res = await httpRequest(HOST, PORT, '/api/events?status=pending', 'GET');
      const events = JSON.parse(res.body);
      assert.ok(events.length > 0, '应有 pending 状态的事件');
      return events[0].id;
    }

    async function getNeedRectifyEventId(): Promise<string> {
      const res = await httpRequest(HOST, PORT, '/api/events?status=need_rectify', 'GET');
      const events = JSON.parse(res.body);
      if (events.length > 0) return events[0].id;

      const evId = await getPendingEventId();
      await httpRequest(
        HOST, PORT, `/api/events/${evId}/status`,
        'PATCH',
        JSON.stringify({ newStatus: 'need_rectify', operator: 'TestPrep' }),
        'application/json'
      );
      return evId;
    }

    async function getReviewedEventId(): Promise<string> {
      const res = await httpRequest(HOST, PORT, '/api/events?status=reviewed', 'GET');
      const events = JSON.parse(res.body);
      if (events.length > 0) return events[0].id;

      const evId = await getNeedRectifyEventId();
      await httpRequest(
        HOST, PORT, `/api/events/${evId}/status`,
        'PATCH',
        JSON.stringify({ newStatus: 'reviewed', operator: 'TestPrep' }),
        'application/json'
      );
      return evId;
    }

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
      await saveDb();

      const pointsFile = copySample('roof_points_202606.csv');
      await httpUpload(HOST, PORT, '/api/import/points', 'file', pointsFile);

      const defectsFile = copySample('defects_202606.json');
      await httpUpload(HOST, PORT, '/api/import/defects', 'file', defectsFile);

      const res = await httpRequest(HOST, PORT, '/api/events', 'GET');
      const events = JSON.parse(res.body);
      assert.ok(events.length >= 5, '测试需要至少 5 个事件');
      pendingEventId1 = events[0].id;
      pendingEventId2 = events[1].id;
      pendingEventId3 = events[2].id;
    });

    it('README 列出的 5 个状态枚举都能作为筛选参数', async () => {
      const statuses = ['pending', 'need_rectify', 'reviewed', 'closed', 'cancelled'];
      for (const s of statuses) {
        const res = await httpRequest(HOST, PORT, `/api/events?status=${s}`, 'GET');
        assert.equal(res.status, 200, `状态 ${s} 作为筛选参数不应报错`);
        const events = JSON.parse(res.body);
        for (const ev of events) {
          assert.equal(ev.status, s, `筛选 ${s} 的结果状态应为 ${s}`);
        }
      }
    });

    it('按文档示例 pending → need_rectify 流转成功（与 README Body 示例一致）', async () => {
      const body = JSON.stringify({
        newStatus: 'need_rectify',
        operator: '张三',
        remark: '现场确认需要整改',
      });

      const res = await httpRequest(
        HOST, PORT, `/api/events/${pendingEventId1}/status`,
        'PATCH', body, 'application/json'
      );

      assert.equal(res.status, 200, '按 README 示例调用 pending→need_rectify 应成功');
      const data = JSON.parse(res.body);
      assert.equal(data.success, true);
      assert.equal(data.event.status, 'need_rectify', '返回的 status 应与文档示例一致');
    });

    it('need_rectify → reviewed 流转成功（二级流转）', async () => {
      const evId = await getNeedRectifyEventId();

      const res = await httpRequest(
        HOST, PORT, `/api/events/${evId}/status`,
        'PATCH',
        JSON.stringify({ newStatus: 'reviewed', operator: '李四' }),
        'application/json'
      );

      assert.equal(res.status, 200);
      const data = JSON.parse(res.body);
      assert.equal(data.event.status, 'reviewed');
    });

    it('reviewed → closed 流转成功（最终关闭）', async () => {
      const evId = await getReviewedEventId();

      const res = await httpRequest(
        HOST, PORT, `/api/events/${evId}/status`,
        'PATCH',
        JSON.stringify({ newStatus: 'closed', operator: '王五', remark: '验证通过关闭' }),
        'application/json'
      );

      assert.equal(res.status, 200);
      const data = JSON.parse(res.body);
      assert.equal(data.event.status, 'closed');
    });

    it('文档里不存在的 confirmed 状态返回 400（复现历史问题）', async () => {
      const body = JSON.stringify({
        newStatus: 'confirmed',
        operator: '测试员',
        remark: '旧文档错误值',
      });

      const res = await httpRequest(
        HOST, PORT, `/api/events/${pendingEventId2}/status`,
        'PATCH', body, 'application/json'
      );

      assert.equal(res.status, 400, 'confirmed 是无效状态值，应返回 400');
      const data = JSON.parse(res.body);
      assert.equal(data.success, false);
    });

    it('非法流转 pending → closed 返回 400（与文档失败返回示例一致）', async () => {
      const res = await httpRequest(
        HOST, PORT, `/api/events/${pendingEventId3}/status`,
        'PATCH',
        JSON.stringify({ newStatus: 'closed', operator: '测试员' }),
        'application/json'
      );

      assert.equal(res.status, 400, 'pending 不能直接到 closed');
      const data = JSON.parse(res.body);
      assert.equal(data.success, false);
      assert.ok(data.message.includes('无法从') || data.message.includes('不允许'),
        '错误信息应与文档示例一致');
    });

    it('README 同页验证步骤：按文档完整走一遍状态流转', async () => {
      const freshId = await getPendingEventId();

      const r2 = await httpRequest(
        HOST, PORT, `/api/events/${freshId}/status`,
        'PATCH',
        JSON.stringify({
          newStatus: 'need_rectify',
          operator: '张三',
          remark: '现场确认需要整改',
        }),
        'application/json'
      );
      assert.equal(r2.status, 200);
      assert.equal(JSON.parse(r2.body).event.status, 'need_rectify');

      const r3 = await httpRequest(
        HOST, PORT, `/api/events/${freshId}/status`,
        'PATCH',
        JSON.stringify({
          newStatus: 'reviewed',
          operator: '李四',
          remark: '复核通过',
        }),
        'application/json'
      );
      assert.equal(r3.status, 200);
      assert.equal(JSON.parse(r3.body).event.status, 'reviewed');

      const r4 = await httpRequest(
        HOST, PORT, `/api/events/${freshId}/status`,
        'PATCH',
        JSON.stringify({
          newStatus: 'closed',
          operator: '王五',
          remark: '验证通过关闭',
        }),
        'application/json'
      );
      assert.equal(r4.status, 200);
      assert.equal(JSON.parse(r4.body).event.status, 'closed');

      const r5 = await httpRequest(HOST, PORT, `/api/events/${freshId}`, 'GET');
      const detail = JSON.parse(r5.body);
      assert.equal(detail.event.status, 'closed');
      assert.ok(detail.logs.length >= 3, '至少有 3 条状态流转日志');
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

  describe('5.5 配置历史记录功能', () => {
    before(async () => {
      const dbModule = await import('../api/models/db.js');
      const db = dbModule.db;
      const saveDb = dbModule.saveDb;
      await db.read();
      db.data.configHistory = [];
      db.data.config.version = '1.0.0';
      db.data.config.distanceThreshold = 5.0;
      await saveDb();
    });

    it('GET /api/config/history 初始返回空数组', async () => {
      const res = await httpRequest(HOST, PORT, '/api/config/history', 'GET');
      assert.equal(res.status, 200);
      const history = JSON.parse(res.body);
      assert.ok(Array.isArray(history));
      assert.equal(history.length, 0);
    });

    it('PUT /api/config 成功后生成历史记录', async () => {
      const body = JSON.stringify({
        distanceThreshold: 10.0,
        levelMapping: [
          { severity: 'critical', level: '一级', color: '#ef4444' },
          { severity: 'major', level: '二级', color: '#f59e0b' },
          { severity: 'medium', level: '三级', color: '#10b981' },
          { severity: 'minor', level: '四级', color: '#6366f1' },
        ],
        updatedBy: '测试员',
      });

      const res = await httpRequest(HOST, PORT, '/api/config', 'PUT', body, 'application/json');
      assert.equal(res.status, 200);
      const result = JSON.parse(res.body);
      assert.equal(result.success, true);
      assert.ok(!result.skipped, '配置变化不应跳过');

      const historyRes = await httpRequest(HOST, PORT, '/api/config/history', 'GET');
      const history = JSON.parse(historyRes.body);
      assert.equal(history.length, 1);

      const record = history[0];
      assert.equal(record.action, 'save');
      assert.equal(record.operator, '测试员');
      assert.equal(record.distanceThreshold.before, 5.0);
      assert.equal(record.distanceThreshold.after, 10.0);
      assert.ok(record.levelMapping.before.length === 4);
      assert.ok(record.levelMapping.after.length === 4);
    });

    it('重复提交相同配置应跳过，生成 skip_duplicate 历史', async () => {
      const body = JSON.stringify({
        distanceThreshold: 10.0,
        levelMapping: [
          { severity: 'critical', level: '一级', color: '#ef4444' },
          { severity: 'major', level: '二级', color: '#f59e0b' },
          { severity: 'medium', level: '三级', color: '#10b981' },
          { severity: 'minor', level: '四级', color: '#6366f1' },
        ],
        updatedBy: '测试员',
      });

      const res = await httpRequest(HOST, PORT, '/api/config', 'PUT', body, 'application/json');
      assert.equal(res.status, 200);
      const result = JSON.parse(res.body);
      assert.equal(result.success, true);
      assert.equal(result.skipped, true);
      assert.ok(result.message?.includes('未发生变化'));

      const historyRes = await httpRequest(HOST, PORT, '/api/config/history', 'GET');
      const history = JSON.parse(historyRes.body);
      assert.equal(history.length, 2, '应生成 skip_duplicate 历史记录');
      assert.equal(history[0].action, 'skip_duplicate');
      assert.equal(history[0].result, 'skipped');
    });

    it('POST /api/config/reset 成功后生成历史记录', async () => {
      const body = JSON.stringify({ updatedBy: '测试员B' });
      const res = await httpRequest(HOST, PORT, '/api/config/reset', 'POST', body, 'application/json');
      assert.equal(res.status, 200);
      const result = JSON.parse(res.body);
      assert.equal(result.success, true);
      assert.ok(!result.skipped);

      const historyRes = await httpRequest(HOST, PORT, '/api/config/history', 'GET');
      const history = JSON.parse(historyRes.body);
      assert.equal(history.length, 3);

      const latest = history[0];
      assert.equal(latest.action, 'reset');
      assert.equal(latest.operator, '测试员B');
      assert.equal(latest.distanceThreshold.after, 5.0);
    });

    it('重置时未传 updatedBy 则默认 operator 为 admin', async () => {
      const saveBody = JSON.stringify({
        distanceThreshold: 20.0,
        levelMapping: [
          { severity: 'critical', level: '一级', color: '#ef4444' },
          { severity: 'major', level: '二级', color: '#f59e0b' },
          { severity: 'medium', level: '三级', color: '#10b981' },
          { severity: 'minor', level: '四级', color: '#6366f1' },
        ],
        updatedBy: '临时操作员',
      });
      await httpRequest(HOST, PORT, '/api/config', 'PUT', saveBody, 'application/json');

      const res = await httpRequest(HOST, PORT, '/api/config/reset', 'POST', '{}', 'application/json');
      assert.equal(res.status, 200);
      const result = JSON.parse(res.body);
      assert.equal(result.success, true);
      assert.equal(result.config.updatedBy, 'admin');

      const historyRes = await httpRequest(HOST, PORT, '/api/config/history', 'GET');
      const history = JSON.parse(historyRes.body);
      const latest = history[0];
      assert.equal(latest.operator, 'admin');
    });

    it('重置后再次重置应跳过，生成 skip_duplicate 历史', async () => {
      const historyBefore = await httpRequest(HOST, PORT, '/api/config/history', 'GET');
      const countBefore = JSON.parse(historyBefore.body).length;

      const res = await httpRequest(HOST, PORT, '/api/config/reset', 'POST', '{}', 'application/json');
      const result = JSON.parse(res.body);
      assert.equal(result.success, true);
      assert.equal(result.skipped, true);

      const historyRes = await httpRequest(HOST, PORT, '/api/config/history', 'GET');
      const history = JSON.parse(historyRes.body);
      assert.equal(history.length, countBefore + 1, '应生成 skip_duplicate 历史记录');
      assert.equal(history[0].action, 'skip_duplicate');
      assert.equal(history[0].result, 'skipped');
    });

    it('历史记录最多保留 10 条', async () => {
      for (let i = 0; i < 15; i++) {
        const body = JSON.stringify({
          distanceThreshold: 5.0 + i,
          levelMapping: [
            { severity: 'critical', level: '一级', color: '#ef4444' },
            { severity: 'major', level: '二级', color: '#f59e0b' },
            { severity: 'medium', level: '三级', color: '#10b981' },
            { severity: 'minor', level: '四级', color: '#6366f1' },
          ],
          updatedBy: `测试员${i}`,
        });
        await httpRequest(HOST, PORT, '/api/config', 'PUT', body, 'application/json');
      }

      const historyRes = await httpRequest(HOST, PORT, '/api/config/history', 'GET');
      const history = JSON.parse(historyRes.body);
      assert.equal(history.length, 10, '最多保留 10 条历史记录');
    });

    it('GET /api/config/history?limit=5 限制返回数量', async () => {
      const res = await httpRequest(HOST, PORT, '/api/config/history?limit=5', 'GET');
      const history = JSON.parse(res.body);
      assert.equal(history.length, 5);
    });

    it('历史记录持久化：重启后仍可查询', async () => {
      const dbModule = await import('../api/models/db.js');
      const db = dbModule.db;
      
      const beforeRestart = JSON.parse(JSON.stringify(db.data.configHistory));
      
      await db.read();
      
      assert.equal(db.data.configHistory.length, beforeRestart.length);
      assert.deepEqual(db.data.configHistory[0], beforeRestart[0]);
    });
  });

  describe('5.6 导出摘要功能', () => {
    before(async () => {
      const dbModule = await import('../api/models/db.js');
      const db = dbModule.db;
      const saveDb = dbModule.saveDb;
      await db.read();
      db.data.configHistory = [];
      db.data.config.version = '1.0.0';
      db.data.config.distanceThreshold = 5.0;
      await saveDb();
    });

    it('GET /api/export/summary 返回正确摘要', async () => {
      const res = await httpRequest(HOST, PORT, '/api/export/summary', 'GET');
      assert.equal(res.status, 200);
      const summary = JSON.parse(res.body);
      
      assert.ok(summary.exportedAt);
      assert.equal(summary.ruleVersion, '1.0.0');
      assert.equal(summary.batchFilter.applied, false);
      assert.equal(typeof summary.eventCount, 'number');
      assert.ok(summary.eventCount > 0);
      assert.ok(summary.statusCounts);
      assert.ok(summary.levelCounts);
    });

    it('GET /api/export/summary?batchId=xxx 返回筛选后摘要', async () => {
      const batchesRes = await httpRequest(HOST, PORT, '/api/batches', 'GET');
      const batches = JSON.parse(batchesRes.body);
      assert.ok(batches.length > 0);
      
      const batchId = batches[0].id;
      const res = await httpRequest(HOST, PORT, `/api/export/summary?batchId=${batchId}`, 'GET');
      const summary = JSON.parse(res.body);
      
      assert.equal(summary.batchFilter.applied, true);
      assert.equal(summary.batchFilter.batchId, batchId);
      assert.ok(summary.batchFilter.batchName);
    });

    it('JSON 导出包含摘要信息', async () => {
      const res = await httpRequest(HOST, PORT, '/api/export/events/json', 'GET');
      const data = JSON.parse(res.body);
      
      assert.ok(data.summary);
      assert.equal(data.summary.ruleVersion, '1.0.0');
      assert.equal(data.summary.eventCount, data.eventCount);
    });

    it('完整备份包含配置历史', async () => {
      const res = await httpRequest(HOST, PORT, '/api/export/full/json', 'GET');
      const data = JSON.parse(res.body);
      
      assert.ok(data.summary);
      assert.ok(Array.isArray(data.configHistory));
      assert.ok('config' in data);
    });
  });

  describe('5.7 并发冲突控制', () => {
    before(async () => {
      const dbModule = await import('../api/models/db.js');
      const db = dbModule.db;
      const saveDb = dbModule.saveDb;
      await db.read();
      db.data.configHistory = [];
      db.data.config.version = '1.0.0';
      db.data.config.distanceThreshold = 5.0;
      db.data.config.levelMapping = [
        { severity: 'critical', level: '一级', color: '#ef4444' },
        { severity: 'major', level: '二级', color: '#f59e0b' },
        { severity: 'medium', level: '三级', color: '#10b981' },
        { severity: 'minor', level: '四级', color: '#6366f1' },
      ];
      await saveDb();
    });

    it('不带 expectedVersion 正常保存成功', async () => {
      const body = JSON.stringify({
        distanceThreshold: 8.0,
        levelMapping: [
          { severity: 'critical', level: '一级', color: '#ef4444' },
          { severity: 'major', level: '二级', color: '#f59e0b' },
          { severity: 'medium', level: '三级', color: '#10b981' },
          { severity: 'minor', level: '四级', color: '#6366f1' },
        ],
        updatedBy: '用户A',
      });
      const res = await httpRequest(HOST, PORT, '/api/config', 'PUT', body, 'application/json');
      assert.equal(res.status, 200);
      const result = JSON.parse(res.body);
      assert.equal(result.success, true);
    });

    it('带匹配的 expectedVersion 保存成功', async () => {
      const configRes = await httpRequest(HOST, PORT, '/api/config', 'GET');
      const currentConfig = JSON.parse(configRes.body);

      const body = JSON.stringify({
        distanceThreshold: 12.0,
        levelMapping: [
          { severity: 'critical', level: '一级', color: '#ef4444' },
          { severity: 'major', level: '二级', color: '#f59e0b' },
          { severity: 'medium', level: '三级', color: '#10b981' },
          { severity: 'minor', level: '四级', color: '#6366f1' },
        ],
        updatedBy: '用户B',
        expectedVersion: currentConfig.version,
      });
      const res = await httpRequest(HOST, PORT, '/api/config', 'PUT', body, 'application/json');
      assert.equal(res.status, 200);
      const result = JSON.parse(res.body);
      assert.equal(result.success, true);
    });

    it('expectedVersion 不匹配时返回 409 冲突', async () => {
      const body = JSON.stringify({
        distanceThreshold: 15.0,
        levelMapping: [
          { severity: 'critical', level: '一级', color: '#ef4444' },
          { severity: 'major', level: '二级', color: '#f59e0b' },
          { severity: 'medium', level: '三级', color: '#10b981' },
          { severity: 'minor', level: '四级', color: '#6366f1' },
        ],
        updatedBy: '用户C',
        expectedVersion: '1.0.0',
      });
      const res = await httpRequest(HOST, PORT, '/api/config', 'PUT', body, 'application/json');
      assert.equal(res.status, 409);
      const result = JSON.parse(res.body);
      assert.equal(result.success, false);
      assert.equal(result.conflict, true);
      assert.ok(result.currentVersion);
      assert.ok(result.currentConfig);
      assert.ok(result.message.includes('已被他人修改'));
    });

    it('冲突后强制覆盖保存成功，历史记录为 force_save', async () => {
      const configRes = await httpRequest(HOST, PORT, '/api/config', 'GET');
      const currentConfig = JSON.parse(configRes.body);

      const body = JSON.stringify({
        distanceThreshold: 15.0,
        levelMapping: [
          { severity: 'critical', level: '一级', color: '#ef4444' },
          { severity: 'major', level: '二级', color: '#f59e0b' },
          { severity: 'medium', level: '三级', color: '#10b981' },
          { severity: 'minor', level: '四级', color: '#6366f1' },
        ],
        updatedBy: '用户C',
        expectedVersion: '1.0.0',
        force: true,
      });
      const res = await httpRequest(HOST, PORT, '/api/config', 'PUT', body, 'application/json');
      assert.equal(res.status, 200);
      const result = JSON.parse(res.body);
      assert.equal(result.success, true);
      assert.ok(result.message.includes('强制'));

      const historyRes = await httpRequest(HOST, PORT, '/api/config/history', 'GET');
      const history = JSON.parse(historyRes.body);
      const latest = history[0];
      assert.equal(latest.action, 'force_save');
      assert.equal(latest.operator, '用户C');
      assert.ok(latest.conflictNote);
      assert.ok(latest.conflictNote.includes('覆盖冲突'));
    });

    it('重置时 expectedVersion 不匹配返回 409', async () => {
      const body = JSON.stringify({
        updatedBy: '用户D',
        expectedVersion: '1.0.0',
      });
      const res = await httpRequest(HOST, PORT, '/api/config/reset', 'POST', body, 'application/json');
      assert.equal(res.status, 409);
      const result = JSON.parse(res.body);
      assert.equal(result.conflict, true);
    });

    it('重置时 force=true 可强制覆盖', async () => {
      const body = JSON.stringify({
        updatedBy: '用户D',
        expectedVersion: '1.0.0',
        force: true,
      });
      const res = await httpRequest(HOST, PORT, '/api/config/reset', 'POST', body, 'application/json');
      assert.equal(res.status, 200);
      const result = JSON.parse(res.body);
      assert.equal(result.success, true);

      const historyRes = await httpRequest(HOST, PORT, '/api/config/history', 'GET');
      const history = JSON.parse(historyRes.body);
      const latest = history[0];
      assert.equal(latest.action, 'force_reset');
      assert.ok(latest.conflictNote);
    });
  });

  describe('5.8 配置历史 CSV 导出', () => {
    it('GET /api/config/history/csv 返回 CSV 格式', async () => {
      const res = await httpRequest(HOST, PORT, '/api/config/history/csv', 'GET');
      assert.equal(res.status, 200);
      const contentType = res.headers['content-type'] as string;
      assert.ok(contentType.includes('text/csv'));
      assert.ok(res.body.startsWith('\uFEFF'), 'CSV 应以 BOM 开头');
      assert.ok(res.body.includes('id,version,action,operator,operatedAt'));
      assert.ok(res.body.includes('distanceThresholdBefore'));
      assert.ok(res.body.includes('levelMappingBefore'));
    });

    it('CSV 包含 force_save 类型的记录和 conflictNote', async () => {
      const res = await httpRequest(HOST, PORT, '/api/config/history/csv', 'GET');
      assert.equal(res.status, 200);
      assert.ok(res.body.includes('force_save'));
      assert.ok(res.body.includes('覆盖冲突'));
    });
  });

  describe('5.9 完整数据导入（含配置历史）', () => {
    it('POST /api/import/full 导入包含 configHistory 的完整数据', async () => {
      const fullRes = await httpRequest(HOST, PORT, '/api/export/full/json', 'GET');
      const fullData = JSON.parse(fullRes.body);
      assert.ok(fullData.configHistory.length > 0, '导出应有配置历史');

      const exportBeforeCount = fullData.configHistory.length;

      const boundary = `----ImportBoundary${Date.now()}`;
      const fileContent = Buffer.from(JSON.stringify(fullData), 'utf-8');
      const preamble = Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="full_data.json"\r\n` +
        `Content-Type: application/json\r\n` +
        `\r\n`
      );
      const epilogue = Buffer.from(`\r\n--${boundary}--\r\n`);
      const totalLength = preamble.length + fileContent.length + epilogue.length;

      const options: http.RequestOptions = {
        hostname: HOST,
        port: PORT,
        path: '/api/import/full',
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': totalLength,
        },
      };

      const importResult = await new Promise<{ status: number; body: string }>((resolve, reject) => {
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

      assert.equal(importResult.status, 200);
      const result = JSON.parse(importResult.body);
      assert.equal(result.success, true);
      assert.ok(result.configVersion);
      assert.equal(result.historyCount, exportBeforeCount);
    });

    it('导入后配置历史可查询且版本一致', async () => {
      const configRes = await httpRequest(HOST, PORT, '/api/config', 'GET');
      const config = JSON.parse(configRes.body);

      const historyRes = await httpRequest(HOST, PORT, '/api/config/history', 'GET');
      const history = JSON.parse(historyRes.body);

      assert.ok(history.length > 0, '导入后应有配置历史');
      assert.equal(history[0].version, config.version, '最新历史版本应与当前配置版本一致');
    });

    it('导入数据缺少 config 字段应返回失败', async () => {
      const invalidData = { batches: [], points: [] };
      const boundary = `----ImportBoundary${Date.now()}`;
      const fileContent = Buffer.from(JSON.stringify(invalidData), 'utf-8');
      const preamble = Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="invalid.json"\r\n` +
        `Content-Type: application/json\r\n` +
        `\r\n`
      );
      const epilogue = Buffer.from(`\r\n--${boundary}--\r\n`);
      const totalLength = preamble.length + fileContent.length + epilogue.length;

      const options: http.RequestOptions = {
        hostname: HOST,
        port: PORT,
        path: '/api/import/full',
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': totalLength,
        },
      };

      const importResult = await new Promise<{ status: number; body: string }>((resolve, reject) => {
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

      const result = JSON.parse(importResult.body);
      assert.equal(result.success, false);
      assert.ok(result.message.includes('config'));
    });

    it('导入数据 configHistory 版本与 config 版本不一致时给出警告', async () => {
      const fullRes = await httpRequest(HOST, PORT, '/api/export/full/json', 'GET');
      const fullData = JSON.parse(fullRes.body);

      fullData.config.version = '99.99.99';

      const boundary = `----ImportBoundary${Date.now()}`;
      const fileContent = Buffer.from(JSON.stringify(fullData), 'utf-8');
      const preamble = Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="version_mismatch.json"\r\n` +
        `Content-Type: application/json\r\n` +
        `\r\n`
      );
      const epilogue = Buffer.from(`\r\n--${boundary}--\r\n`);
      const totalLength = preamble.length + fileContent.length + epilogue.length;

      const options: http.RequestOptions = {
        hostname: HOST,
        port: PORT,
        path: '/api/import/full',
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': totalLength,
        },
      };

      const importResult = await new Promise<{ status: number; body: string }>((resolve, reject) => {
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

      assert.equal(importResult.status, 200);
      const result = JSON.parse(importResult.body);
      assert.equal(result.success, true);
      assert.ok(result.warnings && result.warnings.length > 0, '应有版本不一致警告');
      assert.ok(result.warnings[0].includes('不一致'));
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
