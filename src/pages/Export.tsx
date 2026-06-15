import { useState, useEffect } from 'react';
import { Download, FileSpreadsheet, FileJson, Database, Info, Filter } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { api } from '../api/client';
import { useToast } from '../components/common/Toast';
import { ExportSummary } from '../../shared/types';

export function Export() {
  const { addToast } = useToast();
  const { batches, events, loadBatches, loadEvents, loading, config } = useAppStore();
  const [selectedBatch, setSelectedBatch] = useState<string>('');
  const [exportSummary, setExportSummary] = useState<ExportSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  useEffect(() => {
    loadBatches();
    loadEvents();
  }, [loadBatches, loadEvents]);

  useEffect(() => {
    const loadSummary = async () => {
      setLoadingSummary(true);
      try {
        const summary = await api.export.getSummary(selectedBatch || undefined);
        setExportSummary(summary);
      } catch (e: any) {
        console.error('Failed to load export summary:', e);
      } finally {
        setLoadingSummary(false);
      }
    };

    loadSummary();
  }, [selectedBatch, events.length]);

  const filteredEvents = selectedBatch
    ? events.filter(e => e.sourceEvidence.some(ev => ev.batchId === selectedBatch))
    : events;

  const handleExportCSV = () => {
    api.export.eventsCSV(selectedBatch || undefined);
    addToast('success', 'CSV 文件已开始下载');
  };

  const handleExportJSON = () => {
    api.export.eventsJSON(selectedBatch || undefined);
    addToast('success', 'JSON 文件已开始下载');
  };

  const handleExportFull = () => {
    api.export.fullJSON();
    addToast('success', '完整数据已开始下载');
  };

  const statusCounts = filteredEvents.reduce((acc, e) => {
    acc[e.status] = (acc[e.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-mono text-white">数据导出</h1>
        <p className="text-slate-400 mt-1">导出缺陷事件数据为 CSV 或 JSON 格式</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <p className="text-slate-400 text-sm">总事件数</p>
          <p className="text-3xl font-bold text-white font-mono mt-1">{filteredEvents.length}</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <p className="text-slate-400 text-sm">待确认</p>
          <p className="text-3xl font-bold text-amber-400 font-mono mt-1">{statusCounts.pending || 0}</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <p className="text-slate-400 text-sm">需整改</p>
          <p className="text-3xl font-bold text-red-400 font-mono mt-1">{statusCounts.need_rectify || 0}</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <p className="text-slate-400 text-sm">已关闭</p>
          <p className="text-3xl font-bold text-green-400 font-mono mt-1">{statusCounts.closed || 0}</p>
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Info size={20} className="text-primary-400" />
          <h2 className="text-lg font-semibold text-white">导出摘要</h2>
        </div>
        
        {loadingSummary ? (
          <div className="animate-pulse h-24 bg-slate-900 rounded" />
        ) : exportSummary ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900 rounded-lg p-4">
              <p className="text-slate-400 text-sm mb-1">规则版本</p>
              <p className="text-xl font-bold text-primary-400 font-mono">v{exportSummary.ruleVersion}</p>
            </div>
            <div className="bg-slate-900 rounded-lg p-4">
              <p className="text-slate-400 text-sm mb-1">批次筛选</p>
              {exportSummary.batchFilter.applied ? (
                <div className="flex items-center gap-1">
                  <Filter size={14} className="text-amber-400" />
                  <span className="text-amber-400 text-sm font-medium">已筛选</span>
                </div>
              ) : (
                <span className="text-green-400 text-sm font-medium">全部批次</span>
              )}
              {exportSummary.batchFilter.batchName && (
                <p className="text-xs text-slate-500 mt-1 truncate">
                  {exportSummary.batchFilter.batchName}
                </p>
              )}
            </div>
            <div className="bg-slate-900 rounded-lg p-4">
              <p className="text-slate-400 text-sm mb-1">包含事件</p>
              <p className="text-xl font-bold text-white font-mono">{exportSummary.eventCount} 条</p>
            </div>
            <div className="bg-slate-900 rounded-lg p-4">
              <p className="text-slate-400 text-sm mb-1">导出时间</p>
              <p className="text-sm text-slate-300">
                {new Date(exportSummary.exportedAt).toLocaleString('zh-CN')}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4">导出选项</h2>
        
        <div className="mb-6">
          <label className="block text-sm text-slate-400 mb-2">筛选批次</label>
          <select
            value={selectedBatch}
            onChange={(e) => setSelectedBatch(e.target.value)}
            className="w-full md:w-96 px-4 py-3 bg-slate-900 border border-slate-700 rounded text-white focus:outline-none focus:border-primary-500"
          >
            <option value="">全部批次</option>
            {batches.map(batch => (
              <option key={batch.id} value={batch.id}>
                {batch.name} ({batch.type})
              </option>
            ))}
          </select>
          {selectedBatch && (
            <p className="text-xs text-slate-500 mt-2">
              已筛选出 {filteredEvents.length} 条相关事件
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-slate-900 rounded-lg p-6 hover:bg-slate-900/80 transition-colors">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-green-900/50 rounded-lg">
                <FileSpreadsheet className="text-green-400" size={24} />
              </div>
              <div>
                <h3 className="text-white font-medium">导出 CSV</h3>
                <p className="text-xs text-slate-500">Excel 兼容格式</p>
              </div>
            </div>
            <p className="text-sm text-slate-400 mb-4">
              导出事件的扁平化数据，包含状态、等级、坐标、复核人等关键字段。
            </p>
            <button
              onClick={handleExportCSV}
              disabled={filteredEvents.length === 0}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded font-medium transition-colors"
            >
              <Download size={16} />
              下载 CSV
            </button>
          </div>

          <div className="bg-slate-900 rounded-lg p-6 hover:bg-slate-900/80 transition-colors">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-blue-900/50 rounded-lg">
                <FileJson className="text-blue-400" size={24} />
              </div>
              <div>
                <h3 className="text-white font-medium">导出 JSON</h3>
                <p className="text-xs text-slate-500">完整结构格式</p>
              </div>
            </div>
            <p className="text-sm text-slate-400 mb-4">
              导出事件的完整嵌套数据，包含关联的缺陷、整改记录和操作日志。
            </p>
            <button
              onClick={handleExportJSON}
              disabled={filteredEvents.length === 0}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded font-medium transition-colors"
            >
              <Download size={16} />
              下载 JSON
            </button>
          </div>

          <div className="bg-slate-900 rounded-lg p-6 hover:bg-slate-900/80 transition-colors">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-purple-900/50 rounded-lg">
                <Database className="text-purple-400" size={24} />
              </div>
              <div>
                <h3 className="text-white font-medium">完整备份</h3>
                <p className="text-xs text-slate-500">全部数据导出</p>
              </div>
            </div>
            <p className="text-sm text-slate-400 mb-4">
              导出系统全部数据，包括批次、点位、缺陷、事件、配置和所有操作日志。
            </p>
            <button
              onClick={handleExportFull}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded font-medium transition-colors"
            >
              <Download size={16} />
              下载全部
            </button>
          </div>
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4">数据预览</h2>
        {loading.events ? (
          <div className="animate-pulse h-64 bg-slate-900 rounded" />
        ) : filteredEvents.length === 0 ? (
          <p className="text-slate-500 text-center py-8">暂无数据可导出</p>
        ) : (
          <div className="overflow-x-auto max-h-64">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left text-slate-400 font-medium">事件ID</th>
                  <th className="px-4 py-2 text-left text-slate-400 font-medium">状态</th>
                  <th className="px-4 py-2 text-left text-slate-400 font-medium">等级</th>
                  <th className="px-4 py-2 text-left text-slate-400 font-medium">合并数</th>
                  <th className="px-4 py-2 text-left text-slate-400 font-medium">复核人</th>
                  <th className="px-4 py-2 text-left text-slate-400 font-medium">规则版本</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {filteredEvents.slice(0, 10).map(event => (
                  <tr key={event.id} className="hover:bg-slate-900/50">
                    <td className="px-4 py-2 text-slate-300 font-mono">#{event.id.slice(0, 12)}</td>
                    <td className="px-4 py-2 text-slate-300">{event.status}</td>
                    <td className="px-4 py-2 text-slate-300">{event.level}</td>
                    <td className="px-4 py-2 text-slate-300">{event.mergedDefectIds.length}</td>
                    <td className="px-4 py-2 text-slate-300">{event.reviewer || '-'}</td>
                    <td className="px-4 py-2 text-slate-400 font-mono">v{event.ruleVersion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredEvents.length > 10 && (
              <p className="text-center text-slate-500 text-sm py-3">
                还有 {filteredEvents.length - 10} 条数据未显示...
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
