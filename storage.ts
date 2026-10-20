/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SubtitleCue } from './subtitleConverter.ts';

export interface SubtitleProject {
  id: string;
  title: string;
  kind: 'converted' | 'audio' | 'translated' | 'merged';
  sourceLang: string;
  targetLang: string;
  sourceFormat?: string;
  targetFormat?: string;
  cues: SubtitleCue[];
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = 'khmersub.history.v2';

export function loadSavedProjects(): SubtitleProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveProject(project: Omit<SubtitleProject, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): SubtitleProject {
  const list = loadSavedProjects();
  const now = new Date().toISOString();
  const id = project.id || 'proj_' + Date.now() + Math.random().toString(36).slice(2, 6);

  const existingIndex = list.findIndex(p => p.id === id);
  const fullProject: SubtitleProject = {
    ...project,
    id,
    createdAt: existingIndex >= 0 ? list[existingIndex].createdAt : now,
    updatedAt: now,
  };

  const updated = existingIndex >= 0
    ? list.map(p => p.id === id ? fullProject : p)
    : [fullProject, ...list].slice(0, 100);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('Failed to save project to localStorage', err);
  }

  return fullProject;
}

export function deleteSavedProject(id: string): void {
  const list = loadSavedProjects().filter(p => p.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {}
}
