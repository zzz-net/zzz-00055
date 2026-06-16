import { useState, useEffect, useRef } from 'react';
import { Settings, Ruler, Palette, RotateCcw, Save, History, ArrowRight, AlertTriangle, XCircle, SkipForward, RefreshCcw, Zap, HardDrive, ArrowUpRight, Download, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { api } from '../api/client';
import { useToast } from '../components/common/Toast';
import { DefectSeverity, LevelMappingItem, SEVERITY_ORDER, ConfigHistory, Config as ConfigType } from '../../shared/types';
import Empty from '../components/Empty';

const SEVERITY_OPTIONS: { value: DefectSeverity; label: string }[] = [
  { value: 'critical', label: 'Critical (严重)' },
  { value: 'major', label: 'Major (较重)' },
  { value: 'medium', label: 'Medium (中等)' },
  { value: 'minor', label: 'Minor (轻微)' },
];

const COLOR_PRESETS = [
  { value: '#ef4444', label: '红色' },
  { value: '#f59e0b', label: '橙色' },
  { value: '#10b981', label: '绿色' },
  { value: '#6366f1', label: '蓝色' },
  { value: '#8b5cf6', label: '紫色' },
  { value: '#ec4899', label: '粉色' },
];

export function Config() {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const { config, configHistory, loadConfig, loadConfigHistory, loading, updateConfig: updateStoreConfig } = useAppStore();
  const [distanceThreshold, setDistanceThreshold] = useState<number>(5.0);
  const [levelMapping, setLevelMapping] = useState<LevelMappingItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [operator, setOperator] = useState('admin');
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [conflictData, setConflictData] = useState<{ message?: string; currentVersion?: string; currentConfig?: ConfigType } | null>(null);
  const [conflictRetryFn, setConflictRetryFn] = useState<((force: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    loadConfig();
    loadConfigHistory();
  }, [loadConfig, loadConfigHistory]);

  useEffect(() => {
    if (config) {
      setDistanceThreshold(config.distanceThreshold);
      setLevelMapping(config.levelMapping);
    }
  }, [config]);

  const handleMappingChange = (index: number, field: keyof LevelMappingItem, value: string) => {
    setLevelMapping(prev => {
      const newMapping = [...prev];
      newMapping[index] = { ...newMapping[index], [field]: value };
      return newMapping;
    });
  };

  const handleConflict = (errorData: { message?: string; currentVersion?: string; currentConfig?: ConfigType }, retryFn: (force: boolean) => Promise<void>) => {
    setConflictData(errorData);
    setConflictRetryFn(() => retryFn);
    setShowConflictModal(true);
  };

  const resolveConflict = async (force: boolean) => {
    setShowConflictModal(false);
    if (force && conflictRetryFn) {
      await conflictRetryFn(true);
    } else {
      loadConfig();
      loadConfigHistory();
      addToast('info', '已刷新为最新配置');
    }
    setConflictData(null);
    setConflictRetryFn(null);
  };

  const handleSave = async (force = false) => {
    if (distanceThreshold <= 0) {
      addToast('error', '距离阈值必须大于0');
      return;
    }
    if (levelMapping.length === 0) {
      addToast('error', '等级映射不能为空');
      return;
    }
    
    setSaving(true);
    try {
      const result = await api.config.update({
        distanceThreshold,
        levelMapping,
        updatedBy: operator || 'admin',
        expectedVersion: config?.version,
        force,
      });
      if (result.success) {
        updateStoreConfig(result.config);
        if (result.skipped) {
          addToast('info', result.message || '配置未变化，已跳过');
        } else {
          addToast('success', `配置已保存，当前版本 v${result.config.version}`);
        }
        await loadConfigHistory();
      }
    } catch (e: unknown) {
      const err = e as { status?: number; data?: { message?: string; currentVersion?: string; currentConfig?: ConfigType }; message?: string };
      if (err.status === 409 && err.data) {
        handleConflict(err.data, (f) => handleSave(f));
      } else {
        addToast('error', err.message || '保存失败');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async (force = false) => {
    if (!force && !confirm('确定要重置为默认配置吗？')) return;
    setSaving(true);
    try {
      const result = await api.config.reset(operator || 'admin', config?.version, force);
      if (result.success) {
        updateStoreConfig(result.config);
        setDistanceThreshold(result.config.distanceThreshold);
        setLevelMapping(result.config.levelMapping);
        if (result.skipped) {
          addToast('info', result.message || '已经是默认配置');
        } else {
          addToast('success', `已重置为默认配置，当前版本 v${result.config.version}`);
        }
        await loadConfigHistory();
      }
    } catch (e: unknown) {
      const err = e as { status?: number; data?: { message?: string; currentVersion?: string; currentConfig?: ConfigType }; message?: string };
      if (err.status === 409 && err.data) {
        handleConflict(err.data, (f) => handleReset(f));
      } else {
        addToast('error', err.message || '重置失败');
      }
    } finally {
      setSaving(false);
    }
  };

  const sortedMapping = [...levelMapping].sort(
    (a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]
  );

  if (loading.config && !config) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-mono text-white">规则配置</h1>
          <p className="text-slate-400 mt-1">配置缺陷合并规则和等级映射</p>
        </div>
        {config && (
          <div className="text-sm text-slate-400">
            当前版本: <span className="text-primary-400 font-mono">v{config.version}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Ruler size={20} className="text-primary-400" />
            距离阈值配置
          </h2>
          
          <div className="mb-6">
            <label className="block text-sm text-slate-400 mb-2">
              缺陷合并距离阈值 (米)
            </label>
            <input
              type="number"
              step="0.1"
              min="0.1"
              value={distanceThreshold}
              onChange={(e) => setDistanceThreshold(Number(e.target.value))}
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded text-white text-xl font-mono focus:outline-none focus:border-primary-500"
            />
            <p className="text-xs text-slate-500 mt-2">
              当两个缺陷之间的距离小于等于此值时，将被自动合并为同一事件
            </p>
          </div>

          <div className="p-4 bg-slate-900 rounded-lg">
            <h4 className="text-sm text-slate-300 mb-2">配置效果预览</h4>
            <div className="flex items-center gap-4">
              <div className="relative w-32 h-32 bg-slate-950 rounded">
                <div className="absolute top-4 left-4 w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                <div 
                  className="absolute top-4 left-4 w-3 h-3 rounded-full bg-red-500 opacity-30"
                  style={{
                    width: `${distanceThreshold * 10}px`,
                    height: `${distanceThreshold * 10}px`,
                    transform: 'translate(-50%, -50%)',
                    borderRadius: '50%',
                  }}
                />
                <div 
                  className="absolute top-4 left-4 w-0.5 h-0.5 bg-blue-400"
                  style={{
                    transform: `translate(${distanceThreshold * 5}px, ${distanceThreshold * 3}px)`,
                  }}
                />
                <div 
                  className="absolute top-4 left-4 w-2 h-2 rounded-full bg-amber-500"
                  style={{
                    transform: `translate(${distanceThreshold * 5}px, ${distanceThreshold * 3}px)`,
                  }}
                />
              </div>
              <div className="text-xs text-slate-400 space-y-1">
                <p>• 阈值: {distanceThreshold}m</p>
                <p>• 圆内缺陷将被合并</p>
                <p>• 蓝色点: 在阈值内，会合并</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Palette size={20} className="text-primary-400" />
            等级映射配置
          </h2>
          
          <p className="text-sm text-slate-400 mb-4">
            将缺陷严重等级映射为显示级别和颜色
          </p>

          <div className="space-y-4">
            {sortedMapping.map((item, index) => (
              <div key={item.severity} className="p-4 bg-slate-900 rounded-lg">
                <div className="flex items-center gap-4 mb-3">
                  <div
                    className="w-6 h-6 rounded flex-shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <select
                    value={item.severity}
                    onChange={(e) => handleMappingChange(index, 'severity', e.target.value as DefectSeverity)}
                    className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm focus:outline-none focus:border-primary-500"
                  >
                    {SEVERITY_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">显示级别</label>
                    <input
                      type="text"
                      value={item.level}
                      onChange={(e) => handleMappingChange(index, 'level', e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm focus:outline-none focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">显示颜色</label>
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={item.color}
                        onChange={(e) => handleMappingChange(index, 'color', e.target.value)}
                        className="flex-1 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm font-mono focus:outline-none focus:border-primary-500"
                      />
                      <div className="flex gap-0.5">
                        {COLOR_PRESETS.map(color => (
                          <button
                            key={color.value}
                            onClick={() => handleMappingChange(index, 'color', color.value)}
                            className="w-5 h-5 rounded border-2 border-slate-700 hover:scale-110 transition-transform"
                            style={{ backgroundColor: color.value }}
                            title={color.label}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Settings size={20} className="text-primary-400" />
            保存配置
          </h2>
        </div>

        <div className="flex flex-wrap gap-4 items-center">
          <div>
            <label className="block text-sm text-slate-400 mb-1">操作人</label>
            <input
              type="text"
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              className="px-3 py-2 bg-slate-900 border border-slate-700 rounded text-white focus:outline-none focus:border-primary-500"
            />
          </div>

          <div className="flex gap-3 ml-auto">
            <button
              onClick={() => navigate('/backup')}
              className="flex items-center gap-2 px-4 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded font-medium transition-colors"
              title="进入完整的备份恢复中心（创建、导入、恢复、回滚等）"
            >
              <HardDrive size={16} />
              备份恢复中心
              <ArrowUpRight size={14} />
            </button>
            <button
              onClick={() => handleReset(false)}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded font-medium transition-colors"
            >
              <RotateCcw size={16} />
              重置默认
            </button>
            <button
              onClick={() => handleSave(false)}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded font-medium transition-colors"
            >
              {saving ? (
                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <Save size={16} />
              )}
              保存配置
            </button>
          </div>
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <History size={20} className="text-primary-400" />
            配置历史记录
          </h2>
          <div className="flex items-center gap-3">
            <button
              onClick={() => api.config.historyCSV()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded font-medium transition-colors"
            >
              <Download size={14} />
              导出CSV
            </button>
            <span className="text-sm text-slate-400">
              最近 {configHistory.length} 条变更
            </span>
          </div>
        </div>

        {loading.configHistory ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-6 h-6 border-4 border-primary-500 border-t-transparent rounded-full" />
          </div>
        ) : configHistory.length === 0 ? (
          <Empty
            icon={<History size={48} className="text-slate-600" />}
            title="暂无历史记录"
            description="保存或重置配置后，变更记录将显示在这里"
          />
        ) : (
          <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
            {configHistory.map((item) => (
              <HistoryItem key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>

      {showConflictModal && conflictData && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-600 rounded-lg max-w-lg w-full p-6 shadow-2xl">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-full bg-red-900/50 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={24} className="text-red-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-white mb-2">配置版本冲突</h3>
                <p className="text-slate-300 text-sm leading-relaxed">
                  {conflictData.message || '配置已被他人修改'}
                </p>
              </div>
            </div>

            <div className="bg-slate-900 rounded-lg p-4 mb-6 border border-slate-700">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-400 text-xs mb-1">您的版本</p>
                  <p className="text-slate-300 font-mono">v{config?.version}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs mb-1">最新版本</p>
                  <p className="text-primary-400 font-mono font-semibold">v{conflictData.currentVersion}</p>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => resolveConflict(false)}
                className="flex-1 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded font-medium transition-colors"
              >
                取消并刷新
              </button>
              <button
                onClick={() => resolveConflict(true)}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Zap size={16} />
                强制覆盖
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const ACTION_CONFIG: Record<string, { label: string; class: string; icon: React.ReactNode }> = {
  save: { label: '保存', class: 'bg-green-900/50 text-green-400 border-green-700', icon: <Save size={12} /> },
  reset: { label: '重置', class: 'bg-amber-900/50 text-amber-400 border-amber-700', icon: <RotateCcw size={12} /> },
  force_save: { label: '强制覆盖', class: 'bg-red-900/50 text-red-400 border-red-700', icon: <Zap size={12} /> },
  force_reset: { label: '强制重置', class: 'bg-red-900/50 text-red-400 border-red-700', icon: <RefreshCcw size={12} /> },
  conflict_failed: { label: '冲突失败', class: 'bg-red-900/50 text-red-400 border-red-700', icon: <XCircle size={12} /> },
  skip_duplicate: { label: '跳过重复', class: 'bg-slate-700/50 text-slate-400 border-slate-600', icon: <SkipForward size={12} /> },
  import: { label: '数据导入', class: 'bg-blue-900/50 text-blue-400 border-blue-700', icon: <Upload size={12} /> },
};

const RESULT_CONFIG: Record<string, { label: string; class: string }> = {
  success: { label: '成功', class: 'text-green-400' },
  failed: { label: '失败', class: 'text-red-400' },
  skipped: { label: '跳过', class: 'text-slate-400' },
};

function HistoryItem({ item }: { item: ConfigHistory }) {
  const actionCfg = ACTION_CONFIG[item.action] || ACTION_CONFIG.save;
  const resultCfg = RESULT_CONFIG[item.result] || RESULT_CONFIG.success;

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins} 分钟前`;
    if (diffHours < 24) return `${diffHours} 小时前`;
    if (diffDays < 7) return `${diffDays} 天前`;
    
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getLevelMapSummary = (mapping: typeof item.levelMapping.before) => {
    return mapping
      .sort((a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity])
      .map(m => `${m.severity}:${m.level}`)
      .join(', ');
  };

  return (
    <div className="bg-slate-900 rounded-lg p-4 border border-slate-700 hover:border-slate-600 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className={`px-2 py-1 text-xs font-medium rounded border flex items-center gap-1 ${actionCfg.class}`}>
            {actionCfg.icon}
            {actionCfg.label}
          </span>
          <span className="text-primary-400 font-mono text-sm">v{item.version}</span>
          <span className={`text-xs font-medium ${resultCfg.class}`}>
            {resultCfg.label}
          </span>
        </div>
        <div className="text-right">
          <p className="text-sm text-white">{item.operator}</p>
          <p className="text-xs text-slate-500">{formatTime(item.operatedAt)}</p>
        </div>
      </div>

      {item.message && (
        <div className="mb-2 text-xs text-slate-400">
          {item.message}
        </div>
      )}

      {item.conflictNote && (
        <div className="flex items-start gap-2 mb-3 p-2 bg-red-950/40 border border-red-800/50 rounded text-xs">
          <AlertTriangle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
          <span className="text-red-300">{item.conflictNote}</span>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-400 flex-shrink-0 w-20">距离阈值:</span>
          <div className="flex items-center gap-2 font-mono">
            <span className="text-slate-300">{item.distanceThreshold.before}m</span>
            <ArrowRight size={14} className="text-slate-500" />
            <span className={
              item.distanceThreshold.before !== item.distanceThreshold.after
                ? 'text-primary-400 font-semibold'
                : 'text-slate-300'
            }>
              {item.distanceThreshold.after}m
            </span>
          </div>
        </div>

        <div className="text-sm">
          <div className="flex items-start gap-2">
            <span className="text-slate-400 flex-shrink-0 w-20 pt-0.5">等级映射:</span>
            <div className="flex-1 space-y-1">
              <div className="text-slate-500 text-xs">变更前: {getLevelMapSummary(item.levelMapping.before)}</div>
              <div className="text-slate-300 text-xs">变更后: {getLevelMapSummary(item.levelMapping.after)}</div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-2">
          {item.levelMapping.after.map((m) => (
            <div
              key={m.severity}
              className="flex items-center gap-1.5 text-xs"
            >
              <div
                className="w-3 h-3 rounded flex-shrink-0"
                style={{ backgroundColor: m.color }}
              />
              <span className="text-slate-400">{m.severity}</span>
              <span className="text-slate-300">→</span>
              <span className="text-white font-medium">{m.level}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
