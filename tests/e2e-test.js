import assert from 'assert';
import fs from 'fs';
import path from 'path';

const API_BASE = 'http://localhost:3001';

async function testE2E() {
  console.log('=== 端到端测试: 规则配置与导出完整链路 ===\n');

  let config;
  let history1;
  let history2;
  let summary;

  console.log('1. 获取当前配置...');
  const configRes = await fetch(`${API_BASE}/api/config`);
  config = await configRes.json();
  console.log('   当前版本:', config.version);
  console.log('   距离阈值:', config.distanceThreshold);

  console.log('\n2. 修改配置并保存（距离阈值 5.0 -> 7.0）...');
  const saveRes1 = await fetch(`${API_BASE}/api/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      distanceThreshold: 7.0,
      levelMapping: config.levelMapping,
      operator: '测试用户'
    })
  });
  const saveResult1 = await saveRes1.json();
  console.log('   结果:', saveResult1.message);
  assert.strictEqual(saveResult1.skipped, false, '首次保存不应跳过');

  console.log('\n3. 重复保存相同配置（应跳过）...');
  const saveRes2 = await fetch(`${API_BASE}/api/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      distanceThreshold: 7.0,
      levelMapping: config.levelMapping,
      operator: '测试用户'
    })
  });
  const saveResult2 = await saveRes2.json();
  console.log('   结果:', saveResult2.message);
  assert.strictEqual(saveResult2.skipped, true, '重复保存应跳过');

  console.log('\n4. 再次修改配置（距离阈值 7.0 -> 10.0，修改等级颜色）...');
  const newLevelMapping = [...config.levelMapping].map(item => ({ ...item }));
  newLevelMapping[0].color = '#dc2626';
  newLevelMapping[1].color = '#ea580c';
  
  const saveRes3 = await fetch(`${API_BASE}/api/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      distanceThreshold: 10.0,
      levelMapping: newLevelMapping,
      operator: '测试用户'
    })
  });
  const saveResult3 = await saveRes3.json();
  console.log('   结果:', saveResult3.message);
  assert.strictEqual(saveResult3.skipped, false, '修改配置不应跳过');

  console.log('\n5. 重置配置...');
  const resetRes = await fetch(`${API_BASE}/api/config/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operator: '测试用户' })
  });
  const resetResult = await resetRes.json();
  console.log('   结果:', resetResult.message);
  assert.strictEqual(resetResult.skipped, false, '重置配置不应跳过');

  console.log('\n6. 再次重置（应跳过）...');
  const resetRes2 = await fetch(`${API_BASE}/api/config/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operator: '测试用户' })
  });
  const resetResult2 = await resetRes2.json();
  console.log('   结果:', resetResult2.message);
  assert.strictEqual(resetResult2.skipped, true, '重复重置应跳过');

  console.log('\n7. 查看配置历史...');
  const historyRes = await fetch(`${API_BASE}/api/config/history`);
  history1 = await historyRes.json();
  console.log('   历史记录数量:', history1.length);
  assert.strictEqual(history1.length, 3, '应该有3条历史记录（2次保存+1次重置）');
  
  history1.forEach((item, i) => {
    console.log(`   [${i}] ${item.action} v${item.version} by ${item.operator} at ${item.operatedAt}`);
    console.log(`       距离阈值: ${item.distanceThreshold.before} → ${item.distanceThreshold.after}`);
    assert.ok(item.id, '历史记录应有ID');
    assert.ok(item.version, '历史记录应有版本');
    assert.ok(['save', 'reset'].includes(item.action), '操作类型正确');
    assert.ok(item.operator, '历史记录应有操作人');
    assert.ok(item.operatedAt, '历史记录应有操作时间');
    assert.ok(item.distanceThreshold, '历史记录应有距离阈值前后值');
    assert.ok(item.levelMapping, '历史记录应有等级映射前后值');
  });

  console.log('\n8. 验证历史记录内容正确性...');
  assert.strictEqual(history1[0].action, 'reset', '第一条应该是重置');
  assert.strictEqual(history1[0].distanceThreshold.before, 10.0, '重置前阈值应为10.0');
  assert.strictEqual(history1[0].distanceThreshold.after, 5.0, '重置后阈值应为5.0');
  
  assert.strictEqual(history1[1].action, 'save', '第二条应该是保存');
  assert.strictEqual(history1[1].distanceThreshold.before, 7.0, '保存前阈值应为7.0');
  assert.strictEqual(history1[1].distanceThreshold.after, 10.0, '保存后阈值应为10.0');
  
  assert.strictEqual(history1[2].action, 'save', '第三条应该是保存');
  assert.strictEqual(history1[2].distanceThreshold.before, 5.0, '保存前阈值应为5.0');
  assert.strictEqual(history1[2].distanceThreshold.after, 7.0, '保存后阈值应为7.0');

  console.log('\n9. 测试历史记录限制（最多10条）...');
  for (let i = 0; i < 15; i++) {
    await fetch(`${API_BASE}/api/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        distanceThreshold: 5.0 + i * 0.5,
        levelMapping: config.levelMapping,
        operator: '压力测试'
      })
    });
  }
  const historyRes2 = await fetch(`${API_BASE}/api/config/history`);
  const historyMany = await historyRes2.json();
  console.log('   历史记录数量:', historyMany.length);
  assert.strictEqual(historyMany.length, 10, '历史记录最多保留10条');

  console.log('\n10. 测试历史记录分页（limit=5）...');
  const historyRes3 = await fetch(`${API_BASE}/api/config/history?limit=5`);
  const historyLimited = await historyRes3.json();
  console.log('   限制后数量:', historyLimited.length);
  assert.strictEqual(historyLimited.length, 5, 'limit=5应返回5条');

  console.log('\n11. 重置配置为初始状态...');
  await fetch(`${API_BASE}/api/config/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operator: '测试用户' })
  });

  console.log('\n12. 测试导出摘要...');
  const summaryRes = await fetch(`${API_BASE}/api/export/summary`);
  summary = await summaryRes.json();
  console.log('   规则版本:', summary.ruleVersion);
  console.log('   事件数量:', summary.eventCount);
  console.log('   批次筛选:', summary.batchFilter.applied ? '已应用' : '未应用');
  console.log('   状态统计:', JSON.stringify(summary.statusCounts));
  assert.ok(summary.exportedAt, '应有导出时间');
  assert.ok(summary.ruleVersion, '应有规则版本');
  assert.ok(typeof summary.eventCount === 'number', '应有事件数量');
  assert.ok(summary.batchFilter, '应有批次筛选信息');
  assert.ok(summary.statusCounts, '应有状态统计');
  assert.ok(summary.levelCounts, '应有等级统计');

  console.log('\n13. 测试带批次筛选的导出摘要...');
  const batchesRes = await fetch(`${API_BASE}/api/batches`);
  const batches = await batchesRes.json();
  if (batches.length > 0) {
    const batchId = batches[0].id;
    const summaryRes2 = await fetch(`${API_BASE}/api/export/summary?batchId=${batchId}`);
    const summary2 = await summaryRes2.json();
    console.log('   批次ID:', batchId);
    console.log('   筛选后事件数量:', summary2.eventCount);
    assert.strictEqual(summary2.batchFilter.applied, true, '批次筛选已应用');
    assert.strictEqual(summary2.batchFilter.batchId, batchId, '批次ID正确');
  } else {
    console.log('   跳过：无批次数据');
  }

  console.log('\n14. 测试CSV导出...');
  const csvRes = await fetch(`${API_BASE}/api/export/events/csv`);
  const csvBuffer = await csvRes.arrayBuffer();
  const csvBytes = new Uint8Array(csvBuffer);
  const hasBOM = csvBytes[0] === 0xEF && csvBytes[1] === 0xBB && csvBytes[2] === 0xBF;
  const csvText = hasBOM ? new TextDecoder('utf-8').decode(csvBuffer.slice(3)) : new TextDecoder('utf-8').decode(csvBuffer);
  const csvLines = csvText.split('\n');
  console.log('   CSV行数:', csvLines.length);
  console.log('   包含BOM:', hasBOM ? '✓' : '✗');
  console.log('   表头:', csvLines[0].substring(0, 100) + '...');
  assert.ok(hasBOM, 'CSV应有BOM');
  assert.ok(csvLines.length > 1, 'CSV应有数据行');

  console.log('\n15. 测试JSON导出（含摘要）...');
  const jsonRes = await fetch(`${API_BASE}/api/export/events/json`);
  const jsonData = await jsonRes.json();
  console.log('   事件数量:', jsonData.events.length);
  console.log('   包含摘要:', !!jsonData.summary);
  assert.ok(Array.isArray(jsonData.events), 'JSON应有events数组');
  assert.ok(jsonData.summary, 'JSON导出应包含摘要');
  assert.strictEqual(jsonData.summary.ruleVersion, summary.ruleVersion, '摘要版本一致');
  assert.strictEqual(jsonData.summary.eventCount, jsonData.events.length, '事件数量一致');

  console.log('\n16. 测试完整备份（含配置历史）...');
  const fullRes = await fetch(`${API_BASE}/api/export/full/json`);
  const fullData = await fullRes.json();
  console.log('   包含configHistory:', !!fullData.configHistory);
  console.log('   配置历史数量:', fullData.configHistory?.length || 0);
  console.log('   包含summary:', !!fullData.summary);
  assert.ok(fullData.batches, '完整备份应有batches');
  assert.ok(fullData.points, '完整备份应有points');
  assert.ok(fullData.defects, '完整备份应有defects');
  assert.ok(fullData.rectifications, '完整备份应有rectifications');
  assert.ok(fullData.events, '完整备份应有events');
  assert.ok(fullData.operationLogs, '完整备份应有operationLogs');
  assert.ok(fullData.config, '完整备份应有config');
  assert.ok(fullData.configHistory, '完整备份应有configHistory');
  assert.ok(Array.isArray(fullData.configHistory), 'configHistory应为数组');
  assert.ok(fullData.configHistory.length > 0, 'configHistory应有数据');
  assert.ok(fullData.summary, '完整备份应有summary');

  console.log('\n17. 验证历史数据持久化（检查db.json）...');
  const dbPath = path.join(process.cwd(), 'data', 'db.json');
  const dbData = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
  console.log('   db.json中configHistory数量:', dbData.configHistory?.length || 0);
  assert.ok(dbData.configHistory, 'db.json应有configHistory');
  assert.ok(Array.isArray(dbData.configHistory), 'configHistory应为数组');
  assert.strictEqual(dbData.configHistory.length, fullData.configHistory.length, 'db.json与完整备份中历史数量一致');

  console.log('\n18. 测试历史记录按时间倒序排列...');
  const historyRes4 = await fetch(`${API_BASE}/api/config/history`);
  const historyOrdered = await historyRes4.json();
  let isDescending = true;
  for (let i = 0; i < historyOrdered.length - 1; i++) {
    const time1 = new Date(historyOrdered[i].operatedAt).getTime();
    const time2 = new Date(historyOrdered[i + 1].operatedAt).getTime();
    if (time1 < time2) {
      isDescending = false;
      break;
    }
  }
  console.log('   按时间倒序排列:', isDescending ? '✓' : '✗');
  assert.ok(isDescending, '历史记录应按时间倒序排列');

  console.log('\n19. 测试等级映射历史记录...');
  const levelMappingItem = historyOrdered[0].levelMapping;
  console.log('   等级映射before数量:', levelMappingItem.before?.length || 0);
  console.log('   等级映射after数量:', levelMappingItem.after?.length || 0);
  assert.ok(Array.isArray(levelMappingItem.before), '等级映射before应为数组');
  assert.ok(Array.isArray(levelMappingItem.after), '等级映射after应为数组');
  assert.ok(levelMappingItem.before.length > 0, '等级映射before应有数据');
  assert.ok(levelMappingItem.after.length > 0, '等级映射after应有数据');
  levelMappingItem.before.forEach(item => {
    assert.ok(item.severity !== undefined, '等级映射应有severity');
    assert.ok(item.level !== undefined, '等级映射应有level');
    assert.ok(item.color !== undefined, '等级映射应有color');
  });

  console.log('\n=== 端到端测试全部通过! ===');
  console.log('\n测试总结:');
  console.log('✓ 配置保存与历史记录生成');
  console.log('✓ 重复配置去重（不生成重复历史）');
  console.log('✓ 配置重置与历史记录');
  console.log('✓ 历史记录内容完整性（操作人、时间、前后值）');
  console.log('✓ 历史记录数量限制（最多10条）');
  console.log('✓ 历史记录分页查询');
  console.log('✓ 历史记录按时间倒序排列');
  console.log('✓ 等级映射历史记录');
  console.log('✓ 导出摘要功能');
  console.log('✓ 带批次筛选的导出摘要');
  console.log('✓ CSV导出（带BOM）');
  console.log('✓ JSON导出（含摘要）');
  console.log('✓ 完整备份（含配置历史）');
  console.log('✓ 历史数据持久化（db.json落盘）');
}

testE2E().catch(err => {
  console.error('\n❌ 测试失败:', err.message);
  console.error(err.stack);
  process.exit(1);
});
