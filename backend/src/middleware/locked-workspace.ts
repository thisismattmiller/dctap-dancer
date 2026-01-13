import { Request, Response, NextFunction } from 'express';
import { workspaceService } from '../services/database.js';
import { lockedWorkspacesService } from '../services/locked-workspaces.js';
import { AppError } from './error-handler.js';

/**
 * Middleware to check if a workspace is locked before allowing modifications.
 * Used on PUT, POST, DELETE routes for workspace content (shapes, rows, etc.)
 */
export function checkWorkspaceLocked(req: Request, _res: Response, next: NextFunction) {
  const workspaceId = req.params.workspaceId || req.params.id;

  if (!workspaceId) {
    return next();
  }

  // Get workspace to check by name as well
  const workspace = workspaceService.get(workspaceId);
  if (!workspace) {
    // Let the route handler deal with non-existent workspaces
    return next();
  }

  if (lockedWorkspacesService.isLocked(workspaceId, workspace.name)) {
    return next(new AppError(
      403,
      'This workspace is locked and cannot be modified. You can duplicate it to create an editable copy.',
      'WORKSPACE_LOCKED'
    ));
  }

  next();
}

/**
 * Middleware for routes that use :workspaceId param (like starting-point routes)
 */
export function checkWorkspaceLockedById(req: Request, _res: Response, next: NextFunction) {
  const workspaceId = req.params.workspaceId;

  if (!workspaceId) {
    return next();
  }

  const workspace = workspaceService.get(workspaceId);
  if (!workspace) {
    return next();
  }

  if (lockedWorkspacesService.isLocked(workspaceId, workspace.name)) {
    return next(new AppError(
      403,
      'This workspace is locked and cannot be modified. You can duplicate it to create an editable copy.',
      'WORKSPACE_LOCKED'
    ));
  }

  next();
}

/**
 * Middleware specifically for workspace deletion - prevents deleting locked workspaces
 */
export function checkWorkspaceDeleteLocked(req: Request, _res: Response, next: NextFunction) {
  const workspaceId = req.params.id;

  if (!workspaceId) {
    return next();
  }

  const workspace = workspaceService.get(workspaceId);
  if (!workspace) {
    return next();
  }

  if (lockedWorkspacesService.isLocked(workspaceId, workspace.name)) {
    return next(new AppError(
      403,
      'This workspace is locked and cannot be deleted.',
      'WORKSPACE_LOCKED'
    ));
  }

  next();
}
