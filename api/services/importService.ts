import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import csvParser from 'csv-parser';
import db, { saveDb } from '../models/db.js';
import { Batch, Point, Defect, Rectification, ValidationError } from '../../shared/types.js';
import { validatePointRow, validateDefectRow, validateRectificationRow, checkDuplicateBatch } from '../utils/validators.js';
import { processAndSaveMergedDefects } from './defectMergeService.js';

interface ImportResult {
  success: boolean;
  batch?: Batch;
  errors?: ValidationError[];
  message?: string;
  newEvents?: number;
}

export function parseCSVFile(filePath: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const results: any[] = [];
    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

export function parseJSONFile(filePath: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) reject(err);
      try {
        const json = JSON.parse(data);
        const records = Array.isArray(json) ? json : json.data || json.defects || [];
        resolve(records);
      } catch (e) {
        reject(e);
      }
    });
  });
}

export async function importPoints(filePath: string, fileName: string): Promise<ImportResult> {
  await db.read();

  if (checkDuplicateBatch(fileName, 'points')) {
    return {
      success: false,
      message: '相同名称的点位批次已存在，请勿重复导入',
    };
  }

  const batchId = uuidv4();
  const batch: Batch = {
    id: batchId,
    name: fileName,
    type: 'points',
    status: 'importing',
    importedAt: new Date().toISOString(),
    totalRecords: 0,
    validRecords: 0,
    invalidRecords: 0,
    errors: [],
  };

  db.data?.batches.push(batch);

  try {
    const records = await parseCSVFile(filePath);
    batch.totalRecords = records.length;

    const existingPointCodes = new Set<string>();
    db.data?.points.forEach(p => existingPointCodes.add(p.pointCode));

    const validPoints: Point[] = [];
    const allErrors: ValidationError[] = [];
    const seenCodesInBatch = new Set<string>();

    records.forEach((record, index) => {
      const rowErrors = validatePointRow(record, index + 1, existingPointCodes);

      const pointCode = String(record.pointCode || '').trim();
      if (pointCode && seenCodesInBatch.has(pointCode)) {
        rowErrors.push({
          row: index + 1,
          field: 'pointCode',
          message: '本批次内点位编号重复',
          value: record.pointCode,
        });
      } else if (pointCode) {
        seenCodesInBatch.add(pointCode);
      }

      if (rowErrors.length > 0) {
        allErrors.push(...rowErrors);
        batch.invalidRecords++;
      } else {
        const point: Point = {
          id: uuidv4(),
          batchId,
          pointCode,
          x: Number(record.x),
          y: Number(record.y),
          z: Number(record.z),
          description: record.description,
        };
        validPoints.push(point);
        existingPointCodes.add(point.pointCode);
        batch.validRecords++;
      }
    });

    if (allErrors.length > 0) {
      batch.status = 'failed';
      batch.errorMessage = `导入失败：共 ${batch.invalidRecords} 条无效记录，请修正后重新导入`;
      batch.errors = allErrors;
      batch.validRecords = 0;
      batch.invalidRecords = records.length;

      const batchIndex = db.data!.batches.findIndex(b => b.id === batchId);
      if (batchIndex !== -1) {
        db.data!.batches[batchIndex] = { ...batch };
      }

      await saveDb();

      return {
        success: false,
        batch,
        errors: allErrors,
        message: batch.errorMessage,
      };
    }

    if (db.data) {
      db.data.points.push(...validPoints);
    }

    batch.errors = allErrors;
    batch.status = 'success';
    batch.errorMessage = undefined;

    await saveDb();

    return {
      success: true,
      batch,
      errors: [],
    };

  } catch (error: any) {
    batch.status = 'failed';
    batch.errorMessage = error.message;
    batch.validRecords = 0;
    batch.invalidRecords = batch.totalRecords;
    const batchIndex = db.data!.batches.findIndex(b => b.id === batchId);
    if (batchIndex !== -1) {
      db.data!.batches[batchIndex] = { ...batch };
    }
    await saveDb();
    return {
      success: false,
      message: `导入失败: ${error.message}`,
      batch,
    };
  } finally {
    fs.promises.unlink(filePath).catch(() => {});
  }
}

export async function importDefects(filePath: string, fileName: string): Promise<ImportResult> {
  await db.read();

  if (checkDuplicateBatch(fileName, 'defects')) {
    return {
      success: false,
      message: '相同名称的缺陷批次已存在，请勿重复导入',
    };
  }

  const batchId = uuidv4();
  const batch: Batch = {
    id: batchId,
    name: fileName,
    type: 'defects',
    status: 'importing',
    importedAt: new Date().toISOString(),
    totalRecords: 0,
    validRecords: 0,
    invalidRecords: 0,
    errors: [],
  };

  db.data?.batches.push(batch);

  try {
    const records = await parseJSONFile(filePath);
    batch.totalRecords = records.length;

    const validPointCodes = new Set<string>();
    db.data?.points.forEach(p => validPointCodes.add(p.pointCode));

    const validDefects: Defect[] = [];
    const allErrors: ValidationError[] = [];

    records.forEach((record, index) => {
      const rowErrors = validateDefectRow(record, index + 1, validPointCodes);
      if (rowErrors.length > 0) {
        allErrors.push(...rowErrors);
        batch.invalidRecords++;
      } else {
        const defect: Defect = {
          id: uuidv4(),
          batchId,
          pointCode: String(record.pointCode).trim(),
          defectType: String(record.defectType).trim(),
          severity: record.severity,
          description: String(record.description).trim(),
          imageUrl: record.imageUrl,
          detectedAt: record.detectedAt || new Date().toISOString(),
        };
        validDefects.push(defect);
        batch.validRecords++;
      }
    });

    if (allErrors.length > 0) {
      batch.status = 'failed';
      batch.errorMessage = `导入失败：共 ${batch.invalidRecords} 条无效记录，请修正后重新导入`;
      batch.errors = allErrors;
      batch.validRecords = 0;
      batch.invalidRecords = records.length;

      const batchIndex = db.data!.batches.findIndex(b => b.id === batchId);
      if (batchIndex !== -1) {
        db.data!.batches[batchIndex] = { ...batch };
      }

      await saveDb();

      return {
        success: false,
        batch,
        errors: allErrors,
        message: batch.errorMessage,
      };
    }

    let newEvents = 0;
    if (db.data) {
      db.data.defects.push(...validDefects);
      const events = await processAndSaveMergedDefects();
      newEvents = events.length;
    }

    batch.errors = allErrors;
    batch.status = 'success';
    batch.errorMessage = undefined;

    await saveDb();

    return {
      success: true,
      batch,
      errors: [],
      newEvents,
    };

  } catch (error: any) {
    batch.status = 'failed';
    batch.errorMessage = error.message;
    batch.validRecords = 0;
    batch.invalidRecords = batch.totalRecords;
    const batchIndex = db.data!.batches.findIndex(b => b.id === batchId);
    if (batchIndex !== -1) {
      db.data!.batches[batchIndex] = { ...batch };
    }
    await saveDb();
    return {
      success: false,
      message: `导入失败: ${error.message}`,
      batch,
    };
  } finally {
    fs.promises.unlink(filePath).catch(() => {});
  }
}

export async function importRectification(filePath: string, fileName: string): Promise<ImportResult> {
  await db.read();

  if (checkDuplicateBatch(fileName, 'rectification')) {
    return {
      success: false,
      message: '相同名称的整改批次已存在，请勿重复导入',
    };
  }

  const batchId = uuidv4();
  const batch: Batch = {
    id: batchId,
    name: fileName,
    type: 'rectification',
    status: 'importing',
    importedAt: new Date().toISOString(),
    totalRecords: 0,
    validRecords: 0,
    invalidRecords: 0,
    errors: [],
  };

  db.data?.batches.push(batch);

  try {
    const records = await parseCSVFile(filePath);
    batch.totalRecords = records.length;

    const validRectifications: Rectification[] = [];
    const allErrors: ValidationError[] = [];
    const updatedEventIds = new Set<string>();

    records.forEach((record, index) => {
      const rowErrors = validateRectificationRow(record, index + 1);
      if (rowErrors.length > 0) {
        allErrors.push(...rowErrors);
        batch.invalidRecords++;
      } else {
        let eventId = record.eventId;
        if (!eventId) {
          const pointCode = String(record.pointCode).trim();
          const defect = db.data?.defects.find(d => d.pointCode === pointCode);
          if (defect) {
            const event = db.data?.events.find(e => e.mergedDefectIds.includes(defect.id));
            if (event) {
              eventId = event.id;
            }
          }
        }

        const rectification: Rectification = {
          id: uuidv4(),
          batchId,
          eventId,
          pointCode: String(record.pointCode).trim(),
          rectificationMeasure: String(record.rectificationMeasure).trim(),
          rectifier: String(record.rectifier).trim(),
          rectifiedAt: record.rectifiedAt || new Date().toISOString(),
          remark: record.remark,
        };
        validRectifications.push(rectification);
        batch.validRecords++;

        if (eventId) {
          updatedEventIds.add(eventId);
        }
      }
    });

    if (allErrors.length > 0) {
      batch.status = 'failed';
      batch.errorMessage = `导入失败：共 ${batch.invalidRecords} 条无效记录，请修正后重新导入`;
      batch.errors = allErrors;
      batch.validRecords = 0;
      batch.invalidRecords = records.length;

      const batchIndex = db.data!.batches.findIndex(b => b.id === batchId);
      if (batchIndex !== -1) {
        db.data!.batches[batchIndex] = { ...batch };
      }

      await saveDb();

      return {
        success: false,
        batch,
        errors: allErrors,
        message: batch.errorMessage,
      };
    }

    if (db.data) {
      db.data.rectifications.push(...validRectifications);

      for (const eventId of updatedEventIds) {
        const event = db.data.events.find(e => e.id === eventId);
        if (event) {
          const rectification = validRectifications.find(r => r.eventId === eventId);
          if (rectification) {
            event.sourceEvidence.push({
              type: 'rectification',
              batchId,
              batchName: fileName,
              recordId: rectification.id,
              data: { ...rectification },
            });
            event.updatedAt = new Date().toISOString();
          }
        }
      }
    }

    batch.errors = allErrors;
    batch.status = 'success';
    batch.errorMessage = undefined;

    await saveDb();

    return {
      success: true,
      batch,
      errors: [],
    };

  } catch (error: any) {
    batch.status = 'failed';
    batch.errorMessage = error.message;
    batch.validRecords = 0;
    batch.invalidRecords = batch.totalRecords;
    const batchIndex = db.data!.batches.findIndex(b => b.id === batchId);
    if (batchIndex !== -1) {
      db.data!.batches[batchIndex] = { ...batch };
    }
    await saveDb();
    return {
      success: false,
      message: `导入失败: ${error.message}`,
      batch,
    };
  } finally {
    fs.promises.unlink(filePath).catch(() => {});
  }
}
