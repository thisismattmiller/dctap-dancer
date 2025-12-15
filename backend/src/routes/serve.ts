// Serve routes for Marva profile, starting point JSON, and CSV/TSV exports
// These endpoints serve the data directly (not as downloads)

import { Router, Request, Response, NextFunction } from 'express';
import { workspaceService } from '../services/database.js';
import { exportMarvaProfiles } from '../services/marva-profile.js';
import { exportStartingPoints } from '../services/starting-point.js';
import { exportWorkspace } from '../services/csv-parser.js';
import {
  getCachedMarvaProfile,
  setCachedMarvaProfile,
  getCachedStartingPoints,
  setCachedStartingPoints,
  getCachedCsv,
  setCachedCsv,
  getCachedTsv,
  setCachedTsv,
  getCacheStats
} from '../services/cache.js';
import { AppError } from '../middleware/error-handler.js';
import { ApiResponse } from '../types/dctap.js';

const router = Router();

// List all workspaces available for serving
router.get('/workspaces', (_req: Request, res: Response) => {
  const workspaces = workspaceService.list();

  const workspaceList = workspaces.map(ws => ({
    id: ws.id,
    name: ws.name,
    updatedAt: ws.updatedAt,
    profileUrl: `/api/serve/${ws.id}/profile`,
    startingPointsUrl: `/api/serve/${ws.id}/starting-points`,
    csvUrl: `/api/serve/${ws.id}/csv`,
    tsvUrl: `/api/serve/${ws.id}/tsv`
  }));

  const response: ApiResponse = { success: true, data: workspaceList };
  res.json(response);
});

// Serve Marva profile JSON for a workspace
router.get('/:workspaceId/profile', (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspace = workspaceService.get(req.params.workspaceId);
    if (!workspace) {
      return next(new AppError(404, 'Workspace not found', 'WORKSPACE_NOT_FOUND'));
    }

    // Check cache first
    let profiles = getCachedMarvaProfile(req.params.workspaceId);

    if (!profiles) {
      // Generate and cache
      profiles = exportMarvaProfiles(req.params.workspaceId);
      setCachedMarvaProfile(req.params.workspaceId, profiles);
      console.log(`Marva profile generated and cached for workspace: ${workspace.name}`);
    } else {
      console.log(`Marva profile served from cache for workspace: ${workspace.name}`);
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-cache'); // Let client know to check for updates
    res.json(profiles);
  } catch (err) {
    console.error('Serve profile error:', err);
    return next(new AppError(500, `Failed to serve profile: ${(err as Error).message}`, 'SERVE_FAILED'));
  }
});

// Serve starting points JSON for a workspace
router.get('/:workspaceId/starting-points', (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspace = workspaceService.get(req.params.workspaceId);
    if (!workspace) {
      return next(new AppError(404, 'Workspace not found', 'WORKSPACE_NOT_FOUND'));
    }

    // Check cache first
    let startingPoints = getCachedStartingPoints(req.params.workspaceId);

    if (startingPoints === undefined) {
      // Not in cache - generate and cache
      startingPoints = exportStartingPoints(req.params.workspaceId);
      setCachedStartingPoints(req.params.workspaceId, startingPoints);
      console.log(`Starting points generated and cached for workspace: ${workspace.name}`);
    } else {
      console.log(`Starting points served from cache for workspace: ${workspace.name}`);
    }

    if (!startingPoints) {
      return next(new AppError(404, 'No starting points found in workspace', 'NO_STARTING_POINTS'));
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-cache');
    res.json(startingPoints);
  } catch (err) {
    console.error('Serve starting points error:', err);
    return next(new AppError(500, `Failed to serve starting points: ${(err as Error).message}`, 'SERVE_FAILED'));
  }
});

// Serve CSV export for a workspace
router.get('/:workspaceId/csv', (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspace = workspaceService.get(req.params.workspaceId);
    if (!workspace) {
      return next(new AppError(404, 'Workspace not found', 'WORKSPACE_NOT_FOUND'));
    }

    // Check cache first
    let csv = getCachedCsv(req.params.workspaceId);

    if (!csv) {
      // Generate and cache
      csv = exportWorkspace(req.params.workspaceId, 'csv');
      setCachedCsv(req.params.workspaceId, csv);
      console.log(`CSV generated and cached for workspace: ${workspace.name}`);
    } else {
      console.log(`CSV served from cache for workspace: ${workspace.name}`);
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(csv);
  } catch (err) {
    console.error('Serve CSV error:', err);
    return next(new AppError(500, `Failed to serve CSV: ${(err as Error).message}`, 'SERVE_FAILED'));
  }
});

// Serve TSV export for a workspace
router.get('/:workspaceId/tsv', (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspace = workspaceService.get(req.params.workspaceId);
    if (!workspace) {
      return next(new AppError(404, 'Workspace not found', 'WORKSPACE_NOT_FOUND'));
    }

    // Check cache first
    let tsv = getCachedTsv(req.params.workspaceId);

    if (!tsv) {
      // Generate and cache
      tsv = exportWorkspace(req.params.workspaceId, 'tsv');
      setCachedTsv(req.params.workspaceId, tsv);
      console.log(`TSV generated and cached for workspace: ${workspace.name}`);
    } else {
      console.log(`TSV served from cache for workspace: ${workspace.name}`);
    }

    res.setHeader('Content-Type', 'text/tab-separated-values');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(tsv);
  } catch (err) {
    console.error('Serve TSV error:', err);
    return next(new AppError(500, `Failed to serve TSV: ${(err as Error).message}`, 'SERVE_FAILED'));
  }
});

// Get cache stats (for debugging)
router.get('/cache/stats', (_req: Request, res: Response) => {
  const stats = getCacheStats();
  const response: ApiResponse = { success: true, data: stats };
  res.json(response);
});

export default router;
