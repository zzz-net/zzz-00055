import { create } from 'zustand';
import { Batch, Event, Config, EventStatus, ConfigHistory } from '../../shared/types';
import { api } from '../api/client';

interface AppState {
  batches: Batch[];
  events: Event[];
  config: Config | null;
  configHistory: ConfigHistory[];
  loading: Record<string, boolean>;
  error: string | null;
  
  loadBatches: () => Promise<void>;
  loadEvents: (params?: { status?: EventStatus; batchId?: string }) => Promise<void>;
  loadConfig: () => Promise<void>;
  loadConfigHistory: (limit?: number) => Promise<void>;
  loadAll: () => Promise<void>;
  
  setLoading: (key: string, value: boolean) => void;
  setError: (error: string | null) => void;
  
  addBatch: (batch: Batch) => void;
  updateEvent: (event: Event) => void;
  updateConfig: (config: Config) => void;
  setConfigHistory: (history: ConfigHistory[]) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  batches: [],
  events: [],
  config: null,
  configHistory: [],
  loading: {},
  error: null,
  
  loadBatches: async () => {
    set({ loading: { ...get().loading, batches: true } });
    try {
      const batches = await api.batches.getList();
      set({ batches });
    } catch (e: any) {
      set({ error: e.message });
    } finally {
      set({ loading: { ...get().loading, batches: false } });
    }
  },
  
  loadEvents: async (params) => {
    set({ loading: { ...get().loading, events: true } });
    try {
      const events = await api.events.getList(params);
      set({ events });
    } catch (e: any) {
      set({ error: e.message });
    } finally {
      set({ loading: { ...get().loading, events: false } });
    }
  },
  
  loadConfig: async () => {
    set({ loading: { ...get().loading, config: true } });
    try {
      const config = await api.config.get();
      set({ config });
    } catch (e: any) {
      set({ error: e.message });
    } finally {
      set({ loading: { ...get().loading, config: false } });
    }
  },
  
  loadConfigHistory: async (limit?: number) => {
    set({ loading: { ...get().loading, configHistory: true } });
    try {
      const history = await api.config.getHistory(limit);
      set({ configHistory: history });
    } catch (e: any) {
      set({ error: e.message });
    } finally {
      set({ loading: { ...get().loading, configHistory: false } });
    }
  },
  
  loadAll: async () => {
    await Promise.all([
      get().loadBatches(),
      get().loadEvents(),
      get().loadConfig(),
      get().loadConfigHistory(),
    ]);
  },
  
  setLoading: (key, value) => {
    set({ loading: { ...get().loading, [key]: value } });
  },
  
  setError: (error) => set({ error }),
  
  addBatch: (batch) => {
    set({ batches: [...get().batches, batch] });
  },
  
  updateEvent: (event) => {
    set({
      events: get().events.map(e => e.id === event.id ? event : e),
    });
  },
  
  updateConfig: (config) => {
    set({ config });
  },
  
  setConfigHistory: (history) => {
    set({ configHistory: history });
  },
}));
