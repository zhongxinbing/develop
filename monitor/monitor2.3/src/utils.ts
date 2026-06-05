import { ToolConfig } from './types';

export function generateId(prefix = 'tool') {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function buildUserId() {
  const stored = window.localStorage.getItem('eda-qor-user-id');
  if (stored) return stored;
  const id = `user_${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem('eda-qor-user-id', id);
  return id;
}

export function sortDateKeys(keys: string[]) {
  return [...keys].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
}

export function normalizeToolConfig(config: ToolConfig) {
  return {
    ...config,
    extraTags: config.extraTags || [],
    multiThreadPath: config.multiThreadPath || '',
    fetchMultiFunc: config.fetchMultiFunc || '',
    customCurveFunc: config.customCurveFunc || ''
  };
}
