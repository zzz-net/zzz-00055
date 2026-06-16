import { Batch, Event, Config, EventStatus, ValidationError, EventDetailResponse, ConfigHistory, ExportSummary } from '../../shared/types';

const API_BASE = '/api';

class ApiError extends Error {
  status: number;
  data: any;
  constructor(message: string, status: number, data?: any) {
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
};
