import axios from 'axios';
import { ToolConfig, ToolConfigRecord, SingleThreadToolData, MultiThreadToolData } from './types';

const api = axios.create({ baseURL: '/api' });

export async function fetchTools(userId: string) {
  const response = await api.get<ToolConfigRecord>(`/tools`, { params: { userId } });
  return response.data;
}

export async function saveTool(userId: string, config: ToolConfig) {
  const response = await api.post<ToolConfig>(`/tools`, { userId, config });
  return response.data;
}

export async function fetchToolData(userId: string, toolId: string) {
  const response = await api.get<{ single?: SingleThreadToolData; multi?: MultiThreadToolData }>(`/tools/${toolId}/data`, {
    params: { userId }
  });
  return response.data;
}

export async function fetchCachedToolData(userId: string, toolId: string) {
  const response = await api.get(`/tools/${toolId}/cache`, { params: { userId } });
  return response.data;
}

export async function saveToolCache(userId: string, toolId: string, payload: unknown) {
  const response = await api.post(`/tools/${toolId}/cache`, { userId, payload });
  return response.data;
}

export async function ensureToolDataExists(userId: string, toolId: string) {
  const response = await api.post(`/tools/${toolId}/ensure`, { userId });
  return response.data;
}

export async function compareMetrics(userId: string, toolId: string, payload: unknown) {
  const response = await api.post(`/tools/${toolId}/compare`, { userId, payload });
  return response.data;
}
