import fs from 'fs';
import path from 'path';

const root = path.resolve('./data');

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function ensureUserDirectory(userId) {
  const userDir = path.join(root, userId);
  ensureDirectory(userDir);
  return userDir;
}

export function readJson(filepath, fallback = {}) {
  try {
    const content = fs.readFileSync(filepath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    return fallback;
  }
}

export function writeJson(filepath, content) {
  ensureDirectory(path.dirname(filepath));
  fs.writeFileSync(filepath, JSON.stringify(content, null, 2), 'utf-8');
}

export function resolveToolConfigPath(userId) {
  return path.join(ensureUserDirectory(userId), 'tools.json');
}

export function resolveToolDataPath(userId, toolId) {
  return path.join(ensureUserDirectory(userId), `${toolId}-data.json`);
}

export function resolveToolCachePath(userId, toolId) {
  return path.join(ensureUserDirectory(userId), `${toolId}-cache.json`);
}
