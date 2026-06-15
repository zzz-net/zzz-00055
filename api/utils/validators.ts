import { ValidationError, DefectSeverity, SEVERITY_ORDER } from '../../shared/types.js';
import { isValidCoordinate } from './distance.js';
import db from '../models/db.js';

export function validatePointRow(row: any, rowIndex: number, existingCodes: Set<string>): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!row.pointCode || String(row.pointCode).trim() === '') {
    errors.push({
      row: rowIndex,
      field: 'pointCode',
      message: '点位编号不能为空',
      value: row.pointCode,
    });
  } else if (existingCodes.has(String(row.pointCode).trim())) {
    errors.push({
      row: rowIndex,
      field: 'pointCode',
      message: '点位编号重复',
      value: row.pointCode,
    });
  }

  if (!isValidCoordinate(row.x)) {
    errors.push({
      row: rowIndex,
      field: 'x',
      message: 'X坐标必须为有效数字',
      value: row.x,
    });
  }

  if (!isValidCoordinate(row.y)) {
    errors.push({
      row: rowIndex,
      field: 'y',
      message: 'Y坐标必须为有效数字',
      value: row.y,
    });
  }

  if (!isValidCoordinate(row.z)) {
    errors.push({
      row: rowIndex,
      field: 'z',
      message: 'Z坐标必须为有效数字',
      value: row.z,
    });
  }

  return errors;
}

export function validateDefectRow(row: any, rowIndex: number, validPointCodes: Set<string>): ValidationError[] {
  const errors: ValidationError[] = [];
  const validSeverities = Object.keys(SEVERITY_ORDER) as DefectSeverity[];

  if (!row.pointCode || String(row.pointCode).trim() === '') {
    errors.push({
      row: rowIndex,
      field: 'pointCode',
      message: '点位编号不能为空',
      value: row.pointCode,
    });
  } else if (!validPointCodes.has(String(row.pointCode).trim())) {
    errors.push({
      row: rowIndex,
      field: 'pointCode',
      message: '点位编号不存在于点位表中',
      value: row.pointCode,
    });
  }

  if (!row.severity || !validSeverities.includes(row.severity as DefectSeverity)) {
    errors.push({
      row: rowIndex,
      field: 'severity',
      message: `严重等级必须为: minor/medium/major/critical`,
      value: row.severity,
    });
  }

  if (!row.defectType || String(row.defectType).trim() === '') {
    errors.push({
      row: rowIndex,
      field: 'defectType',
      message: '缺陷类型不能为空',
      value: row.defectType,
    });
  }

  if (!row.description || String(row.description).trim() === '') {
    errors.push({
      row: rowIndex,
      field: 'description',
      message: '缺陷描述不能为空',
      value: row.description,
    });
  }

  return errors;
}

export function validateRectificationRow(row: any, rowIndex: number): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!row.pointCode || String(row.pointCode).trim() === '') {
    errors.push({
      row: rowIndex,
      field: 'pointCode',
      message: '点位编号不能为空',
      value: row.pointCode,
    });
  }

  if (!row.rectificationMeasure || String(row.rectificationMeasure).trim() === '') {
    errors.push({
      row: rowIndex,
      field: 'rectificationMeasure',
      message: '整改措施不能为空',
      value: row.rectificationMeasure,
    });
  }

  if (!row.rectifier || String(row.rectifier).trim() === '') {
    errors.push({
      row: rowIndex,
      field: 'rectifier',
      message: '整改人不能为空',
      value: row.rectifier,
    });
  }

  return errors;
}

export function validateConfig(config: any): ValidationError[] {
  const errors: ValidationError[] = [];

  if (config.distanceThreshold === undefined || config.distanceThreshold === null) {
    errors.push({
      row: 0,
      field: 'distanceThreshold',
      message: '距离阈值不能为空',
      value: config.distanceThreshold,
    });
  } else if (typeof config.distanceThreshold !== 'number' || config.distanceThreshold <= 0) {
    errors.push({
      row: 0,
      field: 'distanceThreshold',
      message: '距离阈值必须为大于0的数字',
      value: config.distanceThreshold,
    });
  }

  if (!Array.isArray(config.levelMapping) || config.levelMapping.length === 0) {
    errors.push({
      row: 0,
      field: 'levelMapping',
      message: '等级映射不能为空',
      value: config.levelMapping,
    });
  }

  return errors;
}

export function checkDuplicateBatch(batchName: string, type: string): boolean {
  return db.data?.batches.some(b => b.name === batchName && b.type === type && b.status === 'success');
}
