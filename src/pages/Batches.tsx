import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Database, FileSpreadsheet, FileJson, CheckCircle, XCircle, AlertTriangle, Eye } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { api } from '../api/client';
import { FileUpload } from '../components/common/FileUpload';
import { useToast } from '../components/common/Toast';
import { Batch, ValidationError } from '../../shared/types';

export function Batches() {
  const { addToast } = useToast();
  const { batches, loadBatches, loading, addBatch } = useAppStore();
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
  const [batchDetail, setBatchDetail] = useState<any>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState<string | null>(null);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  const handleImportPoints = async (file: File) => {
    setImporting('points');
    try {
      const result = await api.import.points(file);
      if (result.success && result.batch) {
        addBatch(result.batch);
        addToast('success', `导入成功！${result.batch.validRecords} 条有效数据`);
        if (result.errors && result.errors.length > 0) {
          addToast('warning', `存在 ${result.errors.length} 条校验错误`);
        }
      } else {
        addToast('error', result.message || '导入失败');
      }
    } catch (e: any) {
      addToast('error', e.message || '导入失败');
    } finally {
      setImporting(null);
    }
  };

  const handleImportDefects = async (file: File) => {
    setImporting('defects');
    try {
      const result = await api.import.defects(file);
      if (result.success && result.batch) {
        addBatch(result.batch);
        const messages = [`导入成功！${result.batch.validRecords} 条有效数据`];
        if (result.newEvents) {
          messages.push(`生成 ${result.newEvents} 条新缺陷事件`);
        }
        addToast('success', messages.join('，'));
        if (result.errors && result.errors.length > 0) {
          addToast('warning', `存在 ${result.errors.length} 条校验错误`);
        }
      } else {
        addToast('error', result.message || '导入失败');
      }
    } catch (e: any) {
      addToast('error', e.message || '导入失败');
    } finally {
      setImporting(null);
    }
  };

  const handleImportRectification = async (file: File) => {
    setImporting('rectification');
    try {
      const result = await api.import.rectification(file);
      if (result.success && result.batch) {
        addBatch(result.batch);
        addToast('success', `导入成功！${result.batch.validRecords} 条有效数据`);
        if (result.errors && result.errors.length > 0) {
          addToast('warning', `存在 ${result.errors.length} 条校验错误`);
        }
      } else {
        addToast('error', result.message || '导入失败');
      }
    } catch (e: any) {
      addToast('error', e.message || '导入失败');
    } finally {
      setImporting(null);
    }
  };

  const viewBatchDetail = async (batch: Batch) => {
    setSelectedBatch(batch);
    try {
      const detail = await api.batches.getDetail(batch.id);
      setBatchDetail(detail);
    } catch (e: any) {
      addToast('error', '获取批次详情失败');
    }
  };

  const getBatchTypeLabel = (type: string) => {
    switch (type) {
      case 'points': return '点位数据';
      case 'defects': return '缺陷数据';
      case 'rectification': return '整改数据';
      default: return type;
    }
  };

  const getBatchTypeIcon = (type: string) => {
    switch (type) {
      case 'points': return <FileSpreadsheet size={16} />;
      case 'defects': return <FileJson size={16} />;
      case 'rectification': return <CheckCircle size={16} />;
      default: return <Database size={16} />;
    }
  };

  const renderErrors = (errors: ValidationError[]) => (
    <div className="mt-4 p-4 bg-red-900/20 border border-red-700 rounded-lg">
      <h4 className="text-red-300 font-medium flex items-center gap-2 mb-2">
        <AlertTriangle size={16} /> 校验错误 ({errors.length} 条)
      </h4>
      <div className="max-h-48 overflow-auto space-y-2">
        {errors.map((err, i) => (
          <div key={i} className="text-sm text-red-200">
            第 {err.row} 行 · {err.field}: {err.message}
            {err.value !== undefined && ` (值: ${err.value})`}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-mono text-white">批次管理</h1>
        <p className="text-slate-400 mt-1">导入和管理巡检数据批次</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileSpreadsheet className="text-blue-400" size={20} />
            <h3 className="font-semibold text-white">导入点位 CSV</h3>
          </div>
          <FileUpload
            accept=".csv"
            label="选择点位CSV文件"
            onFileSelect={handleImportPoints}
            loading={importing === 'points'}
          />
          <p className="text-xs text-slate-500 mt-3">
            必需字段: pointCode, x, y, z
          </p>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileJson className="text-orange-400" size={20} />
            <h3 className="font-semibold text-white">导入缺陷 JSON</h3>
          </div>
          <FileUpload
            accept=".json"
            label="选择缺陷JSON文件"
            onFileSelect={handleImportDefects}
            loading={importing === 'defects'}
          />
          <p className="text-xs text-slate-500 mt-3">
            必需字段: pointCode, defectType, severity, description
          </p>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle className="text-green-400" size={20} />
            <h3 className="font-semibold text-white">导入整改回传 CSV</h3>
          </div>
          <FileUpload
            accept=".csv"
            label="选择整改CSV文件"
            onFileSelect={handleImportRectification}
            loading={importing === 'rectification'}
          />
          <p className="text-xs text-slate-500 mt-3">
            必需字段: pointCode, rectificationMeasure, rectifier
          </p>
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-lg">
        <div className="p-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold font-mono text-white">批次列表</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-900/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">批次名称</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">类型</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">状态</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">记录数</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">导入时间</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {loading.batches ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    加载中...
                  </td>
                </tr>
              ) : batches.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    暂无批次数据
                  </td>
                </tr>
              ) : (
                [...batches]
                  .sort((a, b) => new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime())
                  .map((batch) => (
                    <tr key={batch.id} className="hover:bg-slate-900/30 transition-colors">
                      <td className="px-4 py-3 text-sm text-slate-200">{batch.name}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-xs text-slate-300">
                          {getBatchTypeIcon(batch.type)}
                          {getBatchTypeLabel(batch.type)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded ${
                          batch.status === 'success' ? 'bg-green-900/50 text-green-300' :
                          batch.status === 'failed' ? 'bg-red-900/50 text-red-300' :
                          'bg-amber-900/50 text-amber-300'
                        }`}>
                          {batch.status === 'success' ? <CheckCircle size={12} /> :
                           batch.status === 'failed' ? <XCircle size={12} /> : null}
                          {batch.status === 'success' ? '成功' :
                           batch.status === 'failed' ? '失败' : '处理中'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">
                        <span className="text-green-400">{batch.validRecords}</span>
                        <span className="text-slate-500"> / {batch.totalRecords}</span>
                        {batch.invalidRecords > 0 && (
                          <span className="text-red-400 ml-2">({batch.invalidRecords} 错误)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-400">
                        {new Date(batch.importedAt).toLocaleString('zh-CN')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => viewBatchDetail(batch)}
                            className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"
                            title="查看详情"
                          >
                            <Eye size={16} />
                          </button>
                          {batch.errors && batch.errors.length > 0 && (
                            <button
                              onClick={() => setShowErrors(showErrors === batch.id ? null : batch.id)}
                              className="p-1.5 hover:bg-slate-700 rounded text-amber-400 hover:text-amber-300 transition-colors"
                              title="查看错误"
                            >
                              <AlertTriangle size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>

        {showErrors && (() => {
          const batch = batches.find(b => b.id === showErrors);
          return batch?.errors ? renderErrors(batch.errors) : null;
        })()}
      </div>

      {selectedBatch && batchDetail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg w-full max-w-4xl max-h-[80vh] overflow-auto">
            <div className="p-4 border-b border-slate-700 flex items-center justify-between sticky top-0 bg-slate-800">
              <h3 className="text-lg font-semibold font-mono text-white">批次详情 - {selectedBatch.name}</h3>
              <button
                onClick={() => { setSelectedBatch(null); setBatchDetail(null); }}
                className="p-2 hover:bg-slate-700 rounded text-slate-400 hover:text-white"
              >
                <XCircle size={20} />
              </button>
            </div>
            <div className="p-4 space-y-6">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-400">批次类型:</span>
                  <span className="text-white ml-2">{getBatchTypeLabel(selectedBatch.type)}</span>
                </div>
                <div>
                  <span className="text-slate-400">状态:</span>
                  <span className="text-white ml-2">{selectedBatch.status}</span>
                </div>
                <div>
                  <span className="text-slate-400">总记录数:</span>
                  <span className="text-white ml-2">{selectedBatch.totalRecords}</span>
                </div>
                <div>
                  <span className="text-slate-400">有效记录:</span>
                  <span className="text-green-400 ml-2">{selectedBatch.validRecords}</span>
                </div>
              </div>

              {batchDetail.points && batchDetail.points.length > 0 && (
                <div>
                  <h4 className="text-white font-medium mb-2">点位数据预览</h4>
                  <div className="overflow-x-auto max-h-48">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-900">
                        <tr>
                          <th className="px-3 py-2 text-left text-slate-400">pointCode</th>
                          <th className="px-3 py-2 text-left text-slate-400">X</th>
                          <th className="px-3 py-2 text-left text-slate-400">Y</th>
                          <th className="px-3 py-2 text-left text-slate-400">Z</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700">
                        {batchDetail.points.slice(0, 10).map((p: any) => (
                          <tr key={p.id}>
                            <td className="px-3 py-2 text-slate-300">{p.pointCode}</td>
                            <td className="px-3 py-2 text-slate-300">{p.x}</td>
                            <td className="px-3 py-2 text-slate-300">{p.y}</td>
                            <td className="px-3 py-2 text-slate-300">{p.z}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {batchDetail.defects && batchDetail.defects.length > 0 && (
                <div>
                  <h4 className="text-white font-medium mb-2">缺陷数据预览</h4>
                  <div className="overflow-x-auto max-h-48">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-900">
                        <tr>
                          <th className="px-3 py-2 text-left text-slate-400">pointCode</th>
                          <th className="px-3 py-2 text-left text-slate-400">类型</th>
                          <th className="px-3 py-2 text-left text-slate-400">严重等级</th>
                          <th className="px-3 py-2 text-left text-slate-400">描述</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700">
                        {batchDetail.defects.slice(0, 10).map((d: any) => (
                          <tr key={d.id}>
                            <td className="px-3 py-2 text-slate-300">{d.pointCode}</td>
                            <td className="px-3 py-2 text-slate-300">{d.defectType}</td>
                            <td className="px-3 py-2 text-slate-300">{d.severity}</td>
                            <td className="px-3 py-2 text-slate-300 max-w-xs truncate">{d.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {batchDetail.rectifications && batchDetail.rectifications.length > 0 && (
                <div>
                  <h4 className="text-white font-medium mb-2">整改数据预览</h4>
                  <div className="overflow-x-auto max-h-48">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-900">
                        <tr>
                          <th className="px-3 py-2 text-left text-slate-400">pointCode</th>
                          <th className="px-3 py-2 text-left text-slate-400">整改措施</th>
                          <th className="px-3 py-2 text-left text-slate-400">整改人</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700">
                        {batchDetail.rectifications.slice(0, 10).map((r: any) => (
                          <tr key={r.id}>
                            <td className="px-3 py-2 text-slate-300">{r.pointCode}</td>
                            <td className="px-3 py-2 text-slate-300 max-w-xs truncate">{r.rectificationMeasure}</td>
                            <td className="px-3 py-2 text-slate-300">{r.rectifier}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
