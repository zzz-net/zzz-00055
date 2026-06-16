import { create } from 'zustand';
import { Batch, Event, Config, EventStatus, ConfigHistory, BackupRecord, RollbackPoint, AuditLog, UserRole } from '../../shared/types';
import { api } from '../api/client';

interface AppState {
  batches: Batch[];
  events: Event[];
  config: Config | null;
  configHistory: ConfigHistory[];
  loading: Record<string, boolean>;
  error: string | null;

  currentUser: { username: string; role: UserRole };
  backupPermissions: {
    canView: boolean;
    canCreate: boolean;
    canRestore: boolean;
    canRollback: boolean;
    canDelete: boolean;
  };
  backups: BackupRecord[];
  rollbackPoints: RollbackPoint[];
  auditLogs: AuditLog[];
  
  loadBatches: () => Promise<void>;
  loadEvents: (params?: { status?: EventStatus; batchId?: string }) => Promise<void>;
  loadConfig: () => Promise<void>;
  loadConfigHistory: (limit?: number) => Promise<void>;
  loadAll: () => Promise<void>;

  loadPermissions: () => Promise<void>;
  loadBackups: () => Promise<void>;
  loadRollbackPoints: () => Promise<void>;
  loadAuditLogs: (limit?: number) => Promise<void>;
  
  setLoading: (key: string, value: boolean) => void;
  setError: (error: string | null) => void;
  
  addBatch: (batch: Batch) => void;
  updateEvent: (event: Event) => void;
  updateConfig: (config: Config) => void;
  setConfigHistory: (history: ConfigHistory[]) => void;

  addBackup: (backup: BackupRecord) => void;
  removeBackup: (id: string) => void;
  setCurrentUserRole: (role: UserRole) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  batches: [],
  events: [],
  config: null,
  configHistory: [],
  loading: {},
  error: null,

  currentUser: { username: 'admin', role: 'admin' },
  backupPermissions: {
    canView: true,
    canCreate: true,
    canRestore: true,
    canRollback: true,
    canDelete: true,
  },
  backups: [],
  rollbackPoints: [],
  auditLogs: [],
  
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

  loadPermissions: async () => {
    set({ loading: { ...get().loading, permissions: true } });
    try {
      const res = await api.backup.getPermissions();
      set({
        currentUser: res.user,
        backupPermissions: res.permissions,
      });
    } catch (e: any) {
      set({ error: e.message });
    } finally {
      set({ loading: { ...get().loading, permissions: false } });
    }
  },

  loadBackups: async () => {
    set({ loading: { ...get().loading, backups: true } });
    try {
      const res = await api.backup.list();
      set({ backups: res.backups });
    } catch (e: any) {
      set({ error: e.message });
    } finally {
      set({ loading: { ...get().loading, backups: false } });
    }
  },

  loadRollbackPoints: async () => {
    set({ loading: { ...get().loading, rollbackPoints: true } });
    try {
      const res = await api.backup.rollbackList();
      set({ rollbackPoints: res.rollbackPoints });
    } catch (e: any) {
      set({ error: e.message });
    } finally {
      set({ loading: { ...get().loading, rollbackPoints: false } });
    }
  },

  loadAuditLogs: async (limit?: number) => {
    set({ loading: { ...get().loading, auditLogs: true } });
    try {
      const res = await api.backup.auditLogs(limit);
      set({ auditLogs: res.logs });
    } catch (e: any) {
      set({ error: e.message });
    } finally {
      set({ loading: { ...get().loading, auditLogs: false } });
    }
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

  addBackup: (backup) => {
    set({ backups: [backup, ...get().backups] });
  },

  removeBackup: (id) => {
    set({ backups: get().backups.filter(b => b.id !== id) });
  },

  setCurrentUserRole: (role: UserRole) => {
    const user = { ...get().currentUser, role };
    localStorage.setItem('user_role', role);
    localStorage.setItem('user_name', user.username);
    set({ currentUser: user });
  },
}));
