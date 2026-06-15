import { Batch, Event, Config, EventStatus, ValidationError, EventDetailResponse } from '../../shared/types';

const API_BASE = '/api';

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
    throw new Error(error.message || `HTTP ${response.status}`);
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
    update: (config: Partial<Config>) =>
      request<{ success: boolean; config: Config }>('/config', {
        method: 'PUT',
        body: JSON.stringify(config),
      }),
    reset: () =>
      request<{ success: boolean; config: Config }>('/config/reset', {
        method: 'POST',
      }),
  },
  
  export: {
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
