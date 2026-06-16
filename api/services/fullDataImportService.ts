import db, { saveDb } from '../models/db.js';
import { Config, ConfigHistory } from '../../shared/types.js';
import { addConfigHistory } from './configHistoryService.js';

interface FullDataImportResult {
  success: boolean;
  message: string;
  configVersion?: string;
  historyCount?: number;
  warnings?: string[];
}

function parseVersion(version: string): number {
  const [major, minor, patch] = version.split('.').map(Number);
  return major * 10000 + minor * 100 + patch;
}

export async function importFullData(data: unknown): Promise<FullDataImportResult> {
  await db.read();

  if (!db.data) {
    return { success: false, message: '数据库未初始化' };
  }

  const importData = data as Record<string, unknown>;
  const warnings: string[] = [];

  if (!importData.config) {
    return { success: false, message: '导入数据缺少 config 字段' };
  }

  const oldConfig = { ...db.data.config };
  const importedConfig = importData.config as Config;
  const importedHistory: ConfigHistory[] = Array.isArray(importData.configHistory) ? [...importData.configHistory] : [];
  const importedHistoryCount = importedHistory.length;

  if (importedHistory.length > 0) {
    const latestHistoryVersion = importedHistory[0].version;
    if (latestHistoryVersion !== importedConfig.version) {
      warnings.push(
        `导入数据中配置版本 v${importedConfig.version} 与最新历史版本 v${latestHistoryVersion} 不一致，将以配置版本为准`
      );
    }
  }

  const currentVersionNum = parseVersion(db.data.config.version);
  const importedVersionNum = parseVersion(importedConfig.version);
  let finalConfig = importedConfig;

  if (importedVersionNum <= currentVersionNum) {
    const [major, minor, patch] = db.data.config.version.split('.').map(Number);
    finalConfig = {
      ...importedConfig,
      version: `${major}.${minor}.${patch + 1}`,
      updatedAt: new Date().toISOString(),
      updatedBy: 'import',
    };
    warnings.push(
      `导入版本 v${importedConfig.version} 不高于当前版本 v${db.data.config.version}，已自动递增为 v${finalConfig.version}`
    );
  }

  db.data.batches = Array.isArray(importData.batches) ? importData.batches as [] : db.data.batches;
  db.data.points = Array.isArray(importData.points) ? importData.points as [] : db.data.points;
  db.data.defects = Array.isArray(importData.defects) ? importData.defects as [] : db.data.defects;
  db.data.rectifications = Array.isArray(importData.rectifications) ? importData.rectifications as [] : db.data.rectifications;
  db.data.events = Array.isArray(importData.events) ? importData.events as [] : db.data.events;
  db.data.operationLogs = Array.isArray(importData.operationLogs) ? importData.operationLogs as [] : db.data.operationLogs;
  db.data.config = finalConfig;
  db.data.configHistory = importedHistory;

  addConfigHistory(oldConfig, finalConfig, 'import', 'import', {
    result: 'success',
    trigger: 'import',
    message: `完整数据导入成功，配置版本 v${finalConfig.version}，历史记录 ${importedHistoryCount} 条`,
  });

  await saveDb();

  return {
    success: true,
    message: `完整数据导入成功，配置版本 v${finalConfig.version}，历史记录 ${importedHistoryCount} 条`,
    configVersion: finalConfig.version,
    historyCount: importedHistoryCount,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
