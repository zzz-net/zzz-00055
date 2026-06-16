import db, { saveDb } from '../models/db.js';
import { Config, ConfigHistory, Database, DEFAULT_CONFIG } from '../../shared/types.js';

interface FullDataImportResult {
  success: boolean;
  message: string;
  configVersion?: string;
  historyCount?: number;
  warnings?: string[];
}

export async function importFullData(data: any): Promise<FullDataImportResult> {
  await db.read();

  if (!db.data) {
    return { success: false, message: '数据库未初始化' };
  }

  const warnings: string[] = [];

  if (!data.config) {
    return { success: false, message: '导入数据缺少 config 字段' };
  }

  const importedConfig = data.config as Config;
  const importedHistory: ConfigHistory[] = Array.isArray(data.configHistory) ? data.configHistory : [];

  if (importedHistory.length > 0) {
    const latestHistoryVersion = importedHistory[0].version;
    if (latestHistoryVersion !== importedConfig.version) {
      warnings.push(
        `导入数据中配置版本 v${importedConfig.version} 与最新历史版本 v${latestHistoryVersion} 不一致，将以配置版本为准`
      );
    }
  }

  db.data.batches = Array.isArray(data.batches) ? data.batches : db.data.batches;
  db.data.points = Array.isArray(data.points) ? data.points : db.data.points;
  db.data.defects = Array.isArray(data.defects) ? data.defects : db.data.defects;
  db.data.rectifications = Array.isArray(data.rectifications) ? data.rectifications : db.data.rectifications;
  db.data.events = Array.isArray(data.events) ? data.events : db.data.events;
  db.data.operationLogs = Array.isArray(data.operationLogs) ? data.operationLogs : db.data.operationLogs;
  db.data.config = importedConfig;
  db.data.configHistory = importedHistory;

  await saveDb();

  return {
    success: true,
    message: `完整数据导入成功，配置版本 v${importedConfig.version}，历史记录 ${importedHistory.length} 条`,
    configVersion: importedConfig.version,
    historyCount: importedHistory.length,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
