import { Router, type Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import db, { PATHS } from '../models/db.js';
import { AuthRequest, authMiddleware, canCreateBackup, canDeleteBackup, canRestoreBackup, canRollback, canViewBackup, requireAdmin } from '../middleware/auth.js';
import {
  createBackup,
  listBackups,
  getBackupById,
  deleteBackup,
  readBackupFile,
  previewBackup,
  restoreBackup,
  applyRollback,
  deleteRollbackPoint,
  listRollbackPoints,
  getRollbackPoint,
  registerUploadedBackup,
  clearInterruptedRestore,
} from '../services/backupService.js';
import { addAuditLog, getAuditLogs, getAuditLogsByBackup } from '../services/auditLogService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const uploadDir = path.join(__dirname, '../../data/uploads/backups');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^\w.-]/g, '_');
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/json' || file.originalname.toLowerCase().endsWith('.json')) {
      cb(null, true);
    } else {
      cb(new Error('仅支持 JSON 格式的备份文件'));
    }
  },
});

const router = Router();
router.use(authMiddleware);

function getIp(req: AuthRequest): string {
  return (req.ip || req.socket.remoteAddress || 'unknown').replace('::ffff:', '');
}

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    await db.read();
    if (!canViewBackup(req.user)) {
      await addAuditLog({
        action: 'backup_download',
        operator: req.user?.username || 'unknown',
        operatorRole: req.user?.role || 'viewer',
        result: 'denied',
        message: '无权限查看备份列表',
        ipAddress: getIp(req),
      });
      return res.status(403).json({ success: false, error: '无权限查看备份列表' });
    }
    const backups = listBackups();
    res.json({ success: true, backups });
  } catch (e: unknown) {
    const err = e as Error;
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/create', async (req: AuthRequest, res: Response) => {
  try {
    await db.read();
    if (!canCreateBackup(req.user)) {
      await addAuditLog({
        action: 'backup_create',
        operator: req.user?.username || 'unknown',
        operatorRole: req.user?.role || 'viewer',
        result: 'denied',
        message: '无权限创建备份',
        ipAddress: getIp(req),
      });
      return res.status(403).json({ success: false, error: '无权限创建备份，需要 operator 或 admin 角色' });
    }
    const backup = await createBackup({
      name: req.body.name,
      description: req.body.description,
      createdBy: req.user?.username || req.body.createdBy || 'unknown',
    });
    await addAuditLog({
      action: 'backup_create',
      operator: backup.createdBy,
      operatorRole: req.user?.role || 'viewer',
      targetBackupId: backup.id,
      targetBackupName: backup.name,
      detail: { recordCounts: backup.recordCounts, configVersion: backup.configVersion },
      result: 'success',
      message: `创建备份成功：${backup.name}`,
      ipAddress: getIp(req),
    });
    res.json({ success: true, backup });
  } catch (e: unknown) {
    const err = e as Error;
    await addAuditLog({
      action: 'backup_create',
      operator: req.user?.username || 'unknown',
      operatorRole: req.user?.role || 'viewer',
      result: 'failed',
      message: err.message,
      ipAddress: getIp(req),
    });
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    await db.read();
    if (!canViewBackup(req.user)) {
      return res.status(403).json({ success: false, error: '无权限查看备份' });
    }
    const backup = getBackupById(req.params.id);
    if (!backup) {
      return res.status(404).json({ success: false, error: '备份不存在' });
    }
    res.json({ success: true, backup });
  } catch (e: unknown) {
    const err = e as Error;
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id/download', async (req: AuthRequest, res: Response) => {
  try {
    await db.read();
    if (!canViewBackup(req.user)) {
      await addAuditLog({
        action: 'backup_download',
        operator: req.user?.username || 'unknown',
        operatorRole: req.user?.role || 'viewer',
        targetBackupId: req.params.id,
        result: 'denied',
        message: '无权限下载备份',
        ipAddress: getIp(req),
      });
      return res.status(403).json({ success: false, error: '无权限下载备份' });
    }
    const backup = getBackupById(req.params.id);
    if (!backup || !backup.filePath) {
      return res.status(404).json({ success: false, error: '备份文件不存在' });
    }
    if (!fs.existsSync(backup.filePath)) {
      return res.status(404).json({ success: false, error: '备份文件已被删除' });
    }
    await addAuditLog({
      action: 'backup_download',
      operator: req.user?.username || 'unknown',
      operatorRole: req.user?.role || 'viewer',
      targetBackupId: backup.id,
      targetBackupName: backup.name,
      result: 'success',
      message: `下载备份：${backup.name}`,
      ipAddress: getIp(req),
    });
    const fileName = `${backup.name}.json`;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    fs.createReadStream(backup.filePath).pipe(res);
  } catch (e: unknown) {
    const err = e as Error;
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    await db.read();
    const backup = getBackupById(req.params.id);
    if (!backup) {
      return res.status(404).json({ success: false, error: '备份不存在' });
    }
    const ok = await deleteBackup(req.params.id, req.user?.username || 'unknown');
    await addAuditLog({
      action: 'backup_delete',
      operator: req.user?.username || 'unknown',
      operatorRole: req.user?.role || 'viewer',
      targetBackupId: backup.id,
      targetBackupName: backup.name,
      result: ok ? 'success' : 'failed',
      message: ok ? `删除备份成功：${backup.name}` : '删除备份失败',
      ipAddress: getIp(req),
    });
    res.json({ success: ok });
  } catch (e: unknown) {
    const err = e as Error;
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/upload', upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    await db.read();
    if (!canRestoreBackup(req.user)) {
      if (req.file && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
      }
      await addAuditLog({
        action: 'backup_upload',
        operator: req.user?.username || 'unknown',
        operatorRole: req.user?.role || 'viewer',
        result: 'denied',
        message: '无权限上传备份（仅 admin 可上传恢复）',
        ipAddress: getIp(req),
      });
      return res.status(403).json({ success: false, error: '无权限上传备份，仅 admin 可导入恢复' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: '未上传文件' });
    }
    const content = readBackupFile(req.file.path);
    if (content === null) {
      try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
      await addAuditLog({
        action: 'backup_upload',
        operator: req.user?.username || 'unknown',
        operatorRole: req.user?.role || 'viewer',
        result: 'failed',
        message: '上传的文件不是有效的 JSON',
        ipAddress: getIp(req),
      });
      return res.status(400).json({ success: false, error: '文件解析失败，不是有效的 JSON 文件' });
    }

    const preview = await previewBackup(content, req.file.originalname);

    let registeredBackupId: string | undefined;
    if (preview.validated.valid) {
      const registered = await registerUploadedBackup({
        content,
        name: `导入_${req.file.originalname.replace(/\.json$/i, '')}_${new Date().toISOString().slice(0, 10)}`,
        createdBy: req.user?.username || 'unknown',
        uploadedFilePath: req.file.path,
        description: `从页面上传的备份，原始文件名：${req.file.originalname}`,
      });
      registeredBackupId = registered.id;
    }

    await addAuditLog({
      action: 'backup_upload',
      operator: req.user?.username || 'unknown',
      operatorRole: req.user?.role || 'viewer',
      targetBackupId: registeredBackupId,
      targetBackupName: req.file.originalname,
      detail: {
        validated: preview.validated.valid,
        hasConflicts: (preview.validated.conflicts?.length || 0) > 0,
      },
      result: preview.validated.valid ? 'success' : 'failed',
      message: preview.validated.valid
        ? `上传备份成功：${req.file.originalname}`
        : `上传备份校验失败：${preview.validated.summary}`,
      ipAddress: getIp(req),
    });

    res.json({
      success: preview.validated.valid,
      preview,
      registeredBackupId,
      tempFilePath: req.file.path,
    });
  } catch (e: unknown) {
    const err = e as Error;
    if ((req as unknown as { file?: { path?: string } }).file?.path) {
      try { fs.unlinkSync((req as unknown as { file: { path: string } }).file.path); } catch { /* ignore */ }
    }
    await addAuditLog({
      action: 'backup_upload',
      operator: req.user?.username || 'unknown',
      operatorRole: req.user?.role || 'viewer',
      result: 'failed',
      message: err.message,
      ipAddress: getIp(req),
    });
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/preview/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    await db.read();
    const backup = getBackupById(req.params.id);
    if (!backup || !backup.filePath) {
      return res.status(404).json({ success: false, error: '备份不存在' });
    }
    const content = readBackupFile(backup.filePath);
    if (content === null) {
      return res.status(400).json({ success: false, error: '备份文件损坏，无法读取' });
    }
    const preview = await previewBackup(content, backup.name);
    await addAuditLog({
      action: 'restore_preview',
      operator: req.user?.username || 'unknown',
      operatorRole: req.user?.role || 'viewer',
      targetBackupId: backup.id,
      targetBackupName: backup.name,
      detail: { canRestore: preview.canRestore },
      result: 'success',
      message: `预览备份差异：${backup.name}`,
      ipAddress: getIp(req),
    });
    res.json({ success: true, preview, backup });
  } catch (e: unknown) {
    const err = e as Error;
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/restore/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    await db.read();
    const backup = getBackupById(req.params.id);
    if (!backup || !backup.filePath) {
      return res.status(404).json({ success: false, error: '备份不存在' });
    }
    const content = readBackupFile(backup.filePath);
    if (content === null) {
      return res.status(400).json({ success: false, error: '备份文件损坏' });
    }
    const force = req.body?.force === true;
    const operator = req.user?.username || 'unknown';

    await addAuditLog({
      action: 'restore_start',
      operator,
      operatorRole: req.user?.role || 'viewer',
      targetBackupId: backup.id,
      targetBackupName: backup.name,
      detail: { force },
      result: 'success',
      message: `开始恢复备份：${backup.name}${force ? '（强制覆盖）' : ''}`,
      ipAddress: getIp(req),
    });

    const result = await restoreBackup({
      content,
      operator,
      force,
      backupId: backup.id,
      backupName: backup.name,
    });

    await addAuditLog({
      action: result.success ? 'restore_success' : 'restore_failed',
      operator,
      operatorRole: req.user?.role || 'viewer',
      targetBackupId: backup.id,
      targetBackupName: backup.name,
      detail: {
        rollbackPointId: result.rollbackPointId,
        restoredConfigVersion: result.restoredConfigVersion,
      },
      result: result.success ? 'success' : 'failed',
      message: result.message,
      ipAddress: getIp(req),
    });

    if (result.success) {
      res.json({ success: true, ...result });
    } else {
      res.status(400).json({ success: false, ...result });
    }
  } catch (e: unknown) {
    const err = e as Error;
    await addAuditLog({
      action: 'restore_failed',
      operator: req.user?.username || 'unknown',
      operatorRole: req.user?.role || 'viewer',
      targetBackupId: req.params.id,
      result: 'failed',
      message: `恢复异常：${err.message}`,
      ipAddress: getIp(req),
    });
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/restore-from-upload', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    await db.read();
    const { filePath, force, backupId } = req.body;
    if (!filePath || typeof filePath !== 'string' || !fs.existsSync(filePath)) {
      return res.status(400).json({ success: false, error: '临时文件不存在，请重新上传' });
    }
    if (!filePath.includes('uploads')) {
      return res.status(400).json({ success: false, error: '非法文件路径' });
    }
    const content = readBackupFile(filePath);
    if (content === null) {
      return res.status(400).json({ success: false, error: '文件解析失败' });
    }
    const operator = req.user?.username || 'unknown';

    await addAuditLog({
      action: 'restore_start',
      operator,
      operatorRole: req.user?.role || 'viewer',
      targetBackupId: backupId,
      detail: { force, from: 'upload' },
      result: 'success',
      message: `开始从上传文件恢复${force ? '（强制覆盖）' : ''}`,
      ipAddress: getIp(req),
    });

    const result = await restoreBackup({
      content,
      operator,
      force: force === true,
      backupId,
      backupName: '上传的备份',
    });

    await addAuditLog({
      action: result.success ? 'restore_success' : 'restore_failed',
      operator,
      operatorRole: req.user?.role || 'viewer',
      targetBackupId: backupId,
      detail: {
        rollbackPointId: result.rollbackPointId,
        restoredConfigVersion: result.restoredConfigVersion,
      },
      result: result.success ? 'success' : 'failed',
      message: result.message,
      ipAddress: getIp(req),
    });

    try { fs.unlinkSync(filePath); } catch { /* ignore */ }

    if (result.success) {
      res.json({ success: true, ...result });
    } else {
      res.status(400).json({ success: false, ...result });
    }
  } catch (e: unknown) {
    const err = e as Error;
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/status/interrupted', requireAdmin, (_req: AuthRequest, res: Response) => {
  const status = clearInterruptedRestore();
  res.json({ success: true, cleared: status });
});

router.get('/rollback/list', requireAdmin, (_req: AuthRequest, res: Response) => {
  try {
    const points = listRollbackPoints();
    res.json({ success: true, rollbackPoints: points });
  } catch (e: unknown) {
    const err = e as Error;
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/rollback/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    await db.read();
    const rp = getRollbackPoint(req.params.id);
    if (!rp) {
      return res.status(404).json({ success: false, error: '回滚点不存在' });
    }
    if (!canRollback(req.user)) {
      return res.status(403).json({ success: false, error: '无权限回滚' });
    }
    const operator = req.user?.username || 'unknown';

    await addAuditLog({
      action: 'rollback_apply',
      operator,
      operatorRole: req.user?.role || 'viewer',
      targetBackupId: rp.relatedRestoreBackupId,
      detail: { rollbackPointId: rp.id },
      result: 'success',
      message: `开始应用回滚点：${rp.name}`,
      ipAddress: getIp(req),
    });

    const result = await applyRollback({ rollbackId: req.params.id, operator });

    await addAuditLog({
      action: 'rollback_apply',
      operator,
      operatorRole: req.user?.role || 'viewer',
      targetBackupId: rp.relatedRestoreBackupId,
      detail: { rollbackPointId: rp.id, restoredConfigVersion: result.restoredConfigVersion },
      result: result.success ? 'success' : 'failed',
      message: result.message,
      ipAddress: getIp(req),
    });

    if (result.success) {
      res.json({ success: true, ...result });
    } else {
      res.status(400).json({ success: false, ...result });
    }
  } catch (e: unknown) {
    const err = e as Error;
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/rollback/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    await db.read();
    const rp = getRollbackPoint(req.params.id);
    if (!rp) {
      return res.status(404).json({ success: false, error: '回滚点不存在' });
    }
    const ok = await deleteRollbackPoint(req.params.id, req.user?.username || 'unknown');
    await addAuditLog({
      action: 'rollback_delete',
      operator: req.user?.username || 'unknown',
      operatorRole: req.user?.role || 'viewer',
      detail: { rollbackPointId: req.params.id },
      result: ok ? 'success' : 'failed',
      message: ok ? '回滚点已删除' : '回滚点删除失败',
      ipAddress: getIp(req),
    });
    res.json({ success: ok });
  } catch (e: unknown) {
    const err = e as Error;
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/audit/logs', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 200;
    const logs = getAuditLogs(limit);
    res.json({ success: true, logs });
  } catch (e: unknown) {
    const err = e as Error;
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/audit/backup/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const logs = getAuditLogsByBackup(req.params.id);
    res.json({ success: true, logs });
  } catch (e: unknown) {
    const err = e as Error;
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/permissions/check', async (req: AuthRequest, res: Response) => {
  const user = req.user || { username: 'anonymous', role: 'viewer' as const };
  res.json({
    success: true,
    user,
    permissions: {
      canView: canViewBackup(user),
      canCreate: canCreateBackup(user),
      canRestore: canRestoreBackup(user),
      canRollback: canRollback(user),
      canDelete: canDeleteBackup(user),
    },
  });
});

export default router;
