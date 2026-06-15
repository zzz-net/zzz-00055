import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const testsDir = path.join(projectRoot, 'tests');
const readmePath = path.join(projectRoot, 'README.md');

function countTestCases(filePath: string): { describes: number; its: number } {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  let describes = 0;
  let its = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^describe\(/.test(trimmed)) describes++;
    if (/^\s*it\(/.test(trimmed)) its++;
  }

  return { describes, its };
}

function extractNumbersFromReadme(): {
  total: number | null;
  regression: number | null;
  apiRoutes: number | null;
} {
  const content = fs.readFileSync(readmePath, 'utf-8');

  let total: number | null = null;
  let regression: number | null = null;
  let apiRoutes: number | null = null;

  const totalMatch = content.match(/共\s*\*{0,2}\s*(\d+)\s*\*{0,2}\s*个测试用例/);
  if (totalMatch) total = parseInt(totalMatch[1], 10);

  const regMatch = content.match(/测试套件 1.*?共\s*(\d+)\s*个用例/s);
  if (regMatch) regression = parseInt(regMatch[1], 10);

  const apiMatch = content.match(/测试套件 2.*?共\s*(\d+)\s*个用例/s);
  if (apiMatch) apiRoutes = parseInt(apiMatch[1], 10);

  return { total, regression, apiRoutes };
}

describe('文档一致性校验', () => {
  it('README 声明的总用例数与真实测试文件一致', () => {
    const testFiles = fs.readdirSync(testsDir)
      .filter(f => f.endsWith('.test.ts'));

    let realTotal = 0;
    const fileStats: Record<string, { describes: number; its: number }> = {};

    for (const f of testFiles) {
      const stats = countTestCases(path.join(testsDir, f));
      fileStats[f] = stats;
      realTotal += stats.its;
    }

    const readme = extractNumbersFromReadme();

    assert.ok(readme.total !== null, 'README 应声明总用例数');
    assert.equal(
      readme.total,
      realTotal,
      `README 声明总用例数 ${readme.total} 与实际 ${realTotal} 不一致，请更新 README 回归测试章节`
    );

    if (fileStats['regression.test.ts']) {
      assert.ok(readme.regression !== null, 'README 应声明业务逻辑测试用例数');
      assert.equal(
        readme.regression,
        fileStats['regression.test.ts'].its,
        `README 声明业务逻辑测试 ${readme.regression} 个用例，实际 ${fileStats['regression.test.ts'].its} 个`
      );
    }

    if (fileStats['api-routes.test.ts']) {
      assert.ok(readme.apiRoutes !== null, 'README 应声明 API 路由测试用例数');
      assert.equal(
        readme.apiRoutes,
        fileStats['api-routes.test.ts'].its,
        `README 声明 API 路由测试 ${readme.apiRoutes} 个用例，实际 ${fileStats['api-routes.test.ts'].its} 个`
      );
    }
  });

  it('README 包含运行测试的命令', () => {
    const content = fs.readFileSync(readmePath, 'utf-8');
    assert.ok(content.includes('npm test'), 'README 应包含 npm test 运行命令');
  });

  it('README 列出的测试套件文件都真实存在', () => {
    const content = fs.readFileSync(readmePath, 'utf-8');
    const testFilePattern = /tests\/[\w-]+\.test\.ts/g;
    const matches = content.match(testFilePattern) || [];

    for (const relPath of matches) {
      const fullPath = path.join(projectRoot, relPath);
      assert.ok(
        fs.existsSync(fullPath),
        `README 提到的测试文件 ${relPath} 不存在`
      );
    }
  });
});
