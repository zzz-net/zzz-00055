import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, User, Calendar, MessageSquare, FileText, Clock, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { api } from '../api/client';
import { useAppStore } from '../store/useAppStore';
import { StatusBadge } from '../components/common/StatusBadge';
import { useToast } from '../components/common/Toast';
import { Event, EventStatus, OperationLog, STATUS_LABELS, EventDetailResponse } from '../../shared/types';

const ALLOWED_TRANSITIONS: Record<EventStatus, { status: EventStatus; label: string; icon: typeof CheckCircle }[]> = {
  pending: [
    { status: 'need_rectify', label: '确认需整改', icon: AlertTriangle },
    { status: 'cancelled', label: '驳回作废', icon: XCircle },
  ],
  need_rectify: [
    { status: 'reviewed', label: '提交复核', icon: CheckCircle },
  ],
  reviewed: [
    { status: 'closed', label: '验证通过关闭', icon: XCircle },
    { status: 'need_rectify', label: '整改不通过', icon: AlertTriangle },
  ],
  closed: [
    { status: 'need_rectify', label: '重新打开', icon: AlertTriangle },
  ],
  cancelled: [],
};

export function EventDetail() {
  const { addToast } = useToast();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { updateEvent } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [eventDetail, setEventDetail] = useState<EventDetailResponse | null>(null);
  const [remark, setRemark] = useState('');
  const [operator, setOperator] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    loadDetail();
  }, [id]);

  const loadDetail = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const detail = await api.events.getDetail(id);
      setEventDetail(detail);
      if (detail.event.reviewer) {
        setOperator(detail.event.reviewer);
      }
    } catch (e: any) {
      addToast('error', '加载事件详情失败');
      navigate('/events');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: EventStatus, actionLabel: string) => {
    if (!id || !operator.trim()) {
      addToast('warning', '请输入操作人姓名');
      return;
    }
    setProcessing(newStatus);
    try {
      const result = await api.events.updateStatus(id, newStatus, operator.trim(), remark.trim() || undefined);
      if (result.success) {
        updateEvent(result.event);
        addToast('success', `${actionLabel}成功`);
        setRemark('');
        loadDetail();
      }
    } catch (e: any) {
      addToast('error', e.message || '操作失败');
    } finally {
      setProcessing(null);
    }
  };

  const handleAddRemark = async () => {
    if (!id || !remark.trim() || !operator.trim()) {
      addToast('warning', '请输入操作人姓名和复核备注');
      return;
    }
    setProcessing('remark');
    try {
      const result = await api.events.addRemark(id, remark.trim(), operator.trim());
      if (result.success) {
        updateEvent(result.event);
        addToast('success', '复核备注已添加');
        setRemark('');
        loadDetail();
      }
    } catch (e: any) {
      addToast('error', e.message || '操作失败');
    } finally {
      setProcessing(null);
    }
  };

  const getLevelColor = (level: string) => {
    const colors: Record<string, string> = {
      '一级': 'bg-red-500 text-white',
      '二级': 'bg-orange-500 text-white',
      '三级': 'bg-green-500 text-white',
      '四级': 'bg-blue-500 text-white',
    };
    return colors[level] || 'bg-slate-500 text-white';
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'status_change': return '状态变更';
      case 'add_remark': return '添加备注';
      default: return action;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!eventDetail) {
    return <div className="text-slate-400">事件不存在</div>;
  }

  const { event, defects, rectifications, logs } = eventDetail;
  const primaryDefect = defects.find(d => d.id === event.primaryDefectId) || defects[0];
  const transitions = ALLOWED_TRANSITIONS[event.status] || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/events')}
          className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold font-mono text-white">
            事件详情 #{event.id.slice(0, 12)}
          </h1>
          <p className="text-slate-400 text-sm">
            创建于 {new Date(event.createdAt).toLocaleString('zh-CN')}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className={`px-3 py-1 rounded text-sm font-medium ${getLevelColor(event.level)}`}>
            {event.level}
          </span>
          <StatusBadge status={event.status} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <FileText size={20} className="text-primary-400" />
              缺陷信息
            </h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-400">中心坐标:</span>
                <p className="text-white font-mono mt-1">
                  ({event.centerX.toFixed(4)}, {event.centerY.toFixed(4)})
                </p>
              </div>
              <div>
                <span className="text-slate-400">合并缺陷数:</span>
                <p className="text-white mt-1">{event.mergedDefectIds.length} 条</p>
              </div>
              <div>
                <span className="text-slate-400">规则版本:</span>
                <p className="text-white font-mono mt-1">v{event.ruleVersion}</p>
              </div>
              <div>
                <span className="text-slate-400">最后更新:</span>
                <p className="text-white mt-1">{new Date(event.updatedAt).toLocaleString('zh-CN')}</p>
              </div>
              {event.reviewer && (
                <div>
                  <span className="text-slate-400">复核人:</span>
                  <p className="text-white mt-1 flex items-center gap-1">
                    <User size={14} /> {event.reviewer}
                  </p>
                </div>
              )}
              {event.reviewedAt && (
                <div>
                  <span className="text-slate-400">复核时间:</span>
                  <p className="text-white mt-1 flex items-center gap-1">
                    <Calendar size={14} /> {new Date(event.reviewedAt).toLocaleString('zh-CN')}
                  </p>
                </div>
              )}
            </div>

            {event.reviewRemark && (
              <div className="mt-4 p-4 bg-slate-900 rounded-lg">
                <h4 className="text-slate-400 text-sm mb-2 flex items-center gap-2">
                  <MessageSquare size={14} /> 复核备注
                </h4>
                <p className="text-white">{event.reviewRemark}</p>
              </div>
            )}
          </div>

          {primaryDefect && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <AlertTriangle size={20} className="text-amber-400" />
                主缺陷信息
              </h2>
              <div className="space-y-3 text-sm">
                <div className="flex">
                  <span className="text-slate-400 w-24">点位编号:</span>
                  <span className="text-white font-mono">{primaryDefect.pointCode}</span>
                </div>
                <div className="flex">
                  <span className="text-slate-400 w-24">缺陷类型:</span>
                  <span className="text-white">{primaryDefect.defectType}</span>
                </div>
                <div className="flex">
                  <span className="text-slate-400 w-24">严重等级:</span>
                  <span className="text-white">{primaryDefect.severity}</span>
                </div>
                <div className="flex">
                  <span className="text-slate-400 w-24">描述:</span>
                  <span className="text-white">{primaryDefect.description}</span>
                </div>
                <div className="flex">
                  <span className="text-slate-400 w-24">检测时间:</span>
                  <span className="text-white">{new Date(primaryDefect.detectedAt).toLocaleString('zh-CN')}</span>
                </div>
              </div>
            </div>
          )}

          {defects.length > 0 && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <h2 className="text-lg font-semibold text-white mb-4">
                合并的缺陷 ({defects.length} 条)
              </h2>
              <div className="space-y-3 max-h-64 overflow-auto">
                {defects.map((defect) => (
                  <div
                    key={defect.id}
                    className={`p-3 rounded-lg ${defect.id === event.primaryDefectId ? 'bg-primary-900/30 border border-primary-700' : 'bg-slate-900'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-white font-mono text-sm">{defect.pointCode}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300">
                        {defect.severity}
                      </span>
                    </div>
                    <p className="text-slate-400 text-sm mt-1">{defect.description}</p>
                    {defect.id === event.primaryDefectId && (
                      <span className="text-xs text-primary-400 mt-1 inline-block">主缺陷</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {rectifications.length > 0 && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <CheckCircle size={20} className="text-green-400" />
                整改记录 ({rectifications.length} 条)
              </h2>
              <div className="space-y-3">
                {rectifications.map((rect) => (
                  <div key={rect.id} className="p-3 bg-slate-900 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white font-mono text-sm">{rect.pointCode}</span>
                      <span className="text-xs text-slate-400">
                        {new Date(rect.rectifiedAt).toLocaleDateString('zh-CN')}
                      </span>
                    </div>
                    <p className="text-slate-300 text-sm">
                      <span className="text-slate-500">整改人:</span> {rect.rectifier}
                    </p>
                    <p className="text-slate-300 text-sm mt-1">
                      <span className="text-slate-500">措施:</span> {rect.rectificationMeasure}
                    </p>
                    {rect.remark && (
                      <p className="text-slate-400 text-sm mt-1">
                        <span className="text-slate-500">备注:</span> {rect.remark}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-white mb-4">来源证据</h2>
            <div className="space-y-3 max-h-64 overflow-auto">
              {event.sourceEvidence.map((evidence, index) => (
                <div key={index} className="p-3 bg-slate-900 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      evidence.type === 'defect' ? 'bg-orange-900/50 text-orange-300' :
                      evidence.type === 'point' ? 'bg-blue-900/50 text-blue-300' :
                      'bg-green-900/50 text-green-300'
                    }`}>
                      {evidence.type === 'defect' ? '缺陷' :
                       evidence.type === 'point' ? '点位' : '整改'}
                    </span>
                    <span className="text-xs text-slate-400">{evidence.batchName}</span>
                  </div>
                  <pre className="text-xs text-slate-400 overflow-auto max-h-24 bg-slate-950 p-2 rounded">
                    {JSON.stringify(evidence.data, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-white mb-4">状态操作</h2>
            
            <div className="mb-4">
              <label className="block text-sm text-slate-400 mb-1">操作人姓名</label>
              <input
                type="text"
                value={operator}
                onChange={(e) => setOperator(e.target.value)}
                placeholder="请输入操作人姓名"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-white placeholder-slate-500 focus:outline-none focus:border-primary-500"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm text-slate-400 mb-1">操作备注</label>
              <textarea
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder="请输入备注信息（可选）"
                rows={3}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-white placeholder-slate-500 focus:outline-none focus:border-primary-500 resize-none"
              />
            </div>

            <div className="space-y-2">
              {transitions.map((transition) => {
                const Icon = transition.icon;
                return (
                  <button
                    key={transition.status}
                    onClick={() => handleStatusChange(transition.status, transition.label)}
                    disabled={!!processing}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded font-medium transition-colors"
                  >
                    {processing === transition.status ? (
                      <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    ) : (
                      <Icon size={16} />
                    )}
                    {transition.label}
                  </button>
                );
              })}

              {event.status !== 'cancelled' && (
                <button
                  onClick={handleAddRemark}
                  disabled={!!processing}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded font-medium transition-colors"
                >
                  {processing === 'remark' ? (
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  ) : (
                    <MessageSquare size={16} />
                  )}
                  添加复核备注
                </button>
              )}

              {transitions.length === 0 && event.status === 'cancelled' && (
                <p className="text-center text-slate-500 text-sm py-2">
                  该事件已作废，无法进行操作
                </p>
              )}
            </div>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Clock size={18} className="text-slate-400" />
              操作日志
            </h2>
            <div className="space-y-4 max-h-96 overflow-auto">
              {logs.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-4">暂无操作日志</p>
              ) : (
                [...logs]
                  .sort((a, b) => new Date(b.operatedAt).getTime() - new Date(a.operatedAt).getTime())
                  .map((log) => (
                    <div key={log.id} className="relative pl-6 pb-4 border-l-2 border-slate-700 last:pb-0 last:border-l-transparent">
                      <div className="absolute -left-1.5 top-0 w-3 h-3 rounded-full bg-primary-500" />
                      <div className="text-sm">
                        <p className="text-white font-medium">
                          {getActionLabel(log.action)}
                        </p>
                        {log.oldStatus && log.newStatus && (
                          <p className="text-slate-400 text-xs mt-1">
                            {STATUS_LABELS[log.oldStatus]} → {STATUS_LABELS[log.newStatus]}
                          </p>
                        )}
                        {log.remark && (
                          <p className="text-slate-300 text-xs mt-1 bg-slate-900 p-2 rounded">
                            {log.remark}
                          </p>
                        )}
                        <p className="text-slate-500 text-xs mt-2">
                          {log.operator} · {new Date(log.operatedAt).toLocaleString('zh-CN')}
                        </p>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
