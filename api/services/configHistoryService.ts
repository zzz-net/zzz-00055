import crypto from 'crypto';
import db from '../models/db.js';
import { Config, ConfigHistory, ConfigHistoryAction, LevelMappingItem } from '../../shared/types.js';

const MAX_HISTORY_ITEMS = 10;

function hashLevelMapping(mapping: LevelMappingItem[]): string {
  const sorted = [...mapping].sort((a, b) => a.severity.localeCompare(b.severity));
  return crypto
    .createHash('md5')
    .update(JSON.stringify(sorted))
    .digest('hex');
}

function isSameConfig(config1: { distanceThreshold: number; levelMapping: LevelMappingItem[] }, config2: { distanceThreshold: number; levelMapping: LevelMappingItem[] }): boolean {
  if (config1.distanceThreshold !== config2.distanceThreshold) {
    return false;
  }
  return hashLevelMapping(config1.levelMapping) === hashLevelMapping(config2.levelMapping);
}

export function shouldCreateHistory(newConfig: { distanceThreshold: number; levelMapping: LevelMappingItem[] }): boolean {
  const history = db.data?.configHistory || [];
  if (history.length === 0) {
    return true;
  }
  const latest = history[0];
  return !isSameConfig(
    { distanceThreshold: latest.distanceThreshold.after, levelMapping: latest.levelMapping.after },
    newConfig
  );
}

export function addConfigHistory(
  oldConfig: Config,
  newConfig: Config,
  action: ConfigHistoryAction,
  operator: string,
  options?: {
    conflictNote?: string;
    message?: string;
    result?: 'success' | 'failed' | 'skipped';
    trigger?: 'user' | 'system' | 'import';
  }
): ConfigHistory {
  const history: ConfigHistory = {
    id: crypto.randomUUID(),
    version: newConfig.version,
    action,
    operator,
    operatedAt: new Date().toISOString(),
    result: options?.result || 'success',
    trigger: options?.trigger || 'user',
    conflictNote: options?.conflictNote,
    message: options?.message,
    distanceThreshold: {
      before: oldConfig.distanceThreshold,
      after: newConfig.distanceThreshold,
    },
    levelMapping: {
      before: [...oldConfig.levelMapping],
      after: [...newConfig.levelMapping],
    },
  };

  if (!db.data!.configHistory) {
    db.data!.configHistory = [];
  }

  db.data!.configHistory.unshift(history);

  if (db.data!.configHistory.length > MAX_HISTORY_ITEMS) {
    db.data!.configHistory = db.data!.configHistory.slice(0, MAX_HISTORY_ITEMS);
  }

  return history;
}

export function getConfigHistory(limit: number = 10): ConfigHistory[] {
  const history = db.data?.configHistory || [];
  return history.slice(0, Math.min(limit, MAX_HISTORY_ITEMS));
}
