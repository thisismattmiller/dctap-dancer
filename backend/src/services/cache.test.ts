import { describe, it, expect, beforeEach } from 'vitest';
import {
  getCachedMarvaProfile,
  setCachedMarvaProfile,
  getCachedStartingPoints,
  setCachedStartingPoints,
  getCachedCsv,
  setCachedCsv,
  getCachedTsv,
  setCachedTsv,
  invalidateWorkspaceCache,
  invalidateAllCaches,
  getCacheStats
} from './cache.js';

describe('Cache Service', () => {
  beforeEach(() => {
    // Clear all caches before each test
    invalidateAllCaches();
  });

  describe('Marva Profile Cache', () => {
    it('should return null for uncached workspace', () => {
      const result = getCachedMarvaProfile('non-existent-workspace');
      expect(result).toBeNull();
    });

    it('should cache and retrieve Marva profile', () => {
      const testProfiles = [{ id: 'test', Profile: {}, resourceTemplates: [] }];
      setCachedMarvaProfile('workspace-1', testProfiles as never);

      const result = getCachedMarvaProfile('workspace-1');
      expect(result).toEqual(testProfiles);
    });

    it('should update cache stats when profile is cached', () => {
      const testProfiles = [{ id: 'test', Profile: {}, resourceTemplates: [] }];
      setCachedMarvaProfile('workspace-1', testProfiles as never);

      const stats = getCacheStats();
      expect(stats.marvaProfiles).toBe(1);
    });
  });

  describe('Starting Points Cache', () => {
    it('should return undefined for uncached workspace', () => {
      const result = getCachedStartingPoints('non-existent-workspace');
      expect(result).toBeUndefined();
    });

    it('should cache and retrieve starting points', () => {
      const testStartingPoints = [{ id: 'test', name: 'config', configType: 'startingPoints' as const, json: [] }];
      setCachedStartingPoints('workspace-1', testStartingPoints);

      const result = getCachedStartingPoints('workspace-1');
      expect(result).toEqual(testStartingPoints);
    });

    it('should cache null starting points (workspace with no starting points)', () => {
      setCachedStartingPoints('workspace-1', null);

      const result = getCachedStartingPoints('workspace-1');
      expect(result).toBeNull();
    });

    it('should differentiate between uncached and cached null', () => {
      // Uncached should be undefined
      expect(getCachedStartingPoints('uncached')).toBeUndefined();

      // Cached null should be null
      setCachedStartingPoints('cached-null', null);
      expect(getCachedStartingPoints('cached-null')).toBeNull();
    });
  });

  describe('CSV Cache', () => {
    it('should return null for uncached workspace', () => {
      const result = getCachedCsv('non-existent-workspace');
      expect(result).toBeNull();
    });

    it('should cache and retrieve CSV', () => {
      const testCsv = 'shapeID,shapeLabel,propertyID\ntest,Test Shape,dcterms:title';
      setCachedCsv('workspace-1', testCsv);

      const result = getCachedCsv('workspace-1');
      expect(result).toBe(testCsv);
    });

    it('should update cache stats when CSV is cached', () => {
      setCachedCsv('workspace-1', 'test csv content');

      const stats = getCacheStats();
      expect(stats.csv).toBe(1);
    });
  });

  describe('TSV Cache', () => {
    it('should return null for uncached workspace', () => {
      const result = getCachedTsv('non-existent-workspace');
      expect(result).toBeNull();
    });

    it('should cache and retrieve TSV', () => {
      const testTsv = 'shapeID\tshapeLabel\tpropertyID\ntest\tTest Shape\tdcterms:title';
      setCachedTsv('workspace-1', testTsv);

      const result = getCachedTsv('workspace-1');
      expect(result).toBe(testTsv);
    });

    it('should update cache stats when TSV is cached', () => {
      setCachedTsv('workspace-1', 'test tsv content');

      const stats = getCacheStats();
      expect(stats.tsv).toBe(1);
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate all caches for a specific workspace', () => {
      // Set up caches for workspace-1
      setCachedMarvaProfile('workspace-1', [] as never);
      setCachedStartingPoints('workspace-1', null);
      setCachedCsv('workspace-1', 'csv content');
      setCachedTsv('workspace-1', 'tsv content');

      // Set up caches for workspace-2
      setCachedMarvaProfile('workspace-2', [] as never);
      setCachedCsv('workspace-2', 'csv content 2');

      // Verify initial state
      expect(getCacheStats()).toEqual({
        marvaProfiles: 2,
        startingPoints: 1,
        csv: 2,
        tsv: 1
      });

      // Invalidate workspace-1 only
      invalidateWorkspaceCache('workspace-1');

      // workspace-1 caches should be cleared
      expect(getCachedMarvaProfile('workspace-1')).toBeNull();
      expect(getCachedStartingPoints('workspace-1')).toBeUndefined();
      expect(getCachedCsv('workspace-1')).toBeNull();
      expect(getCachedTsv('workspace-1')).toBeNull();

      // workspace-2 caches should still exist
      expect(getCachedMarvaProfile('workspace-2')).toEqual([]);
      expect(getCachedCsv('workspace-2')).toBe('csv content 2');
    });

    it('should invalidate all caches across all workspaces', () => {
      // Set up caches for multiple workspaces
      setCachedMarvaProfile('workspace-1', [] as never);
      setCachedMarvaProfile('workspace-2', [] as never);
      setCachedCsv('workspace-1', 'csv content');
      setCachedTsv('workspace-2', 'tsv content');

      // Verify initial state
      expect(getCacheStats()).toEqual({
        marvaProfiles: 2,
        startingPoints: 0,
        csv: 1,
        tsv: 1
      });

      // Invalidate all
      invalidateAllCaches();

      // All caches should be cleared
      expect(getCacheStats()).toEqual({
        marvaProfiles: 0,
        startingPoints: 0,
        csv: 0,
        tsv: 0
      });
    });
  });

  describe('Cache Stats', () => {
    it('should return correct stats for empty caches', () => {
      const stats = getCacheStats();
      expect(stats).toEqual({
        marvaProfiles: 0,
        startingPoints: 0,
        csv: 0,
        tsv: 0
      });
    });

    it('should return correct stats for populated caches', () => {
      setCachedMarvaProfile('ws-1', [] as never);
      setCachedMarvaProfile('ws-2', [] as never);
      setCachedMarvaProfile('ws-3', [] as never);
      setCachedStartingPoints('ws-1', null);
      setCachedStartingPoints('ws-2', []);
      setCachedCsv('ws-1', 'csv');
      setCachedTsv('ws-1', 'tsv');
      setCachedTsv('ws-2', 'tsv');

      const stats = getCacheStats();
      expect(stats).toEqual({
        marvaProfiles: 3,
        startingPoints: 2,
        csv: 1,
        tsv: 2
      });
    });
  });
});
