import { Router, Request, Response, NextFunction } from 'express';
import { shapeService, workspaceService } from '../services/database.js';
import { AppError } from '../middleware/error-handler.js';
import { checkWorkspaceLocked } from '../middleware/locked-workspace.js';
import { CreateShapeRequest, UpdateShapeRequest, ApiResponse } from '../types/dctap.js';

const router = Router({ mergeParams: true });

// Middleware to check workspace exists
function checkWorkspace(req: Request, _res: Response, next: NextFunction) {
  const workspace = workspaceService.get(req.params.workspaceId);
  if (!workspace) {
    return next(new AppError(404, 'Workspace not found', 'WORKSPACE_NOT_FOUND'));
  }
  next();
}

router.use(checkWorkspace);

// List all shapes in workspace
router.get('/', (req: Request, res: Response) => {
  const shapes = shapeService.list(req.params.workspaceId);
  const response: ApiResponse = { success: true, data: shapes };
  res.json(response);
});

// Get shape by ID
router.get('/:shapeId', (req: Request, res: Response, next: NextFunction) => {
  const shape = shapeService.get(req.params.workspaceId, req.params.shapeId);
  if (!shape) {
    return next(new AppError(404, 'Shape not found', 'SHAPE_NOT_FOUND'));
  }
  const response: ApiResponse = { success: true, data: shape };
  res.json(response);
});

// Create shape (blocked for locked workspaces)
router.post('/', checkWorkspaceLocked, (req: Request, res: Response, next: NextFunction) => {
  const { shapeId, shapeLabel, resourceURI } = req.body as CreateShapeRequest;
  if (!shapeId || typeof shapeId !== 'string' || shapeId.trim().length === 0) {
    return next(new AppError(400, 'Shape ID is required', 'INVALID_SHAPE_ID'));
  }

  // Check if shape already exists
  const existing = shapeService.get(req.params.workspaceId, shapeId.trim());
  if (existing) {
    return next(new AppError(409, 'Shape already exists', 'SHAPE_EXISTS'));
  }

  try {
    const shape = shapeService.create(req.params.workspaceId, shapeId.trim(), shapeLabel?.trim(), resourceURI?.trim());
    const response: ApiResponse = { success: true, data: shape };
    res.status(201).json(response);
  } catch (err) {
    return next(new AppError(500, 'Failed to create shape', 'CREATE_FAILED'));
  }
});

// Update shape (blocked for locked workspaces)
router.put('/:shapeId', checkWorkspaceLocked, (req: Request, res: Response, next: NextFunction) => {
  const updates = req.body as UpdateShapeRequest;

  // Validate new shapeId if provided
  if (updates.shapeId !== undefined) {
    if (typeof updates.shapeId !== 'string' || updates.shapeId.trim().length === 0) {
      return next(new AppError(400, 'Shape ID cannot be empty', 'INVALID_SHAPE_ID'));
    }

    // Check if new shapeId conflicts with existing shape
    if (updates.shapeId !== req.params.shapeId) {
      const existing = shapeService.get(req.params.workspaceId, updates.shapeId.trim());
      if (existing) {
        return next(new AppError(409, 'Shape with that ID already exists', 'SHAPE_EXISTS'));
      }
    }
  }

  const shape = shapeService.update(req.params.workspaceId, req.params.shapeId, {
    shapeId: updates.shapeId?.trim(),
    shapeLabel: updates.shapeLabel?.trim(),
    description: updates.description,
    resourceURI: updates.resourceURI?.trim(),
    folderId: updates.folderId
  });

  if (!shape) {
    return next(new AppError(404, 'Shape not found', 'SHAPE_NOT_FOUND'));
  }

  const response: ApiResponse = { success: true, data: shape };
  res.json(response);
});

// Delete shape (blocked for locked workspaces)
router.delete('/:shapeId', checkWorkspaceLocked, (req: Request, res: Response, next: NextFunction) => {
  // Check for usages
  const usages = shapeService.getUsages(req.params.workspaceId, req.params.shapeId);
  if (usages.length > 0) {
    return next(new AppError(409, `Shape is referenced by: ${usages.join(', ')}`, 'SHAPE_IN_USE', { usages }));
  }

  const deleted = shapeService.delete(req.params.workspaceId, req.params.shapeId);
  if (!deleted) {
    return next(new AppError(404, 'Shape not found', 'SHAPE_NOT_FOUND'));
  }

  const response: ApiResponse = { success: true, data: { deleted: true } };
  res.json(response);
});

// Get shape usages
router.get('/:shapeId/usages', (req: Request, res: Response, next: NextFunction) => {
  const shape = shapeService.get(req.params.workspaceId, req.params.shapeId);
  if (!shape) {
    return next(new AppError(404, 'Shape not found', 'SHAPE_NOT_FOUND'));
  }

  const usages = shapeService.getUsages(req.params.workspaceId, req.params.shapeId);
  const response: ApiResponse = { success: true, data: { usages } };
  res.json(response);
});

// Check if shape exists in target workspace (for warning before copy)
router.get('/:shapeId/exists-in/:targetWorkspaceId', (req: Request, res: Response, next: NextFunction) => {
  const shape = shapeService.get(req.params.workspaceId, req.params.shapeId);
  if (!shape) {
    return next(new AppError(404, 'Shape not found', 'SHAPE_NOT_FOUND'));
  }

  const targetWorkspace = workspaceService.get(req.params.targetWorkspaceId);
  if (!targetWorkspace) {
    return next(new AppError(404, 'Target workspace not found', 'WORKSPACE_NOT_FOUND'));
  }

  const existsInTarget = shapeService.get(req.params.targetWorkspaceId, req.params.shapeId) !== null;
  const response: ApiResponse = { success: true, data: { exists: existsInTarget } };
  res.json(response);
});

// Copy shape to another workspace
router.post('/:shapeId/copy-to/:targetWorkspaceId', (req: Request, res: Response, next: NextFunction) => {
  const shape = shapeService.get(req.params.workspaceId, req.params.shapeId);
  if (!shape) {
    return next(new AppError(404, 'Shape not found', 'SHAPE_NOT_FOUND'));
  }

  const targetWorkspace = workspaceService.get(req.params.targetWorkspaceId);
  if (!targetWorkspace) {
    return next(new AppError(404, 'Target workspace not found', 'WORKSPACE_NOT_FOUND'));
  }

  if (req.params.workspaceId === req.params.targetWorkspaceId) {
    return next(new AppError(400, 'Cannot copy shape to the same workspace', 'SAME_WORKSPACE'));
  }

  try {
    const result = shapeService.copyToWorkspace(
      req.params.workspaceId,
      req.params.shapeId,
      req.params.targetWorkspaceId
    );
    const response: ApiResponse = { success: true, data: result };
    res.json(response);
  } catch (err) {
    return next(new AppError(500, (err as Error).message, 'COPY_FAILED'));
  }
});

export default router;
