import fs from 'fs';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'db.json');
const dbData = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));

dbData.configHistory = [];
dbData.config = {
  "id": "default",
  "distanceThreshold": 5,
  "levelMapping": [
    { "severity": "critical", "level": "一级", "color": "#ef4444" },
    { "severity": "major", "level": "二级", "color": "#f59e0b" },
    { "severity": "medium", "level": "三级", "color": "#10b981" },
    { "severity": "minor", "level": "四级", "color": "#6366f1" }
  ],
  "version": "1.0.0",
  "updatedAt": new Date().toISOString(),
  "updatedBy": "system"
};

fs.writeFileSync(dbPath, JSON.stringify(dbData, null, 2));
console.log('数据库已重置');
console.log('configHistory:', dbData.configHistory.length);
console.log('config.version:', dbData.config.version);
console.log('config.distanceThreshold:', dbData.config.distanceThreshold);
