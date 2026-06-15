import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Clock, CheckCircle, XCircle, TrendingUp, ArrowRight } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { StatusBadge } from '../components/common/StatusBadge';
import { EventStatus, STATUS_LABELS } from '../../shared/types';

const statusStats: { status: EventStatus; label: string; icon: typeof AlertTriangle; color: string }[] = [
  { status: 'pending', label: '待确认', icon: Clock, color: 'text-amber-400' },
  { status: 'need_rectify', label: '需整改', icon: AlertTriangle, color: 'text-red-400' },
  { status: 'reviewed', label: '已复核', icon: CheckCircle, color: 'text-blue-400' },
  { status: 'closed', label: '已关闭', icon: XCircle, color: 'text-green-400' },
];

export function Dashboard() {
  const { events, batches, loadAll, loading } = useAppStore();

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const stats = statusStats.map(s => ({
    ...s,
    count: events.filter(e => e.status === s.status).length,
  }));

  const recentEvents = [...events]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);

  const recentBatches = [...batches]
    .sort((a, b) => new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-mono text-white">缺陷复盘看板</h1>
          <p className="text-slate-400 mt-1">屋顶巡检缺陷管理与状态追踪</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <TrendingUp size={16} />
          <span>共 {events.length} 条缺陷事件</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.status}
              className="bg-slate-800 border border-slate-700 rounded-lg p-6 hover:border-slate-600 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">{stat.label}</p>
                  <p className="text-4xl font-bold font-mono text-white mt-2">{stat.count}</p>
                </div>
                <div className={`p-3 bg-slate-900 rounded-lg ${stat.color}`}>
                  <Icon size={24} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-800 border border-slate-700 rounded-lg">
          <div className="p-4 border-b border-slate-700 flex items-center justify-between">
            <h2 className="text-lg font-semibold font-mono text-white">近期事件</h2>
            <Link to="/events" className="text-primary-400 hover:text-primary-300 text-sm flex items-center gap-1">
              查看全部 <ArrowRight size={14} />
            </Link>
          </div>
          <div className="p-4">
            {loading.events ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="animate-pulse h-16 bg-slate-700 rounded" />
                ))}
              </div>
            ) : recentEvents.length === 0 ? (
              <p className="text-slate-500 text-center py-8">暂无事件数据</p>
            ) : (
              <div className="space-y-3">
                {recentEvents.map((event) => (
                  <Link
                    key={event.id}
                    to={`/events/${event.id}`}
                    className="flex items-center justify-between p-3 bg-slate-900/50 rounded hover:bg-slate-900 transition-colors"
                  >
                    <div>
                      <p className="text-sm text-slate-200">
                        事件 #{event.id.slice(0, 8)} · {event.level}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {new Date(event.updatedAt).toLocaleString('zh-CN')}
                      </p>
                    </div>
                    <StatusBadge status={event.status} />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-lg">
          <div className="p-4 border-b border-slate-700 flex items-center justify-between">
            <h2 className="text-lg font-semibold font-mono text-white">近期批次</h2>
            <Link to="/batches" className="text-primary-400 hover:text-primary-300 text-sm flex items-center gap-1">
              查看全部 <ArrowRight size={14} />
            </Link>
          </div>
          <div className="p-4">
            {loading.batches ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="animate-pulse h-16 bg-slate-700 rounded" />
                ))}
              </div>
            ) : recentBatches.length === 0 ? (
              <p className="text-slate-500 text-center py-8">暂无批次数据</p>
            ) : (
              <div className="space-y-3">
                {recentBatches.map((batch) => (
                  <div
                    key={batch.id}
                    className="flex items-center justify-between p-3 bg-slate-900/50 rounded"
                  >
                    <div>
                      <p className="text-sm text-slate-200">{batch.name}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {batch.type === 'points' ? '点位数据' :
                         batch.type === 'defects' ? '缺陷数据' : '整改数据'} · 
                        有效 {batch.validRecords}/{batch.totalRecords} 条
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded ${
                      batch.status === 'success' ? 'bg-green-900 text-green-300' :
                      batch.status === 'failed' ? 'bg-red-900 text-red-300' :
                      'bg-amber-900 text-amber-300'
                    }`}>
                      {batch.status === 'success' ? '成功' :
                       batch.status === 'failed' ? '失败' : '处理中'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <h2 className="text-lg font-semibold font-mono text-white mb-4">快速开始</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link to="/batches" className="p-4 bg-slate-900 rounded border border-slate-700 hover:border-primary-500 transition-colors">
            <h3 className="font-medium text-white">1. 导入数据</h3>
            <p className="text-sm text-slate-400 mt-2">上传点位CSV、缺陷JSON和整改回传CSV</p>
          </Link>
          <Link to="/config" className="p-4 bg-slate-900 rounded border border-slate-700 hover:border-primary-500 transition-colors">
            <h3 className="font-medium text-white">2. 配置规则</h3>
            <p className="text-sm text-slate-400 mt-2">设置距离阈值和等级映射规则</p>
          </Link>
          <Link to="/events" className="p-4 bg-slate-900 rounded border border-slate-700 hover:border-primary-500 transition-colors">
            <h3 className="font-medium text-white">3. 处理事件</h3>
            <p className="text-sm text-slate-400 mt-2">确认缺陷、添加备注、流转状态</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
