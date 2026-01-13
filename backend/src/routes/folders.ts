import { Router, Request, Response, NextFunction } from 'express';
import { folderService } from '../services/database.js';
import { AppError } from '../middleware/error-handler.js';
import { checkWorkspaceLocked } from '../middleware/locked-workspace.js';
import { ApiResponse, CreateFolderRequest, UpdateFolderRequest } from '../types/dctap.js';

const router = Router({ mergeParams: true });

// List all folders
router.get('/', (req: Request, res: Response) => {
  const folders = folderService.list(req.params.workspaceId);
  const response: ApiResponse = { success: true, data: folders };
  res.json(response);
});

// Get single folder
router.get('/:folderId', (req: Request, res: Response, next: NextFunction) => {
  const folderId = parseInt(req.params.folderId, 10);
  if (isNaN(folderId)) {
    return next(new AppError(400, 'Invalid folder ID', 'INVALID_FOLDER_ID'));
  }

  const folder = folderService.get(req.params.workspaceId, folderId);
  if (!folder) {
    return next(new AppError(404, 'Folder not found', 'FOLDER_NOT_FOUND'));
  }

  const response: ApiResponse = { success: true, data: folder };
  res.json(response);
});

// Create folder (blocked for locked workspaces)
router.post('/', checkWorkspaceLocked, (req: Request, res: Response, next: NextFunction) => {
  const { name } = req.body as CreateFolderRequest;
  if (!name || !name.trim()) {
    return next(new AppError(400, 'Folder name is required', 'INVALID_NAME'));
  }

  const folder = folderService.create(req.params.workspaceId, name.trim());
  const response: ApiResponse = { success: true, data: folder };
  res.status(201).json(response);
});

// Update folder (blocked for locked workspaces)
router.put('/:folderId', checkWorkspaceLocked, (req: Request, res: Response, next: NextFunction) => {
  const folderId = parseInt(req.params.folderId, 10);
  if (isNaN(folderId)) {
    return next(new AppError(400, 'Invalid folder ID', 'INVALID_FOLDER_ID'));
  }

  const { name } = req.body as UpdateFolderRequest;
  if (!name || !name.trim()) {
    return next(new AppError(400, 'Folder name is required', 'INVALID_NAME'));
  }

  const folder = folderService.update(req.params.workspaceId, folderId, name.trim());
  if (!folder) {
    return next(new AppError(404, 'Folder not found', 'FOLDER_NOT_FOUND'));
  }

  const response: ApiResponse = { success: true, data: folder };
  res.json(response);
});

// Delete folder (blocked for locked workspaces)
router.delete('/:folderId', checkWorkspaceLocked, (req: Request, res: Response, next: NextFunction) => {
  const folderId = parseInt(req.params.folderId, 10);
  if (isNaN(folderId)) {
    return next(new AppError(400, 'Invalid folder ID', 'INVALID_FOLDER_ID'));
  }

  const deleted = folderService.delete(req.params.workspaceId, folderId);
  if (!deleted) {
    return next(new AppError(404, 'Folder not found', 'FOLDER_NOT_FOUND'));
  }

  const response: ApiResponse = { success: true, data: { deleted: true } };
  res.json(response);
});

export default router;
