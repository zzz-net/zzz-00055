import { useState, useEffect } from 'react';
import { Settings, Ruler, Palette, RotateCcw, Save, History, ArrowRight } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { api } from '../api/client';
import { useToast } from '../components/common/Toast';
import { DefectSeverity, LevelMappingItem, SEVERITY_ORDER, ConfigHistory } from '../../shared/types';
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
  const { config, configHistory, loadConfig, loadConfigHistory, loading, updateConfig: updateStoreConfig } = useAppStore();
  const [distanceThreshold, setDistanceThreshold] = useState<number>(5.0);
  const [levelMapping, setLevelMapping] = useState<LevelMappingItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [operator, setOperator] = useState('admin');

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

  const handleSave = async () => {
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
    } catch (e: any) {
      addToast('error', e.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('确定要重置为默认配置吗？')) return;
    setSaving(true);
    try {
      const result = await api.config.reset();
      if (result.success) {
        updateStoreConfig(result.config);
        if (result.skipped) {
          addToast('info', result.message || '已经是默认配置');
        } else {
          addToast('success', '已重置为默认配置');
        }
        await loadConfigHistory();
      }
    } catch (e: any) {
      addToast('error', e.message || '重置失败');
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
              onClick={handleReset}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded font-medium transition-colors"
            >
              <RotateCcw size={16} />
              重置默认
            </button>
            <button
              onClick={handleSave}
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
          <span className="text-sm text-slate-400">
            最近 {configHistory.length} 条变更
          </span>
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
    </div>
  );
}

function HistoryItem({ item }: { item: ConfigHistory }) {
  const actionLabel = item.action === 'save' ? '保存' : '重置';
  const actionClass = item.action === 'save' 
    ? 'bg-green-900/50 text-green-400 border-green-700' 
    : 'bg-amber-900/50 text-amber-400 border-amber-700';

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
          <span className={`px-2 py-1 text-xs font-medium rounded border ${actionClass}`}>
            {actionLabel}
          </span>
          <span className="text-primary-400 font-mono text-sm">v{item.version}</span>
        </div>
        <div className="text-right">
          <p className="text-sm text-white">{item.operator}</p>
          <p className="text-xs text-slate-500">{formatTime(item.operatedAt)}</p>
        </div>
      </div>

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
