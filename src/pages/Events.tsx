import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, Filter, Eye } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useToast } from '../components/common/Toast';
import { StatusBadge } from '../components/common/StatusBadge';
import { EventStatus, STATUS_LABELS } from '../../shared/types';

const FILTER_STATUSES: (EventStatus | 'all')[] = ['all', 'pending', 'need_rectify', 'reviewed', 'closed', 'cancelled'];

export function Events() {
  const { addToast } = useToast();
  const { events, batches, loadEvents, loadBatches, loading } = useAppStore();
  const [statusFilter, setStatusFilter] = useState<EventStatus | 'all'>('all');
  const [batchFilter, setBatchFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadEvents(statusFilter === 'all' ? undefined : { status: statusFilter, batchId: batchFilter || undefined });
    loadBatches();
  }, [loadEvents, loadBatches, statusFilter, batchFilter]);

  const filteredEvents = events.filter(event => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return event.id.toLowerCase().includes(query) ||
        event.level.toLowerCase().includes(query) ||
        event.sourceEvidence.some(e => 
          JSON.stringify(e.data).toLowerCase().includes(query)
        );
    }
    return true;
  });

  const getLevelColor = (level: string) => {
    const colors: Record<string, string> = {
      '一级': 'bg-red-500/20 text-red-300 border-red-500',
      '二级': 'bg-orange-500/20 text-orange-300 border-orange-500',
      '三级': 'bg-green-500/20 text-green-300 border-green-500',
      '四级': 'bg-blue-500/20 text-blue-300 border-blue-500',
    };
    return colors[level] || 'bg-slate-500/20 text-slate-300 border-slate-500';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-mono text-white">缺陷事件</h1>
          <p className="text-slate-400 mt-1">管理和追踪所有缺陷事件</p>
        </div>
        <div className="text-sm text-slate-400">
          共 {filteredEvents.length} 条事件
        </div>
      </div>

      <div className="flex flex-wrap gap-4 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="搜索事件ID、等级、描述..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded text-white placeholder-slate-500 focus:outline-none focus:border-primary-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="text-slate-400" size={18} />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as EventStatus | 'all')}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded text-white focus:outline-none focus:border-primary-500"
          >
            <option value="all">全部状态</option>
            {FILTER_STATUSES.filter(s => s !== 'all').map(status => (
              <option key={status} value={status}>{STATUS_LABELS[status]}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={batchFilter}
            onChange={(e) => setBatchFilter(e.target.value)}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded text-white focus:outline-none focus:border-primary-500"
          >
            <option value="">全部批次</option>
            {batches.map(batch => (
              <option key={batch.id} value={batch.id}>{batch.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-900/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">事件ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">等级</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">状态</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">合并缺陷数</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">中心坐标</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">复核人</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">规则版本</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">更新时间</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {loading.events ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                    加载中...
                  </td>
                </tr>
              ) : filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                    暂无事件数据
                  </td>
                </tr>
              ) : (
                [...filteredEvents]
                  .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
                  .map((event) => (
                    <tr key={event.id} className="hover:bg-slate-900/30 transition-colors">
                      <td className="px-4 py-3">
                        <Link
                          to={`/events/${event.id}`}
                          className="text-sm text-primary-400 hover:text-primary-300 font-mono"
                        >
                          #{event.id.slice(0, 12)}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded border ${getLevelColor(event.level)}`}>
                          {event.level}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={event.status} />
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">
                        {event.mergedDefectIds.length} 条
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300 font-mono">
                        ({event.centerX.toFixed(2)}, {event.centerY.toFixed(2)})
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">
                        {event.reviewer || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-400 font-mono">
                        v{event.ruleVersion}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-400">
                        {new Date(event.updatedAt).toLocaleString('zh-CN')}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          to={`/events/${event.id}`}
                          className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors inline-flex"
                        >
                          <Eye size={16} />
                        </Link>
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
