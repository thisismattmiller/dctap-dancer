// Cache service for Marva profile, starting point JSON, and CSV/TSV exports

import { MarvaProfileDocument } from '../types/marva-profile.js';
import { StartingPointFile } from '../types/starting-point.js';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

// In-memory cache for Marva profiles
const marvaProfileCache = new Map<string, CacheEntry<MarvaProfileDocument[]>>();

// In-memory cache for starting points
const startingPointCache = new Map<string, CacheEntry<StartingPointFile | null>>();

// In-memory cache for CSV exports (keyed by workspaceId)
const csvCache = new Map<string, CacheEntry<string>>();

// In-memory cache for TSV exports (keyed by workspaceId)
const tsvCache = new Map<string, CacheEntry<string>>();

/**
 * Get cached Marva profile for a workspace
 */
export function getCachedMarvaProfile(workspaceId: string): MarvaProfileDocument[] | null {
  const entry = marvaProfileCache.get(workspaceId);
  return entry?.data ?? null;
}

/**
 * Set cached Marva profile for a workspace
 */
export function setCachedMarvaProfile(workspaceId: string, data: MarvaProfileDocument[]): void {
  marvaProfileCache.set(workspaceId, {
    data,
    timestamp: Date.now()
  });
}

/**
 * Get cached starting points for a workspace
 */
export function getCachedStartingPoints(workspaceId: string): StartingPointFile | null | undefined {
  const entry = startingPointCache.get(workspaceId);
  // Return undefined if not in cache, null if cached but no starting points
  return entry === undefined ? undefined : entry.data;
}

/**
 * Set cached starting points for a workspace
 */
export function setCachedStartingPoints(workspaceId: string, data: StartingPointFile | null): void {
  startingPointCache.set(workspaceId, {
    data,
    timestamp: Date.now()
  });
}

/**
 * Get cached CSV export for a workspace
 */
export function getCachedCsv(workspaceId: string): string | null {
  const entry = csvCache.get(workspaceId);
  return entry?.data ?? null;
}

/**
 * Set cached CSV export for a workspace
 */
export function setCachedCsv(workspaceId: string, data: string): void {
  csvCache.set(workspaceId, {
    data,
    timestamp: Date.now()
  });
}

/**
 * Get cached TSV export for a workspace
 */
export function getCachedTsv(workspaceId: string): string | null {
  const entry = tsvCache.get(workspaceId);
  return entry?.data ?? null;
}

/**
 * Set cached TSV export for a workspace
 */
export function setCachedTsv(workspaceId: string, data: string): void {
  tsvCache.set(workspaceId, {
    data,
    timestamp: Date.now()
  });
}

/**
 * Invalidate cache for a specific workspace
 * Called when workspace data changes
 */
export function invalidateWorkspaceCache(workspaceId: string): void {
  marvaProfileCache.delete(workspaceId);
  startingPointCache.delete(workspaceId);
  csvCache.delete(workspaceId);
  tsvCache.delete(workspaceId);
  console.log(`Cache invalidated for workspace: ${workspaceId}`);
}

/**
 * Invalidate all caches
 */
export function invalidateAllCaches(): void {
  marvaProfileCache.clear();
  startingPointCache.clear();
  csvCache.clear();
  tsvCache.clear();
  console.log('All caches invalidated');
}

/**
 * Get cache stats for debugging
 */
export function getCacheStats(): { marvaProfiles: number; startingPoints: number; csv: number; tsv: number } {
  return {
    marvaProfiles: marvaProfileCache.size,
    startingPoints: startingPointCache.size,
    csv: csvCache.size,
    tsv: tsvCache.size
  };
}
