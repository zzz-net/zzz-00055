import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { Database, DEFAULT_CONFIG } from '../../shared/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dataDir = path.join(__dirname, '../../data');
const dbPath = path.join(dataDir, 'db.json');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

if (!fs.existsSync(dbPath)) {
  const initialData: Database = {
    batches: [],
    points: [],
    defects: [],
    rectifications: [],
    events: [],
    operationLogs: [],
    config: DEFAULT_CONFIG,
    configHistory: [],
  };
  fs.writeFileSync(dbPath, JSON.stringify(initialData, null, 2));
}

const adapter = new JSONFile<Database>(dbPath);
const initialData: Database = {
  batches: [],
  points: [],
  defects: [],
  rectifications: [],
  events: [],
  operationLogs: [],
  config: DEFAULT_CONFIG,
  configHistory: [],
};
export const db = new Low<Database>(adapter, initialData);

await db.read();

if (!db.data) {
  const initialData: Database = {
    batches: [],
    points: [],
    defects: [],
    rectifications: [],
    events: [],
    operationLogs: [],
    config: DEFAULT_CONFIG,
    configHistory: [],
  };
  db.data = initialData;
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

export const saveDb = async () => {
  await db.write();
};

export default db;
