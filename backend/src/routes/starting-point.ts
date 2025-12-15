import { Router, Request, Response, NextFunction } from 'express';
import {
  importStartingPoints,
  exportStartingPoints,
  hasStartingPoints
} from '../services/starting-point.js';
import { AppError } from '../middleware/error-handler.js';
import { ApiResponse } from '../types/dctap.js';
import { StartingPointFile } from '../types/starting-point.js';
import { workspaceService } from '../services/database.js';

const router = Router();

// Import LC Starting Point JSON into a workspace
router.post('/import/:workspaceId', (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspace = workspaceService.get(req.params.workspaceId);
    if (!workspace) {
      return next(new AppError(404, 'Workspace not found', 'WORKSPACE_NOT_FOUND'));
    }

    const data = req.body as StartingPointFile;

    if (!Array.isArray(data) || data.length === 0) {
      return next(new AppError(400, 'Invalid starting point file format', 'INVALID_FORMAT'));
    }

    const result = importStartingPoints(req.params.workspaceId, data);
    const response: ApiResponse = { success: true, data: result };
    res.status(201).json(response);
  } catch (err) {
    console.error('Starting point import error:', err);
    return next(new AppError(500, `Failed to import starting points: ${(err as Error).message}`, 'IMPORT_FAILED'));
  }
});

// Export starting points from a workspace
router.get('/export/:workspaceId', (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspace = workspaceService.get(req.params.workspaceId);
    if (!workspace) {
      return next(new AppError(404, 'Workspace not found', 'WORKSPACE_NOT_FOUND'));
    }

    const startingPoints = exportStartingPoints(req.params.workspaceId);

    if (!startingPoints) {
      return next(new AppError(404, 'No starting points found in workspace', 'NO_STARTING_POINTS'));
    }

    // Set content disposition for download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${workspace.name.replace(/[^a-zA-Z0-9]/g, '_')}_starting_points.json"`
    );

    res.json(startingPoints);
  } catch (err) {
    console.error('Starting point export error:', err);
    return next(new AppError(500, `Failed to export starting points: ${(err as Error).message}`, 'EXPORT_FAILED'));
  }
});

// Check if workspace has starting points
router.get('/has/:workspaceId', (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspace = workspaceService.get(req.params.workspaceId);
    if (!workspace) {
      return next(new AppError(404, 'Workspace not found', 'WORKSPACE_NOT_FOUND'));
    }

    const has = hasStartingPoints(req.params.workspaceId);
    const response: ApiResponse = { success: true, data: { hasStartingPoints: has } };
    res.json(response);
  } catch (err) {
    return next(new AppError(500, `Failed to check starting points: ${(err as Error).message}`, 'CHECK_FAILED'));
  }
});

export default router;
