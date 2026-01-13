import { Router, Request, Response, NextFunction } from 'express';
import { rowService, shapeService, workspaceService } from '../services/database.js';
import { AppError } from '../middleware/error-handler.js';
import { checkWorkspaceLocked } from '../middleware/locked-workspace.js';
import { CreateRowRequest, UpdateRowRequest, BulkUpdateRowsRequest, ApiResponse } from '../types/dctap.js';

const router = Router({ mergeParams: true });

// Middleware to check workspace and shape exist
function checkWorkspaceAndShape(req: Request, _res: Response, next: NextFunction) {
  const workspace = workspaceService.get(req.params.workspaceId);
  if (!workspace) {
    return next(new AppError(404, 'Workspace not found', 'WORKSPACE_NOT_FOUND'));
  }

  const shape = shapeService.get(req.params.workspaceId, req.params.shapeId);
  if (!shape) {
    return next(new AppError(404, 'Shape not found', 'SHAPE_NOT_FOUND'));
  }

  next();
}

router.use(checkWorkspaceAndShape);

// List all rows
router.get('/', (req: Request, res: Response) => {
  const rows = rowService.list(req.params.workspaceId, req.params.shapeId);
  const response: ApiResponse = { success: true, data: rows };
  res.json(response);
});

// Get single row
router.get('/:rowId', (req: Request, res: Response, next: NextFunction) => {
  const rowId = parseInt(req.params.rowId, 10);
  if (isNaN(rowId)) {
    return next(new AppError(400, 'Invalid row ID', 'INVALID_ROW_ID'));
  }

  const row = rowService.get(req.params.workspaceId, req.params.shapeId, rowId);
  if (!row) {
    return next(new AppError(404, 'Row not found', 'ROW_NOT_FOUND'));
  }

  const response: ApiResponse = { success: true, data: row };
  res.json(response);
});

// Create row (blocked for locked workspaces)
router.post('/', checkWorkspaceLocked, (req: Request, res: Response) => {
  const data = req.body as CreateRowRequest;
  const row = rowService.create(req.params.workspaceId, req.params.shapeId, data);
  const response: ApiResponse = { success: true, data: row };
  res.status(201).json(response);
});

// Update single row (blocked for locked workspaces)
router.put('/:rowId', checkWorkspaceLocked, (req: Request, res: Response, next: NextFunction) => {
  const rowId = parseInt(req.params.rowId, 10);
  if (isNaN(rowId)) {
    return next(new AppError(400, 'Invalid row ID', 'INVALID_ROW_ID'));
  }

  const data = req.body as UpdateRowRequest;
  const row = rowService.update(req.params.workspaceId, req.params.shapeId, rowId, data);
  if (!row) {
    return next(new AppError(404, 'Row not found', 'ROW_NOT_FOUND'));
  }

  const response: ApiResponse = { success: true, data: row };
  res.json(response);
});

// Bulk update rows (for paste operations, reordering) - blocked for locked workspaces
router.put('/', checkWorkspaceLocked, (req: Request, res: Response, next: NextFunction) => {
  const { rows } = req.body as BulkUpdateRowsRequest;
  if (!Array.isArray(rows)) {
    return next(new AppError(400, 'Rows array is required', 'INVALID_ROWS'));
  }

  const updatedRows = rowService.bulkUpdate(req.params.workspaceId, req.params.shapeId, rows);
  const response: ApiResponse = { success: true, data: updatedRows };
  res.json(response);
});

// Delete single row (blocked for locked workspaces)
router.delete('/:rowId', checkWorkspaceLocked, (req: Request, res: Response, next: NextFunction) => {
  const rowId = parseInt(req.params.rowId, 10);
  if (isNaN(rowId)) {
    return next(new AppError(400, 'Invalid row ID', 'INVALID_ROW_ID'));
  }

  const deleted = rowService.delete(req.params.workspaceId, req.params.shapeId, rowId);
  if (!deleted) {
    return next(new AppError(404, 'Row not found', 'ROW_NOT_FOUND'));
  }

  const response: ApiResponse = { success: true, data: { deleted: true } };
  res.json(response);
});

// Bulk delete rows (blocked for locked workspaces)
router.delete('/', checkWorkspaceLocked, (req: Request, res: Response, next: NextFunction) => {
  const { rowIds } = req.body as { rowIds: number[] };
  if (!Array.isArray(rowIds) || rowIds.length === 0) {
    return next(new AppError(400, 'Row IDs array is required', 'INVALID_ROW_IDS'));
  }

  const validIds = rowIds.filter(id => typeof id === 'number' && !isNaN(id));
  if (validIds.length === 0) {
    return next(new AppError(400, 'No valid row IDs provided', 'INVALID_ROW_IDS'));
  }

  const deletedCount = rowService.bulkDelete(req.params.workspaceId, req.params.shapeId, validIds);
  const response: ApiResponse = { success: true, data: { deletedCount } };
  res.json(response);
});

// Reorder rows (blocked for locked workspaces)
router.post('/reorder', checkWorkspaceLocked, (req: Request, res: Response, next: NextFunction) => {
  const { rowIds } = req.body as { rowIds: number[] };
  if (!Array.isArray(rowIds) || rowIds.length === 0) {
    return next(new AppError(400, 'Row IDs array is required', 'INVALID_ROW_IDS'));
  }

  const validIds = rowIds.filter(id => typeof id === 'number' && !isNaN(id));
  if (validIds.length === 0) {
    return next(new AppError(400, 'No valid row IDs provided', 'INVALID_ROW_IDS'));
  }

  rowService.reorder(req.params.workspaceId, req.params.shapeId, validIds);
  const response: ApiResponse = { success: true, data: { reordered: true } };
  res.json(response);
});

export default router;
