import { Batch, Event, Config, EventStatus, ValidationError, EventDetailResponse, ConfigHistory, ExportSummary, BackupRecord, BackupPreviewResponse, RestoreResult, RollbackPoint, AuditLog, UserRole } from '../../shared/types';

const API_BASE = '/api';

class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: '请求失败' }));
    throw new ApiError(error.message || `HTTP ${response.status}`, response.status, error);
  }
  
  return response.json();
}

export const api = {
  batches: {
    getList: () => request<Batch[]>('/batches'),
    getDetail: (id: string) => request(`/batches/${id}`),
  },
  
  import: {
    points: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return request<{
        success: boolean;
        batch?: Batch;
        errors?: ValidationError[];
        message?: string;
      }>('/import/points', {
        method: 'POST',
        body: formData,
        headers: {},
      });
    },
    defects: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return request<{
        success: boolean;
        batch?: Batch;
        errors?: ValidationError[];
        message?: string;
        newEvents?: number;
      }>('/import/defects', {
        method: 'POST',
        body: formData,
        headers: {},
      });
    },
    rectification: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return request<{
        success: boolean;
        batch?: Batch;
        errors?: ValidationError[];
        message?: string;
      }>('/import/rectification', {
        method: 'POST',
        body: formData,
        headers: {},
      });
    },
    fullData: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return request<{
        success: boolean;
        message: string;
        configVersion?: string;
        historyCount?: number;
        warnings?: string[];
      }>('/import/full', {
        method: 'POST',
        body: formData,
        headers: {},
      });
    },
  },
  
  events: {
    getList: (params?: { status?: EventStatus; batchId?: string }) => {
      const search = new URLSearchParams();
      if (params?.status) search.set('status', params.status);
      if (params?.batchId) search.set('batchId', params.batchId);
      const query = search.toString();
      return request<Event[]>(`/events${query ? `?${query}` : ''}`);
    },
    getDetail: (id: string) => request<EventDetailResponse>(`/events/${id}`),
    updateStatus: (id: string, newStatus: EventStatus, operator: string, remark?: string) =>
      request<{ success: boolean; event: Event }>(`/events/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ newStatus, operator, remark }),
      }),
    addRemark: (id: string, remark: string, reviewer: string) =>
      request<{ success: boolean; event: Event }>(`/events/${id}/remark`, {
        method: 'PATCH',
        body: JSON.stringify({ remark, reviewer }),
      }),
  },
  
  config: {
    get: () => request<Config>('/config'),
    getHistory: (limit?: number) => {
      const query = limit ? `?limit=${limit}` : '';
      return request<ConfigHistory[]>(`/config/history${query}`);
    },
    update: (config: Partial<Config> & { expectedVersion?: string; force?: boolean }) =>
      request<{ success: boolean; config: Config; skipped?: boolean; message?: string; conflict?: boolean; currentVersion?: string; currentConfig?: Config }>('/config', {
        method: 'PUT',
        body: JSON.stringify(config),
      }),
    reset: (updatedBy?: string, expectedVersion?: string, force?: boolean) =>
      request<{ success: boolean; config: Config; skipped?: boolean; message?: string; conflict?: boolean; currentVersion?: string; currentConfig?: Config }>('/config/reset', {
        method: 'POST',
        body: JSON.stringify({ updatedBy, expectedVersion, force }),
      }),
    historyCSV: () => {
      window.open(`${API_BASE}/config/history/csv`, '_blank');
    },
  },
  
  export: {
    getSummary: (batchId?: string) => {
      const query = batchId ? `?batchId=${batchId}` : '';
      return request<ExportSummary>(`/export/summary${query}`);
    },
    eventsCSV: (batchId?: string) => {
      const query = batchId ? `?batchId=${batchId}` : '';
      window.open(`${API_BASE}/export/events/csv${query}`, '_blank');
    },
    eventsJSON: (batchId?: string) => {
      const query = batchId ? `?batchId=${batchId}` : '';
      window.open(`${API_BASE}/export/events/json${query}`, '_blank');
    },
    fullJSON: () => {
      window.open(`${API_BASE}/export/full/json`, '_blank');
    },
  },
  
  backup: {
    getPermissions: () => request<{
      success: boolean;
      user: { username: string; role: UserRole };
      permissions: {
        canView: boolean;
        canCreate: boolean;
        canRestore: boolean;
        canRollback: boolean;
        canDelete: boolean;
      };
    }>('/backup/permissions/check'),

    list: () => request<{ success: boolean; backups: BackupRecord[] }>('/backup'),

    get: (id: string) => request<{ success: boolean; backup: BackupRecord }>(`/backup/${id}`),

    create: (data?: { name?: string; description?: string }) =>
      request<{ success: boolean; backup: BackupRecord }>('/backup/create', {
        method: 'POST',
        body: JSON.stringify(data || {}),
      }),

    download: (id: string) => {
      window.open(`${API_BASE}/backup/${id}/download`, '_blank');
    },

    delete: (id: string) =>
      request<{ success: boolean }>(`/backup/${id}`, {
        method: 'DELETE',
      }),

    upload: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return request<{
        success: boolean;
        preview?: BackupPreviewResponse;
        registeredBackupId?: string;
        tempFilePath?: string;
        error?: string;
      }>('/backup/upload', {
        method: 'POST',
        body: formData,
        headers: {},
      });
    },

    preview: (id: string) =>
      request<{ success: boolean; preview: BackupPreviewResponse; backup: BackupRecord }>(`/backup/preview/${id}`, {
        method: 'POST',
      }),

    restore: (id: string, force?: boolean) =>
      request<RestoreResult & { error?: string }>(`/backup/restore/${id}`, {
        method: 'POST',
        body: JSON.stringify({ force: force === true }),
      }),

    restoreFromUpload: (filePath: string, force?: boolean, backupId?: string) =>
      request<RestoreResult & { error?: string }>('/backup/restore-from-upload', {
        method: 'POST',
        body: JSON.stringify({ filePath, force: force === true, backupId }),
      }),

    clearInterrupted: () =>
      request<{ success: boolean; cleared: boolean }>('/backup/status/interrupted'),

    rollbackList: () =>
      request<{ success: boolean; rollbackPoints: RollbackPoint[] }>('/backup/rollback/list'),

    rollbackApply: (rollbackId: string) =>
      request<RestoreResult & { error?: string }>(`/backup/rollback/${rollbackId}`, {
        method: 'POST',
      }),

    rollbackDelete: (rollbackId: string) =>
      request<{ success: boolean }>(`/backup/rollback/${rollbackId}`, {
        method: 'DELETE',
      }),

    auditLogs: (limit?: number) => {
      const query = limit ? `?limit=${limit}` : '';
      return request<{ success: boolean; logs: AuditLog[] }>(`/backup/audit/logs${query}`);
    },

    auditLogsByBackup: (backupId: string) =>
      request<{ success: boolean; logs: AuditLog[] }>(`/backup/audit/backup/${backupId}`),
  },
};
