import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { Database, DEFAULT_CONFIG } from '../../shared/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dataDir = path.join(__dirname, '../../data');
const dbPath = path.join(dataDir, 'db.json');
const backupsDir = path.join(dataDir, 'backups');
const rollbacksDir = path.join(dataDir, 'rollbacks');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(backupsDir)) {
  fs.mkdirSync(backupsDir, { recursive: true });
}
if (!fs.existsSync(rollbacksDir)) {
  fs.mkdirSync(rollbacksDir, { recursive: true });
}

function createInitialData(): Database {
  return {
    batches: [],
    points: [],
    defects: [],
    rectifications: [],
    events: [],
    operationLogs: [],
    config: DEFAULT_CONFIG,
    configHistory: [],
    backups: [],
    auditLogs: [],
    rollbackPoints: [],
  };
}

if (!fs.existsSync(dbPath)) {
  const initialData: Database = createInitialData();
  fs.writeFileSync(dbPath, JSON.stringify(initialData, null, 2));
}

const adapter = new JSONFile<Database>(dbPath);
const initialData: Database = createInitialData();
export const db = new Low<Database>(adapter, initialData);

await db.read();

if (!db.data) {
  db.data = createInitialData();
  await db.write();
}

if (!db.data.config) {
  db.data.config = DEFAULT_CONFIG;
  await db.write();
}

if (!db.data.configHistory) {
  db.data.configHistory = [];
  await db.write();
}

if (!db.data.backups) {
  db.data.backups = [];
  await db.write();
}

if (!db.data.auditLogs) {
  db.data.auditLogs = [];
  await db.write();
}

if (!db.data.rollbackPoints) {
  db.data.rollbackPoints = [];
  await db.write();
}

export const PATHS = {
  dataDir,
  backupsDir,
  rollbacksDir,
  dbPath,
};

export const saveDb = async () => {
  await db.write();
};

export default db;
