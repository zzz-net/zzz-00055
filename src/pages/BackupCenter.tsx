import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Database,
  Plus,
  Download,
  Upload,
  Trash2,
  Eye,
  RotateCcw,
  History,
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  SkipForward,
  Clock,
  FileJson,
  ChevronRight,
  User,
  ShieldAlert,
  RefreshCcw,
  X,
  Lock,
  Unlock,
  ArrowLeftRight,
  FileCheck,
  FileX2,
  ScrollText,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { api } from '../api/client';
import { useToast } from '../components/common/Toast';
import {
  BackupRecord,
  BackupPreviewResponse,
  BackupDiffItem,
  BackupConflictItem,
  RollbackPoint,
  AuditLog,
  UserRole,
} from '../../shared/types';
import Empty from '../components/Empty';

type TabKey = 'backups' | 'rollback' | 'audit';

interface PendingRestore {
  mode: 'backup' | 'upload';
  backupId?: string;
  backupName: string;
  preview: BackupPreviewResponse;
  tempFilePath?: string;
  registeredBackupId?: string;
}

const ROLE_OPTIONS: { value: UserRole; label: string; desc: string }[] = [
  { value: 'admin', label: '管理员', desc: '完整权限：创建/恢复/回滚/删除' },
  { value: 'operator', label: '操作员', desc: '仅可创建和下载备份' },
  { value: 'viewer', label: '查看者', desc: '只能查看和下载（如有）' },
];

const ACTION_LABELS: Record<string, { label: string; cls: string }> = {
  backup_create: { label: '创建备份', cls: 'bg-blue-900/50 text-blue-400 border-blue-700' },
  backup_download: { label: '下载备份', cls: 'bg-sky-900/50 text-sky-400 border-sky-700' },
  backup_delete: { label: '删除备份', cls: 'bg-red-900/50 text-red-400 border-red-700' },
  backup_upload: { label: '上传备份', cls: 'bg-indigo-900/50 text-indigo-400 border-indigo-700' },
  restore_preview: { label: '预览差异', cls: 'bg-cyan-900/50 text-cyan-400 border-cyan-700' },
  restore_start: { label: '启动恢复', cls: 'bg-amber-900/50 text-amber-400 border-amber-700' },
  restore_success: { label: '恢复成功', cls: 'bg-green-900/50 text-green-400 border-green-700' },
  restore_failed: { label: '恢复失败', cls: 'bg-red-900/50 text-red-400 border-red-700' },
  restore_interrupted: { label: '恢复中断', cls: 'bg-orange-900/50 text-orange-400 border-orange-700' },
  rollback_create: { label: '创建回滚', cls: 'bg-violet-900/50 text-violet-400 border-violet-700' },
  rollback_apply: { label: '应用回滚', cls: 'bg-purple-900/50 text-purple-400 border-purple-700' },
  rollback_delete: { label: '删除回滚', cls: 'bg-rose-900/50 text-rose-400 border-rose-700' },
};

const RESULT_LABELS: Record<string, { label: string; cls: string }> = {
  success: { label: '成功', cls: 'text-green-400' },
  failed: { label: '失败', cls: 'text-red-400' },
  skipped: { label: '跳过', cls: 'text-slate-400' },
  denied: { label: '拒绝', cls: 'text-orange-400' },
};

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  available: { label: '可用', cls: 'bg-green-900/40 text-green-400 border-green-700' },
  restoring: { label: '恢复中', cls: 'bg-amber-900/40 text-amber-400 border-amber-700' },
  restored: { label: '已恢复', cls: 'bg-blue-900/40 text-blue-400 border-blue-700' },
  rollback: { label: '已回滚', cls: 'bg-violet-900/40 text-violet-400 border-violet-700' },
  failed: { label: '失败', cls: 'bg-red-900/40 text-red-400 border-red-700' },
};

const RB_STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  available: { label: '可回滚', cls: 'bg-green-900/40 text-green-400 border-green-700' },
  applied: { label: '已应用', cls: 'bg-blue-900/40 text-blue-400 border-blue-700' },
  expired: { label: '已过期', cls: 'bg-slate-700/50 text-slate-400 border-slate-600' },
  deleted: { label: '已删除', cls: 'bg-red-900/40 text-red-400 border-red-700' },
};

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  if (hrs < 24) return `${hrs} 小时前`;
  if (days < 7) return `${days} 天前`;
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function BackupCenter() {
  const { addToast } = useToast();
  const {
    loadBackups, loadRollbackPoints, loadAuditLogs, loadPermissions, loadConfig, loadConfigHistory,
    backups, rollbackPoints, auditLogs, loading,
    backupPermissions, currentUser, setCurrentUserRole,
    addBackup, removeBackup,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<TabKey>('backups');
  const [creating, setCreating] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<PendingRestore | null>(null);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [selectedBackupDetail, setSelectedBackupDetail] = useState<BackupRecord | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedRole = localStorage.getItem('user_role') as UserRole | null;
    const savedName = localStorage.getItem('user_name');
    if (savedRole && ROLE_OPTIONS.some(r => r.value === savedRole)) {
      setCurrentUserRole(savedRole);
      if (savedName) {
        // username is set alongside role in store action, use a separate update
        useAppStore.setState(s => ({ currentUser: { ...s.currentUser, username: savedName } }));
      }
    }
    loadBackups();
    loadRollbackPoints();
    loadAuditLogs();
    loadPermissions();
  }, [loadBackups, loadRollbackPoints, loadAuditLogs, loadPermissions, setCurrentUserRole]);

  const handleCreateBackup = async () => {
    if (!backupPermissions.canCreate) {
      addToast('error', '当前角色无权限创建备份');
      return;
    }
    const name = prompt('请输入备份名称（留空则自动生成）：', `手动备份_${new Date().toLocaleDateString('zh-CN')}`);
    if (name === null) return;
    const desc = prompt('可选：为备份添加描述：', '');
    if (desc === null) return;
    setCreating(true);
    try {
      const res = await api.backup.create({ name: name || undefined, description: desc || undefined });
      if (res.success) {
        addBackup(res.backup);
        addToast('success', `备份创建成功：${res.backup.name}`);
      }
    } catch (e: any) {
      addToast('error', e.message || '创建备份失败');
    } finally {
      setCreating(false);
    }
  };

  const handleDownload = (b: BackupRecord) => {
    api.backup.download(b.id);
    addToast('info', `开始下载备份：${b.name}`);
  };

  const handleDelete = async (b: BackupRecord) => {
    if (!backupPermissions.canDelete) {
      addToast('error', '当前角色无权限删除备份');
      return;
    }
    if (!confirm(`确定删除备份 "${b.name}"？此操作不可撤销。`)) return;
    try {
      await api.backup.delete(b.id);
      removeBackup(b.id);
      addToast('success', '备份已删除');
    } catch (e: any) {
      addToast('error', e.message || '删除失败');
    }
  };

  const handleUploadClick = () => {
    if (!backupPermissions.canRestore) {
      addToast('error', '当前角色无权限上传和恢复备份，仅管理员可操作');
      return;
    }
    fileInputRef.current?.click();
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      addToast('info', '正在上传并校验备份文件...');
      const res = await api.backup.upload(file);
      if (!res.preview) {
        addToast('error', (res as any).error || '上传失败：未返回预览信息');
        return;
      }
      setPendingRestore({
        mode: 'upload',
        backupName: file.name,
        preview: res.preview,
        tempFilePath: res.tempFilePath,
        registeredBackupId: res.registeredBackupId,
      });
      setShowRestoreModal(true);
      if (res.success) {
        addToast('success', '上传并校验成功，请预览差异后确认恢复');
      } else {
        addToast('warning', '上传完成，但存在冲突或校验问题，请查看预览');
      }
      await loadBackups();
    } catch (e: any) {
      addToast('error', e.message || '上传失败');
    }
  };

  const handlePreviewBackup = async (b: BackupRecord) => {
    if (!backupPermissions.canRestore) {
      addToast('error', '当前角色无权限恢复备份');
      return;
    }
    try {
      addToast('info', '正在生成差异预览...');
      const res = await api.backup.preview(b.id);
      setPendingRestore({
        mode: 'backup',
        backupId: b.id,
        backupName: b.name,
        preview: res.preview,
      });
      setShowRestoreModal(true);
    } catch (e: any) {
      addToast('error', e.message || '预览失败');
    }
  };

  const handleConfirmRestore = async (force: boolean) => {
    if (!pendingRestore) return;
    setRestoring(true);
    try {
      let result;
      if (pendingRestore.mode === 'backup' && pendingRestore.backupId) {
        result = await api.backup.restore(pendingRestore.backupId, force);
      } else if (pendingRestore.mode === 'upload' && pendingRestore.tempFilePath) {
        result = await api.backup.restoreFromUpload(
          pendingRestore.tempFilePath,
          force,
          pendingRestore.registeredBackupId,
        );
      } else {
        throw new Error('无效的恢复模式');
      }
      if (result.success) {
        addToast('success', result.message);
        if (result.warnings) result.warnings.forEach(w => addToast('warning', w));
        setShowRestoreModal(false);
        setPendingRestore(null);
        await Promise.all([loadBackups(), loadRollbackPoints(), loadAuditLogs(), loadConfig(), loadConfigHistory()]);
      } else {
        addToast('error', result.message || '恢复失败');
        if (result.warnings) result.warnings.forEach(w => addToast('warning', w));
      }
    } catch (e: any) {
      addToast('error', e.message || '恢复失败');
    } finally {
      setRestoring(false);
    }
  };

  const handleApplyRollback = async (rp: RollbackPoint) => {
    if (!backupPermissions.canRollback) {
      addToast('error', '当前角色无权限回滚');
      return;
    }
    if (!confirm(`确定将系统回滚到 "${rp.name}"？此操作将覆盖当前所有数据。`)) return;
    try {
      addToast('info', '正在应用回滚点...');
      const result = await api.backup.rollbackApply(rp.id);
      if (result.success) {
        addToast('success', result.message);
        await Promise.all([loadBackups(), loadRollbackPoints(), loadAuditLogs(), loadConfig(), loadConfigHistory()]);
      } else {
        addToast('error', result.message || '回滚失败');
      }
    } catch (e: any) {
      addToast('error', e.message || '回滚失败');
    }
  };

  const handleRoleChange = (role: UserRole) => {
    setCurrentUserRole(role);
    addToast('info', `已切换到角色：${ROLE_OPTIONS.find(r => r.value === role)?.label}（仅用于前端演示权限）`);
    setTimeout(() => loadPermissions(), 50);
  };

  const activeRoleCfg = ROLE_OPTIONS.find(r => r.value === currentUser.role) || ROLE_OPTIONS[2];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold font-mono text-white flex items-center gap-3">
            <Database size={28} className="text-primary-400" />
            备份恢复中心
          </h1>
          <p className="text-slate-400 mt-1">创建、管理和恢复系统完整备份，支持差异预览和一键回滚</p>
        </div>
        <div className="flex items-center gap-3 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2">
          <Shield size={18} className="text-primary-400" />
          <div className="text-xs">
            <p className="text-slate-400">当前角色（演示用）</p>
            <select
              value={currentUser.role}
              onChange={e => handleRoleChange(e.target.value as UserRole)}
              className="mt-0.5 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-primary-500"
            >
              {ROLE_OPTIONS.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <div className="text-xs text-slate-500 border-l border-slate-700 pl-3 max-w-[220px]">
            {activeRoleCfg.desc}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg p-1 w-fit">
        {([
          { key: 'backups' as const, label: '备份清单', icon: Database },
          { key: 'rollback' as const, label: '回滚点', icon: RotateCcw },
          { key: 'audit' as const, label: '审计日志', icon: ScrollText },
        ]).map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded text-sm font-medium transition-colors ${
                active ? 'bg-primary-600 text-white' : 'text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'backups' && (
        <BackupsTab
          backups={backups}
          loading={loading.backups}
          permissions={backupPermissions}
          onCreate={handleCreateBackup}
          onUpload={handleUploadClick}
          onDownload={handleDownload}
          onPreview={handlePreviewBackup}
          onDelete={handleDelete}
          onViewDetail={(b) => { setSelectedBackupDetail(b); setShowDetail(true); }}
          creating={creating}
        />
      )}

      {activeTab === 'rollback' && (
        <RollbackTab
          points={rollbackPoints}
          loading={loading.rollbackPoints}
          canRollback={backupPermissions.canRollback}
          onApply={handleApplyRollback}
        />
      )}

      {activeTab === 'audit' && (
        <AuditTab logs={auditLogs} loading={loading.auditLogs} />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleUploadFile}
        className="hidden"
      />

      {showRestoreModal && pendingRestore && (
        <RestoreModal
          data={pendingRestore}
          restoring={restoring}
          onClose={() => { if (!restoring) { setShowRestoreModal(false); setPendingRestore(null); } }}
          onConfirm={handleConfirmRestore}
        />
      )}

      {showDetail && selectedBackupDetail && (
        <BackupDetailModal backup={selectedBackupDetail} onClose={() => setShowDetail(false)} />
      )}
    </div>
  );
}

interface BackupsTabProps {
  backups: BackupRecord[];
  loading?: boolean;
  permissions: { canCreate: boolean; canRestore: boolean; canDelete: boolean };
  onCreate: () => void;
  onUpload: () => void;
  onDownload: (b: BackupRecord) => void;
  onPreview: (b: BackupRecord) => void;
  onDelete: (b: BackupRecord) => void;
  onViewDetail: (b: BackupRecord) => void;
  creating: boolean;
}

function BackupsTab({
  backups, loading, permissions, onCreate, onUpload, onDownload, onPreview, onDelete, onViewDetail, creating,
}: BackupsTabProps) {
  const stats = useMemo(() => {
    const total = backups.length;
    const totalSize = backups.reduce((s, b) => s + b.fileSize, 0);
    const restored = backups.filter(b => b.status === 'restored').length;
    return { total, totalSize, restored };
  }, [backups]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="备份总数" value={stats.total.toString()} icon={<Database size={20} />} color="text-primary-400" />
        <StatCard label="总大小" value={formatSize(stats.totalSize)} icon={<FileJson size={20} />} color="text-sky-400" />
        <StatCard label="已恢复次数" value={stats.restored.toString()} icon={<RotateCcw size={20} />} color="text-violet-400" />
      </div>

      <div className="flex gap-3 flex-wrap">
        <button
          onClick={onCreate}
          disabled={creating || !permissions.canCreate}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded font-medium transition-colors"
        >
          {creating ? <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Plus size={16} />}
          创建完整备份
        </button>
        <button
          onClick={onUpload}
          disabled={!permissions.canRestore}
          className={`flex items-center gap-2 px-4 py-2 rounded font-medium transition-colors ${
            permissions.canRestore
              ? 'bg-slate-700 hover:bg-slate-600 text-white'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
          }`}
          title={permissions.canRestore ? '上传备份文件并恢复' : '仅管理员可上传恢复'}
        >
          <Upload size={16} />
          上传并恢复
          {!permissions.canRestore && <Lock size={14} className="ml-1 opacity-60" />}
        </button>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" />
          </div>
        ) : backups.length === 0 ? (
          <Empty
            icon={<Database size={48} className="text-slate-600" />}
            title="暂无备份"
            description="点击“创建完整备份”按钮生成系统快照，或上传已有的备份文件"
          />
        ) : (
          <div className="divide-y divide-slate-700">
            {backups.map(b => (
              <BackupRow
                key={b.id}
                backup={b}
                canRestore={permissions.canRestore}
                canDelete={permissions.canDelete}
                onDownload={() => onDownload(b)}
                onPreview={() => onPreview(b)}
                onDelete={() => onDelete(b)}
                onViewDetail={() => onViewDetail(b)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-400">{label}</p>
          <p className="text-2xl font-mono font-bold text-white mt-1">{value}</p>
        </div>
        <div className={`${color}`}>{icon}</div>
      </div>
    </div>
  );
}

function BackupRow({
  backup, canRestore, canDelete, onDownload, onPreview, onDelete, onViewDetail,
}: {
  backup: BackupRecord;
  canRestore: boolean;
  canDelete: boolean;
  onDownload: () => void;
  onPreview: () => void;
  onDelete: () => void;
  onViewDetail: () => void;
}) {
  const status = STATUS_LABELS[backup.status] || STATUS_LABELS.available;
  return (
    <div className="p-4 hover:bg-slate-750/30 transition-colors">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded bg-slate-900 border border-slate-700 flex items-center justify-center flex-shrink-0">
            <FileJson size={20} className="text-primary-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={onViewDetail}
                className="text-white font-semibold hover:text-primary-400 transition-colors text-left"
              >
                {backup.name}
              </button>
              <span className={`px-2 py-0.5 text-xs font-medium rounded border ${status.cls}`}>
                {status.label}
              </span>
              <span className="text-xs text-slate-500 font-mono">v{backup.configVersion}</span>
            </div>
            {backup.description && (
              <p className="text-xs text-slate-400 mt-1 truncate">{backup.description}</p>
            )}
            <div className="flex items-center gap-3 mt-2 text-xs text-slate-500 flex-wrap">
              <span className="flex items-center gap-1"><User size={12} /> {backup.createdBy}</span>
              <span className="flex items-center gap-1"><Clock size={12} /> {formatTime(backup.createdAt)}</span>
              <span className="flex items-center gap-1"><FileJson size={12} /> {formatSize(backup.fileSize)}</span>
              <span className="flex items-center gap-1">
                <Database size={12} />
                {Object.entries(backup.recordCounts).filter(([, v]) => v > 0).map(([k, v]) => `${k}:${v}`).join(' · ') || '空'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onViewDetail}
            className="p-2 hover:bg-slate-700 rounded text-slate-300 hover:text-white transition-colors"
            title="查看详情"
          >
            <Eye size={16} />
          </button>
          <button
            onClick={onDownload}
            className="p-2 hover:bg-slate-700 rounded text-slate-300 hover:text-white transition-colors"
            title="下载备份"
          >
            <Download size={16} />
          </button>
          <button
            onClick={onPreview}
            disabled={!canRestore}
            className={`p-2 rounded transition-colors ${
              canRestore ? 'hover:bg-slate-700 text-slate-300 hover:text-white' : 'opacity-30 cursor-not-allowed text-slate-500'
            }`}
            title={canRestore ? '预览差异并恢复' : '仅管理员可恢复'}
          >
            <ArrowLeftRight size={16} />
          </button>
          <button
            onClick={onDelete}
            disabled={!canDelete}
            className={`p-2 rounded transition-colors ${
              canDelete ? 'hover:bg-red-900/40 text-slate-300 hover:text-red-400' : 'opacity-30 cursor-not-allowed text-slate-500'
            }`}
            title={canDelete ? '删除备份' : '仅管理员可删除'}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

interface RollbackTabProps {
  points: RollbackPoint[];
  loading?: boolean;
  canRollback: boolean;
  onApply: (rp: RollbackPoint) => void;
}

function RollbackTab({ points, loading, canRollback, onApply }: RollbackTabProps) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
      <div className="p-4 bg-slate-900/50 border-b border-slate-700 flex items-center gap-2">
        <Shield size={18} className="text-violet-400" />
        <div>
          <p className="text-white font-semibold">回滚点列表</p>
          <p className="text-xs text-slate-400">每次成功恢复后自动生成回滚点，24小时内可回滚到恢复前状态</p>
        </div>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin w-6 h-6 border-4 border-violet-500 border-t-transparent rounded-full" />
        </div>
      ) : points.length === 0 ? (
        <Empty
          icon={<RotateCcw size={48} className="text-slate-600" />}
          title="暂无回滚点"
          description="执行一次成功的备份恢复后，将自动生成可回滚的回滚点"
        />
      ) : (
        <div className="divide-y divide-slate-700">
          {points.map(rp => {
            const st = RB_STATUS_LABELS[rp.status] || RB_STATUS_LABELS.available;
            const expiresIn = Math.max(0, new Date(rp.expiresAt).getTime() - Date.now());
            const hours = Math.floor(expiresIn / 3600000);
            const mins = Math.floor((expiresIn % 3600000) / 60000);
            return (
              <div key={rp.id} className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded bg-violet-900/30 border border-violet-700 flex items-center justify-center flex-shrink-0">
                    <RotateCcw size={20} className="text-violet-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-white font-semibold">{rp.name}</p>
                      <span className={`px-2 py-0.5 text-xs font-medium rounded border ${st.cls}`}>
                        {st.label}
                      </span>
                      <span className="text-xs text-slate-500 font-mono">
                        恢复前配置 v{rp.preRestoreSnapshot.configVersion}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-500 flex-wrap">
                      <span className="flex items-center gap-1"><User size={12} /> {rp.createdBy}</span>
                      <span className="flex items-center gap-1"><Clock size={12} /> {formatTime(rp.createdAt)}</span>
                      <span className="flex items-center gap-1"><FileJson size={12} /> {formatSize(rp.fileSize)}</span>
                      {rp.status === 'available' && (
                        <span className="flex items-center gap-1 text-amber-400">
                          <Clock size={12} /> 剩余 {hours > 0 ? `${hours}小时` : ''}{mins}分过期
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => onApply(rp)}
                  disabled={rp.status !== 'available' || !canRollback}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-1.5 ${
                    rp.status === 'available' && canRollback
                      ? 'bg-violet-600 hover:bg-violet-500 text-white'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                  }`}
                >
                  <RefreshCcw size={14} />
                  {canRollback ? (rp.status === 'available' ? '立即回滚' : st.label) : '无权限'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AuditTab({ logs, loading }: { logs: AuditLog[]; loading?: boolean }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
      <div className="p-4 bg-slate-900/50 border-b border-slate-700 flex items-center gap-2">
        <ScrollText size={18} className="text-amber-400" />
        <div>
          <p className="text-white font-semibold">操作审计日志</p>
          <p className="text-xs text-slate-400">记录备份和恢复相关的所有操作及其结果</p>
        </div>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin w-6 h-6 border-4 border-amber-500 border-t-transparent rounded-full" />
        </div>
      ) : logs.length === 0 ? (
        <Empty
          icon={<History size={48} className="text-slate-600" />}
          title="暂无操作记录"
          description="所有与备份、恢复、回滚相关的操作都会在此记录"
        />
      ) : (
        <div className="divide-y divide-slate-700 max-h-[600px] overflow-y-auto">
          {logs.map(log => {
            const a = ACTION_LABELS[log.action] || { label: log.action, cls: 'bg-slate-700 text-slate-300 border-slate-600' };
            const r = RESULT_LABELS[log.result] || RESULT_LABELS.success;
            return (
              <div key={log.id} className="p-4 flex items-start gap-3">
                <div className={`w-10 h-10 rounded border flex items-center justify-center flex-shrink-0 ${a.cls}`}>
                  <History size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 text-xs font-medium rounded border ${a.cls}`}>{a.label}</span>
                    <span className={`text-xs font-medium ${r.cls}`}>● {r.label}</span>
                    {log.targetBackupName && (
                      <span className="text-xs text-primary-400 font-mono truncate max-w-[200px]">
                        {log.targetBackupName}
                      </span>
                    )}
                  </div>
                  {log.message && <p className="text-sm text-slate-300 mt-1">{log.message}</p>}
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 flex-wrap">
                    <span className="flex items-center gap-1"><User size={12} /> {log.operator} ({log.operatorRole})</span>
                    <span className="flex items-center gap-1"><Clock size={12} /> {formatTime(log.operatedAt)}</span>
                    {log.ipAddress && <span>IP: {log.ipAddress}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface RestoreModalProps {
  data: PendingRestore;
  restoring: boolean;
  onClose: () => void;
  onConfirm: (force: boolean) => void;
}

function RestoreModal({ data, restoring, onClose, onConfirm }: RestoreModalProps) {
  const { preview, backupName, mode } = data;
  const { validated, diff, canRestore, reason, backupMeta } = preview;
  const errors = validated.conflicts?.filter(c => c.severity === 'error') || [];
  const warnings = validated.conflicts?.filter(c => c.severity !== 'error') || [];
  const needForce = errors.length > 0 && errors.every(e => e.canOverride);

  const changedDiffs = diff.filter(d => d.changed);
  const unchangedDiffs = diff.filter(d => !d.changed);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-600 rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl">
        <div className="p-5 border-b border-slate-700 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
              canRestore ? 'bg-green-900/50' : 'bg-red-900/50'
            }`}>
              {canRestore
                ? <FileCheck size={24} className="text-green-400" />
                : <FileX2 size={24} className="text-red-400" />}
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">
                {mode === 'backup' ? '恢复现有备份' : '恢复上传的备份'}
              </h3>
              <p className="text-sm text-slate-400 mt-1">
                <span className="font-mono text-primary-400">{backupName}</span>
                <span className="mx-2">·</span>
                配置版本 <span className="font-mono">v{backupMeta.configVersion}</span>
                <span className="mx-2">·</span>
                {new Date(backupMeta.createdAt).toLocaleString('zh-CN')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={restoring}
            className="p-2 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-6">
          <div className={`p-4 rounded-lg border ${
            canRestore
              ? 'bg-green-950/30 border-green-800/50'
              : 'bg-red-950/30 border-red-800/50'
          }`}>
            <div className="flex items-start gap-3">
              {canRestore
                ? <CheckCircle2 size={22} className="text-green-400 flex-shrink-0 mt-0.5" />
                : <XCircle size={22} className="text-red-400 flex-shrink-0 mt-0.5" />}
              <div>
                <p className="font-semibold text-white">{validated.summary}</p>
                {!canRestore && reason && <p className="text-sm text-red-300 mt-1">原因：{reason}</p>}
                {validated.warnings?.length ? (
                  <ul className="mt-2 space-y-1">
                    {validated.warnings.map((w, i) => (
                      <li key={i} className="text-xs text-amber-300 flex items-start gap-1">
                        <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" /> {w}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          </div>

          {errors.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-red-400 mb-2 flex items-center gap-1.5">
                <AlertTriangle size={16} /> 严重冲突（{errors.length}）
              </h4>
              <div className="space-y-2">
                {errors.map((c, i) => (
                  <ConflictItem key={i} item={c} />
                ))}
              </div>
            </div>
          )}

          {warnings.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-amber-400 mb-2 flex items-center gap-1.5">
                <AlertTriangle size={16} /> 注意事项（{warnings.length}）
              </h4>
              <div className="space-y-2">
                {warnings.map((c, i) => (
                  <ConflictItem key={i} item={c} />
                ))}
              </div>
            </div>
          )}

          <div>
            <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-1.5">
              <ArrowLeftRight size={16} className="text-primary-400" /> 差异预览（共 {diff.length} 项，
              <span className="text-primary-400 mx-1">{changedDiffs.length} 项有变化</span>）
            </h4>
            <div className="bg-slate-900 rounded-lg border border-slate-700 divide-y divide-slate-700">
              {changedDiffs.map((d, i) => (
                <DiffRow key={`c${i}`} item={d} />
              ))}
              {unchangedDiffs.length > 0 && (
                <details className="group">
                  <summary className="cursor-pointer px-4 py-2 text-xs text-slate-500 hover:text-slate-300 user-select-none">
                    ▸ 显示 {unchangedDiffs.length} 项未变化内容
                  </summary>
                  <div className="border-t border-slate-700/50">
                    {unchangedDiffs.map((d, i) => (
                      <DiffRow key={`u${i}`} item={d} />
                    ))}
                  </div>
                </details>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <MetaCell label="版本比较" value={
              validated.version?.isOlder ? '⬇ 旧于当前' :
                validated.version?.isNewer ? '⬆ 新于当前' : '✓ 版本相同'
            } cls={
              validated.version?.isOlder ? 'text-red-400' :
                validated.version?.isNewer ? 'text-green-400' : 'text-slate-300'
            } />
            <MetaCell label="结构校验" value={validated.structure?.valid ? '通过' : '异常'}
              cls={validated.structure?.valid ? 'text-green-400' : 'text-red-400'} />
            <MetaCell label="文件格式" value={validated.format?.valid ? '有效' : '损坏'}
              cls={validated.format?.valid ? 'text-green-400' : 'text-red-400'} />
            <MetaCell label="记录数量" value={
              Object.values(backupMeta.recordCounts).reduce((a, b) => a + b, 0).toString() + ' 条'
            } />
          </div>
        </div>

        <div className="p-5 border-t border-slate-700 bg-slate-900/30 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-slate-400">
            {canRestore
              ? (needForce
                ? <span className="text-amber-300 flex items-center gap-1"><ShieldAlert size={14} /> 存在严重冲突，需确认强制覆盖才能继续</span>
                : <span className="text-green-300 flex items-center gap-1"><CheckCircle2 size={14} /> 校验通过，可直接恢复</span>)
              : <span className="text-red-300 flex items-center gap-1"><Lock size={14} /> 无法恢复此备份，请解决阻塞问题或使用其他备份</span>}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={restoring}
              className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded font-medium transition-colors"
            >
              取消
            </button>
            {!canRestore ? null : needForce ? (
              <>
                <button
                  onClick={() => onConfirm(false)}
                  disabled={restoring}
                  className="px-4 py-2.5 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white rounded font-medium transition-colors flex items-center gap-2"
                >
                  <SkipForward size={16} /> 取消恢复
                </button>
                <button
                  onClick={() => onConfirm(true)}
                  disabled={restoring}
                  className="px-4 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded font-medium transition-colors flex items-center gap-2"
                >
                  {restoring ? (
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  ) : <Unlock size={16} />}
                  强制覆盖并恢复
                </button>
              </>
            ) : (
              <button
                onClick={() => onConfirm(false)}
                disabled={restoring}
                className="px-5 py-2.5 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white rounded font-medium transition-colors flex items-center gap-2"
              >
                {restoring ? (
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                ) : <RotateCcw size={16} />}
                确认恢复
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ConflictItem({ item }: { item: BackupConflictItem }) {
  const colorCls =
    item.severity === 'error' ? 'bg-red-950/40 border-red-800/50 text-red-300' :
      item.severity === 'warning' ? 'bg-amber-950/40 border-amber-800/50 text-amber-300' :
        'bg-slate-900/60 border-slate-700 text-slate-300';
  return (
    <div className={`p-3 rounded-lg border ${colorCls}`}>
      <div className="flex items-start gap-2">
        {item.severity === 'error'
          ? <XCircle size={16} className="mt-0.5 flex-shrink-0 text-red-400" />
          : item.severity === 'warning'
            ? <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-amber-400" />
            : <ChevronRight size={16} className="mt-0.5 flex-shrink-0 text-slate-400" />}
        <div className="text-sm">
          <p className="font-medium">{item.message}</p>
          {item.suggestion && <p className="text-xs mt-1 opacity-80">建议：{item.suggestion}</p>}
          {item.backupValue !== undefined && item.currentValue !== undefined && (
            <div className="mt-1.5 text-xs font-mono bg-black/30 rounded p-1.5 grid grid-cols-2 gap-2">
              <div><span className="text-slate-500">备份：</span>{typeof item.backupValue === 'object'
                ? JSON.stringify(item.backupValue).slice(0, 60)
                : String(item.backupValue)}</div>
              <div><span className="text-slate-500">当前：</span>{typeof item.currentValue === 'object'
                ? JSON.stringify(item.currentValue).slice(0, 60)
                : String(item.currentValue)}</div>
            </div>
          )}
          <div className="mt-1 flex items-center gap-2 text-xs">
            {item.canOverride
              ? <span className="text-amber-200">可通过"强制覆盖"继续</span>
              : <span className="text-red-300">阻塞性问题，无法强制覆盖</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function DiffRow({ item }: { item: BackupDiffItem }) {
  const formatVal = (v: unknown) => {
    if (v === undefined || v === null) return '—';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  };
  return (
    <div className={`px-4 py-3 text-sm grid grid-cols-12 gap-2 ${item.changed ? 'bg-amber-950/10' : ''}`}>
      <div className="col-span-3 flex items-center gap-2">
        {item.changed && <ArrowLeftRight size={12} className="text-amber-400 flex-shrink-0" />}
        <span className={`font-mono text-xs ${item.changed ? 'text-amber-300' : 'text-slate-500'}`}>
          [{item.section}]
        </span>
        <span className={item.changed ? 'text-white' : 'text-slate-400'}>{item.field}</span>
      </div>
      <div className={`col-span-4 font-mono text-xs truncate px-2 py-1 rounded ${
        item.changed ? 'bg-slate-800 text-red-300' : 'text-slate-500'
      }`}>
        {formatVal(item.currentValue)}
      </div>
      <div className="col-span-1 flex items-center justify-center text-slate-600">
        <ChevronRight size={14} />
      </div>
      <div className={`col-span-4 font-mono text-xs truncate px-2 py-1 rounded ${
        item.changed ? 'bg-slate-800 text-green-300' : 'text-slate-500'
      }`}>
        {formatVal(item.backupValue)}
      </div>
    </div>
  );
}

function MetaCell({ label, value, cls = 'text-slate-300' }: { label: string; value: string; cls?: string }) {
  return (
    <div className="bg-slate-900 rounded border border-slate-700 p-2.5">
      <p className="text-slate-500 mb-1">{label}</p>
      <p className={`font-semibold font-mono ${cls}`}>{value}</p>
    </div>
  );
}

function BackupDetailModal({ backup, onClose }: { backup: BackupRecord; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-slate-800 border border-slate-600 rounded-lg max-w-xl w-full shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 border-b border-slate-700 flex items-center justify-between">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <FileJson size={22} className="text-primary-400" />
            {backup.name}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>
        <div className="p-5 space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <DetailItem label="备份 ID" value={backup.id} mono />
            <DetailItem label="配置版本" value={`v${backup.configVersion}`} mono />
            <DetailItem label="创建人" value={backup.createdBy} />
            <DetailItem label="创建时间" value={new Date(backup.createdAt).toLocaleString('zh-CN')} />
            <DetailItem label="文件大小" value={formatSize(backup.fileSize)} />
            <DetailItem label="数据版本" value={backup.dataVersion.toString()} mono />
            <DetailItem label="状态" value={(STATUS_LABELS[backup.status]?.label) || backup.status} />
            {backup.restoredAt && (
              <DetailItem label="最近恢复" value={`${backup.restoredBy || '未知'} · ${formatTime(backup.restoredAt)}`} />
            )}
          </div>
          {backup.description && (
            <div>
              <p className="text-xs text-slate-500 mb-1">描述</p>
              <p className="text-slate-300 bg-slate-900 rounded p-2">{backup.description}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-slate-500 mb-2">记录统计</p>
            <div className="grid grid-cols-4 gap-2 text-xs">
              {Object.entries(backup.recordCounts).map(([k, v]) => (
                <div key={k} className="bg-slate-900 rounded border border-slate-700 p-2">
                  <p className="text-slate-500">{k}</p>
                  <p className="text-white font-mono text-base font-semibold">{v}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">校验和 (SHA256)</p>
            <p className="text-slate-400 font-mono text-xs bg-slate-900 rounded p-2 break-all">
              {backup.checksum}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-0.5">{label}</p>
      <p className={`text-white ${mono ? 'font-mono text-xs' : ''} truncate`}>{value}</p>
    </div>
  );
}
