# 屋顶巡检缺陷复盘看板

一个本地运行的屋顶巡检缺陷管理系统，支持数据导入、字段校验、缺陷合并、状态流转和数据导出。

## 技术栈

- **前端**: React 18 + TypeScript + Vite + TailwindCSS 3 + Zustand + React Router
- **后端**: Express 4 + TypeScript + Lowdb + Multer + CSV Parser
- **数据存储**: 本地 JSON 文件 (`data/db.json`)

## 目录结构

```
├── api/                    # 后端代码
│   ├── models/            # 数据库模型
│   ├── routes/            # API 路由
│   ├── services/          # 业务逻辑服务
│   ├── utils/             # 工具函数
│   └── app.ts             # Express 应用入口
├── src/                    # 前端代码
│   ├── components/        # React 组件
│   ├── pages/             # 页面组件
│   ├── store/             # Zustand 状态管理
│   ├── api/               # API 调用封装
│   └── App.tsx            # 应用入口
├── shared/                 # 前后端共享类型
├── data/                   # 数据目录
│   ├── samples/           # 样例数据
│   └── db.json            # 数据库文件（自动生成）
└── README.md
```

## 快速开始

### 安装依赖

```bash
npm install
```

### 启动开发服务

```bash
# 同时启动前端和后端
npm run dev

# 或分别启动
npm run client:dev    # 前端: http://localhost:5173
npm run server:dev    # 后端: http://localhost:3001
```

### 类型检查

```bash
npm run check
```

### 构建生产版本

```bash
npm run build
```

---

## 主流程操作指南

### 1. 导入样例数据

系统提供了三组样例数据，位于 `data/samples/` 目录：

| 文件名 | 类型 | 说明 |
|--------|------|------|
| `roof_points_202606.csv` | 点位 CSV | 12 个屋顶巡检点位，包含坐标信息 |
| `defects_202606.json` | 缺陷 JSON | 8 条缺陷记录，关联到具体点位 |
| `rectification_202606.csv` | 整改回传 CSV | 3 条整改完成记录 |

**操作步骤：**

1. 启动服务后访问 `http://localhost:5173`
2. 点击左侧导航栏的「批次管理」
3. 依次导入三个文件：
   - **点位 CSV**: 点击「点位 CSV」区域的上传按钮，选择 `roof_points_202606.csv`
   - **缺陷 JSON**: 点击「缺陷 JSON」区域的上传按钮，选择 `defects_202606.json`
   - **整改 CSV**: 点击「整改回传 CSV」区域的上传按钮，选择 `rectification_202606.csv`

> **注意**: 必须先导入点位数据，再导入缺陷数据，因为缺陷需要关联点位坐标。

导入缺陷数据后，系统会自动：
- 校验所有字段
- 按配置的距离阈值合并相近缺陷
- 生成缺陷事件（初始状态为「待确认」）

### 2. 查看缺陷事件

1. 点击左侧导航栏的「缺陷事件」
2. 可以看到自动生成的缺陷事件列表
3. 支持按状态筛选、按批次筛选、关键词搜索
4. 点击「查看详情」进入事件详情页

### 3. 补充复核备注

1. 在事件详情页，找到「复核备注」区域
2. 输入操作人姓名（如：张三）
3. 输入复核备注内容（如：该缺陷为屋面卷材开裂，需立即处理）
4. 点击「添加备注」

### 4. 状态流转操作

事件支持以下状态流转：

```
待确认(pending)
  ├─→ 需整改(need_rectify)
  └─→ 已作废(cancelled)

需整改(need_rectify)
  └─→ 已复核(reviewed)

已复核(reviewed)
  ├─→ 已关闭(closed)
  └─→ 需整改(need_rectify)  [整改不通过]

已关闭(closed)
  └─→ 需整改(need_rectify)  [重新打开]

已作废(cancelled)
  └─→ 无后续操作
```

**操作步骤：**

1. 在事件详情页的「状态流转」区域
2. 输入操作人姓名
3. 点击对应的操作按钮（如：「确认需整改」）
4. 状态会自动更新，并记录操作日志

### 5. 关闭一条事件

1. 选择一条状态为「已复核」的事件
2. 进入详情页
3. 输入操作人姓名
4. 点击「验证通过关闭」
5. 事件状态变为「已关闭」

### 6. 导出数据

点击左侧导航栏的「数据导出」，支持三种导出方式：

| 导出类型 | 格式 | 说明 |
|----------|------|------|
| 事件 CSV | `.csv` | 扁平化的事件数据，便于 Excel 分析 |
| 事件 JSON | `.json` | 包含关联数据的结构化 JSON |
| 完整备份 | `.json` | 完整的数据库备份，包含所有批次、点位、缺陷、事件 |

**操作步骤：**

1. 选择要导出的批次（或留空导出全部）
2. 点击对应的导出按钮
3. 浏览器会自动下载文件

---

## 失败路径复现指南

### 1. 缺少点位编号

**测试文件**: `data/samples/roof_points_invalid.csv`

**复现步骤：**
1. 进入「批次管理」页面
2. 上传 `roof_points_invalid.csv`
3. 预期结果：导入失败，提示「第 3 行: 点位编号不能为空」

**文件说明**: 该文件第 3 行缺少 `pointCode` 字段值。

### 2. 坐标非法

**测试文件**: `data/samples/roof_points_invalid.csv`

**复现步骤：**
1. 进入「批次管理」页面
2. 上传 `roof_points_invalid.csv`
3. 预期结果：导入失败，提示「第 4 行: 坐标 X 必须是有效的数字」

**文件说明**: 该文件第 4 行 `xCoord` 字段值为 "invalid"（非数字）。

### 3. 错误阈值配置

**复现步骤：**
1. 进入「规则配置」页面
2. 将「距离阈值」设置为 0 或负数
3. 点击「保存配置」
4. 预期结果：提示「距离阈值必须大于 0」

**另一种错误场景：**
1. 将「等级映射」中的所有条目删除
2. 点击「保存配置」
3. 预期结果：提示「等级映射不能为空」

### 4. 重复导入同一批次

**复现步骤：**
1. 先成功导入 `roof_points_202606.csv`
2. 再次上传同一个文件
3. 预期结果：导入失败，提示「批次名称已存在: roof_points_202606」

### 5. 数据完整性保护

**验证已有批次不被破坏：**
1. 成功导入一批数据
2. 记录批次 ID 和数量
3. 尝试导入错误数据（会失败）
4. 刷新页面，检查原有批次数据是否完整

**验证关闭日志不被破坏：**
1. 将一条事件流转到「已关闭」状态
2. 查看操作日志，确认有关闭记录
3. 重启服务（停止后重新运行 `npm run dev`）
4. 再次查看该事件，确认状态和操作日志保持不变

### 6. 重启持久化验证

**验证步骤：**
1. 完成以下操作：
   - 导入一批数据
   - 生成缺陷事件
   - 添加复核备注
   - 关闭一条事件
   - 记录规则版本号
2. 停止服务（Ctrl+C）
3. 重新启动服务（`npm run dev`）
4. 进入系统验证：
   - ✅ 批次数据完整存在
   - ✅ 事件状态保持不变
   - ✅ 复核人备注完整保留
   - ✅ 来源证据链完整
   - ✅ 规则版本号一致
5. 导出 CSV 和 JSON，验证所有数据正确无误

---

## 核心功能说明

### 缺陷合并算法

系统采用贪心合并算法：
1. 按严重等级从高到低排序所有缺陷
2. 遍历每个未合并的缺陷
3. 查找距离小于阈值的其他缺陷进行合并
4. 保留所有来源证据，合并后的严重等级取最高值

### 距离计算

使用欧几里得距离公式：
```
distance = sqrt((x2 - x1)² + (y2 - y1)²)
```

### 等级映射

可配置的等级映射，将原始缺陷等级映射为系统内部等级：
- Critical → 严重（红色）
- Major → 较重（橙色）
- Medium → 中等（黄色）
- Minor → 轻微（蓝色）

### 来源证据链

每个事件都保留完整的来源证据，包括：
- 原始缺陷 ID
- 来源批次
- 关联点位
- 导入时间
- 规则版本（用于追溯合并规则）

---

## API 接口

所有接口前缀为 `/api`，返回 JSON（导出接口除外）。错误时返回 `{ success: false, error: '...' }` 或 `{ success: false, message: '...' }`，HTTP 状态码 4xx/5xx。

### 批次管理

#### GET /api/batches
获取批次列表，按创建时间倒序。

**Query 参数：** 无

**返回示例：**
```json
[
  {
    "id": "uuid",
    "name": "roof_points_202606",
    "type": "points",
    "status": "success",
    "validRecords": 12,
    "invalidRecords": 0,
    "createdAt": "2026-06-16T08:00:00.000Z"
  }
]
```

#### GET /api/batches/:id
获取单个批次详情。

**Path 参数：**
- `id` - 批次 ID

**返回示例：** 同上单个对象；不存在时返回 `404 { "message": "批次不存在" }`。

---

### 数据导入

三类导入均使用 `multipart/form-data`，字段名 `file`。

#### POST /api/import/points
导入点位 CSV。

#### POST /api/import/defects
导入缺陷 JSON，导入完成后自动触发缺陷合并生成事件。

#### POST /api/import/rectification
导入整改回传 CSV。

**成功返回：**
```json
{
  "success": true,
  "batch": { "id": "...", "name": "...", "status": "success", "validRecords": 12 },
  "newEvents": 3
}
```
`newEvents` 仅缺陷导入返回。

**失败返回（整批回滚，不写入任何数据）：**
```json
{
  "success": false,
  "batch": { "id": "...", "status": "failed", "errors": [...] },
  "errors": [
    { "row": 3, "field": "pointCode", "message": "点位编号不能为空" },
    { "row": 4, "field": "xCoord", "message": "坐标 X 必须是有效的数字" }
  ],
  "message": "导入失败：共 2 条无效记录"
}
```

---

### 事件管理

#### GET /api/events
获取事件列表。

**Query 参数：**
- `status` (可选) - 按状态过滤：`pending` \| `need_rectify` \| `reviewed` \| `closed` \| `cancelled`
- `batchId` (可选) - 按来源批次过滤

#### GET /api/events/:id
获取事件详情（含关联缺陷、整改、操作日志）。

#### PATCH /api/events/:id/status
更新事件状态（含状态流转日志）。

**状态流转图：**
```
pending (待确认)
  ├─→ need_rectify (需整改)
  └─→ cancelled (已作废)

need_rectify (需整改)
  └─→ reviewed (已复核)

reviewed (已复核)
  ├─→ closed (已关闭)
  └─→ need_rectify (需整改)  [整改不通过，打回]

closed (已关闭)
  └─→ need_rectify (需整改)  [重新打开]
```

**Body：**
```json
{
  "newStatus": "need_rectify",
  "operator": "张三",
  "remark": "现场确认需要整改"
}
```

**成功返回：**
```json
{
  "success": true,
  "event": { "id": "...", "status": "need_rectify", ... }
}
```

**失败返回（状态不合法或流转不允许）：**
```json
{
  "success": false,
  "message": "不允许从 pending 直接流转到 closed"
}
```

#### PATCH /api/events/:id/remark
添加复核备注。

**Body：**
```json
{
  "remark": "该缺陷已通知施工队处理",
  "reviewer": "李四"
}
```

**成功返回：**
```json
{
  "success": true,
  "event": { "id": "...", "status": "pending", "reviewRemark": "...", ... }
}
```

---

### 配置管理

#### GET /api/config
获取当前配置。

#### PUT /api/config
更新配置（距离阈值、等级映射等）。保存后自动触发全量事件重算。

**Body：**
```json
{
  "distanceThreshold": 5.0,
  "levelMapping": [
    { "severity": "Critical", "level": "严重", "color": "#ef4444" }
  ]
}
```

**成功返回：**
```json
{
  "success": true,
  "config": { "version": "1.0.1", "distanceThreshold": 5.0, ... },
  "recalculated": {
    "previousEventCount": 6,
    "newEventCount": 5,
    "preservedStatusCount": 2
  }
}
```

#### POST /api/config/reset
重置为默认配置，同样触发全量重算。

---

### 数据导出

三条导出接口均为 GET，直接在浏览器访问会触发下载。

#### GET /api/export/events/csv
导出事件 CSV，包含追溯字段（来源证据、操作日志数量、规则版本、最后状态变更时间等）。

**Query 参数：**
- `batchId` (可选) - 只导出该批次相关事件

**响应：** `Content-Type: text/csv; charset=utf-8`，带 BOM，Excel 可直接打开。

#### GET /api/export/events/json
导出事件 JSON，内嵌关联缺陷、整改、操作日志。与 CSV 按创建时间升序一一对应。

**Query 参数：**
- `batchId` (可选) - 只导出该批次相关事件

**响应结构：**
```json
{
  "exportedAt": "2026-06-16T08:30:00.000Z",
  "eventCount": 5,
  "currentRuleVersion": "1.0.1",
  "events": [
    {
      "id": "...",
      "status": "pending",
      "level": "严重",
      "ruleVersion": "1.0.1",
      "defects": [ ... ],
      "rectifications": [ ... ],
      "operationLogs": [ ... ]
    }
  ]
}
```

#### GET /api/export/full/json
导出完整数据库备份（批次、点位、缺陷、整改、事件、操作日志、配置）。

---

## 配置说明

### 距离阈值

- 默认值: 5.0 米
- 含义: 两个缺陷之间的距离小于该阈值时会被合并
- 可在「规则配置」页面动态调整

### 等级映射

支持配置 4 个等级，每个等级包含：
- 等级名称（如：严重、较重）
- 匹配的原始等级（如：Critical、Major）
- 显示颜色

---

## 常见问题

### Q: 数据存储在哪里？
A: 所有数据存储在 `data/db.json` 文件中，删除该文件会重置所有数据。

### Q: 如何重置为初始状态？
A: 停止服务后删除 `data/db.json` 文件，重新启动服务即可。

### Q: 支持哪些浏览器？
A: 推荐使用 Chrome、Edge、Firefox 等现代浏览器的最新版本。

### Q: 可以在生产环境使用吗？
A: 本项目为本地演示用途，如需生产环境使用，请考虑：
- 更换为专业数据库（PostgreSQL、MongoDB 等）
- 添加用户认证和权限管理
- 增加数据备份机制
- 部署到安全的服务器环境

---

## 回归测试

项目内置了三套回归测试，共 **55 个测试用例全部通过**。

### 运行测试

```bash
npm test
```

> 文档一致性测试会自动校验 README 里的测试统计是否与实际代码一致，防止以后加测试时漏改文档。

### 测试套件 1：业务逻辑回归（tests/regression.test.ts）

直接调用 Service 层，验证核心业务逻辑。

| 测试套件 | 用例数 | 说明 |
|----------|--------|------|
| 数据导入 - 成功路径 | 3 | 点位、缺陷、整改三类数据导入成功 |
| 重复导入校验 | 4 | 三类数据各自的重复导入都应失败 |
| 非法数据导入 - 整批失败不留脏数据 | 3 | 非法数据整批失败，不写入任何记录 |
| 规则切换立即生效 | 4 | 阈值增大/减小、等级映射修改都立即生效 |
| 数据导出增强 | 3 | CSV字段完整、JSON结构完整、两者一一对应 |
| 重启持久化验证 | 2 | 模拟重启后数据和配置保持一致 |
| 改配置后再导出 | 1 | 配置修改后导出使用新规则 |

**共 20 个用例。**

### 测试套件 2：API 路由一致性（tests/api-routes.test.ts）

启动真实 HTTP 服务器，验证路由、方法、参数、返回结构与文档完全一致。

| 测试套件 | 用例数 | 说明 |
|----------|--------|------|
| 导出接口 - 正确路径 | 4 | CSV/JSON/full 三条导出接口正常返回，CSV 与 JSON 一一对应 |
| 导出接口 - 错误路径 | 3 | events.csv/events.json/full.json 旧错误路径全部返回 404 |
| 备注接口 - 正确方法与路径 | 2 | PATCH 添加备注成功，GET 详情能查到备注 |
| 备注接口 - 错误方法 | 1 | POST 方法访问 remark 接口返回 404 |
| 状态接口 - 正确状态值与筛选 | 6 | 初始状态、状态筛选、两级流转、操作日志验证 |
| 状态接口 - 错误状态值与非法流转 | 4 | confirmed 无效值失败、非法流转失败、失败不脏改原状态 |
| README 文档状态枚举一致性 | 7 | 5 个状态筛选全通、3 级流转全通、2 个错误场景失败、文档步骤从头复现 |
| README 验证步骤完整复现 | 1 | 从头跑通导入→查看→加备注→改配置→导出全流程 |
| 错误路径与方法综合验证 | 4 | 不存在路径、错误方法、不存在事件等边界场景 |

**共 32 个用例。**

### 测试套件 3：文档一致性校验（tests/docs-consistency.test.ts）

自动校验 README 与代码不脱节，防止文档统计和实际测试数不一致。

| 测试套件 | 用例数 | 说明 |
|----------|--------|------|
| 总用例数一致性 | 1 | README 声明的总用例数与真实测试文件一致 |
| 运行命令存在 | 1 | README 包含 npm test 运行命令 |
| 测试文件存在 | 1 | README 提到的测试文件都真实存在 |

**共 3 个用例。**

---

## 许可证

MIT License
