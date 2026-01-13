import { Router, Request, Response, NextFunction } from 'express';
import { workspaceService, optionsService } from '../services/database.js';
import { lockedWorkspacesService } from '../services/locked-workspaces.js';
import { AppError } from '../middleware/error-handler.js';
import { checkWorkspaceDeleteLocked } from '../middleware/locked-workspace.js';
import { CreateWorkspaceRequest, UpdateWorkspaceRequest, ApiResponse, WorkspaceOptions } from '../types/dctap.js';

const router = Router();

// List all workspaces (includes locked status)
router.get('/', (_req: Request, res: Response) => {
  const workspaces = workspaceService.list();
  const workspacesWithLockStatus = workspaces.map(ws => ({
    ...ws,
    isLocked: lockedWorkspacesService.isLocked(ws.id, ws.name)
  }));
  const response: ApiResponse = { success: true, data: workspacesWithLockStatus };
  res.json(response);
});

// Get workspace by ID (includes locked status)
router.get('/:id', (req: Request, res: Response, next: NextFunction) => {
  const workspace = workspaceService.get(req.params.id);
  if (!workspace) {
    return next(new AppError(404, 'Workspace not found', 'WORKSPACE_NOT_FOUND'));
  }
  const workspaceWithLockStatus = {
    ...workspace,
    isLocked: lockedWorkspacesService.isLocked(workspace.id, workspace.name)
  };
  const response: ApiResponse = { success: true, data: workspaceWithLockStatus };
  res.json(response);
});

// Get workspace updated_at timestamp (for polling)
router.get('/:id/updated-at', (req: Request, res: Response, next: NextFunction) => {
  const updatedAt = workspaceService.getUpdatedAt(req.params.id);
  if (updatedAt === null) {
    return next(new AppError(404, 'Workspace not found', 'WORKSPACE_NOT_FOUND'));
  }
  const response: ApiResponse = { success: true, data: { updatedAt } };
  res.json(response);
});

// Create workspace
router.post('/', (req: Request, res: Response, next: NextFunction) => {
  const { name } = req.body as CreateWorkspaceRequest;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return next(new AppError(400, 'Workspace name is required', 'INVALID_NAME'));
  }
  const workspace = workspaceService.create(name.trim());
  const response: ApiResponse = { success: true, data: workspace };
  res.status(201).json(response);
});

// Update workspace (blocked for locked workspaces)
router.put('/:id', checkWorkspaceDeleteLocked, (req: Request, res: Response, next: NextFunction) => {
  const { name } = req.body as UpdateWorkspaceRequest;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return next(new AppError(400, 'Workspace name is required', 'INVALID_NAME'));
  }
  const workspace = workspaceService.update(req.params.id, name.trim());
  if (!workspace) {
    return next(new AppError(404, 'Workspace not found', 'WORKSPACE_NOT_FOUND'));
  }
  const response: ApiResponse = { success: true, data: workspace };
  res.json(response);
});

// Delete workspace (blocked for locked workspaces)
router.delete('/:id', checkWorkspaceDeleteLocked, (req: Request, res: Response, next: NextFunction) => {
  const deleted = workspaceService.delete(req.params.id);
  if (!deleted) {
    return next(new AppError(404, 'Workspace not found', 'WORKSPACE_NOT_FOUND'));
  }
  const response: ApiResponse = { success: true, data: { deleted: true } };
  res.json(response);
});

// Duplicate workspace
router.post('/:id/duplicate', (req: Request, res: Response, next: NextFunction) => {
  const { name } = req.body as CreateWorkspaceRequest;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return next(new AppError(400, 'New workspace name is required', 'INVALID_NAME'));
  }
  const workspace = workspaceService.duplicate(req.params.id, name.trim());
  if (!workspace) {
    return next(new AppError(404, 'Workspace not found', 'WORKSPACE_NOT_FOUND'));
  }
  const response: ApiResponse = { success: true, data: workspace };
  res.status(201).json(response);
});

// Get workspace options
router.get('/:id/options', (req: Request, res: Response, next: NextFunction) => {
  const workspace = workspaceService.get(req.params.id);
  if (!workspace) {
    return next(new AppError(404, 'Workspace not found', 'WORKSPACE_NOT_FOUND'));
  }
  const options = optionsService.get(req.params.id);
  const response: ApiResponse = { success: true, data: options };
  res.json(response);
});

// Update workspace options (blocked for locked workspaces)
router.put('/:id/options', checkWorkspaceDeleteLocked, (req: Request, res: Response, next: NextFunction) => {
  const workspace = workspaceService.get(req.params.id);
  if (!workspace) {
    return next(new AppError(404, 'Workspace not found', 'WORKSPACE_NOT_FOUND'));
  }
  const updates = req.body as Partial<WorkspaceOptions>;
  const options = optionsService.update(req.params.id, updates);
  const response: ApiResponse = { success: true, data: options };
  res.json(response);
});

export default router;
