import { Router, Request, Response, NextFunction } from 'express';
import { namespaceService, workspaceService } from '../services/database.js';
import { AppError } from '../middleware/error-handler.js';
import { CreateNamespaceRequest, UpdateNamespaceRequest, ApiResponse } from '../types/dctap.js';

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

// List all namespaces
router.get('/', (req: Request, res: Response) => {
  const namespaces = namespaceService.list(req.params.workspaceId);
  const response: ApiResponse = { success: true, data: namespaces };
  res.json(response);
});

// Get namespace by prefix
router.get('/:prefix', (req: Request, res: Response, next: NextFunction) => {
  const namespace = namespaceService.get(req.params.workspaceId, req.params.prefix);
  if (!namespace) {
    return next(new AppError(404, 'Namespace not found', 'NAMESPACE_NOT_FOUND'));
  }
  const response: ApiResponse = { success: true, data: namespace };
  res.json(response);
});

// Create namespace
router.post('/', (req: Request, res: Response, next: NextFunction) => {
  const { prefix, namespace } = req.body as CreateNamespaceRequest;

  if (!prefix || typeof prefix !== 'string' || prefix.trim().length === 0) {
    return next(new AppError(400, 'Prefix is required', 'INVALID_PREFIX'));
  }

  if (!namespace || typeof namespace !== 'string' || namespace.trim().length === 0) {
    return next(new AppError(400, 'Namespace is required', 'INVALID_NAMESPACE'));
  }

  // Check if prefix already exists
  const existing = namespaceService.get(req.params.workspaceId, prefix.trim());
  if (existing) {
    return next(new AppError(409, 'Prefix already exists', 'PREFIX_EXISTS'));
  }

  const ns = namespaceService.create(req.params.workspaceId, prefix.trim(), namespace.trim());
  const response: ApiResponse = { success: true, data: ns };
  res.status(201).json(response);
});

// Update namespace
router.put('/:prefix', (req: Request, res: Response, next: NextFunction) => {
  const { namespace } = req.body as UpdateNamespaceRequest;

  if (!namespace || typeof namespace !== 'string' || namespace.trim().length === 0) {
    return next(new AppError(400, 'Namespace is required', 'INVALID_NAMESPACE'));
  }

  const ns = namespaceService.update(req.params.workspaceId, req.params.prefix, namespace.trim());
  if (!ns) {
    return next(new AppError(404, 'Namespace not found', 'NAMESPACE_NOT_FOUND'));
  }

  const response: ApiResponse = { success: true, data: ns };
  res.json(response);
});

// Delete namespace
router.delete('/:prefix', (req: Request, res: Response, next: NextFunction) => {
  const deleted = namespaceService.delete(req.params.workspaceId, req.params.prefix);
  if (!deleted) {
    return next(new AppError(404, 'Namespace not found', 'NAMESPACE_NOT_FOUND'));
  }
  const response: ApiResponse = { success: true, data: { deleted: true } };
  res.json(response);
});

export default router;
