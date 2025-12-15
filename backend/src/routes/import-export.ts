import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { workspaceService, rowService } from '../services/database.js';
import { importToWorkspace, exportWorkspace } from '../services/csv-parser.js';
import { validateRow } from '../services/validation.js';
import { AppError } from '../middleware/error-handler.js';
import { ApiResponse, StatementRow } from '../types/dctap.js';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (_req, file, cb) => {
    const allowedMimes = ['text/csv', 'text/tab-separated-values', 'text/plain', 'application/octet-stream'];
    if (allowedMimes.includes(file.mimetype) ||
        file.originalname.endsWith('.csv') ||
        file.originalname.endsWith('.tsv')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV and TSV files are allowed.'));
    }
  }
});

// Import CSV/TSV to create new workspace
router.post('/import', upload.single('file'), (req: Request, res: Response, next: NextFunction) => {
  if (!req.file) {
    return next(new AppError(400, 'No file uploaded', 'NO_FILE'));
  }

  const workspaceName = req.body.name || req.file.originalname.replace(/\.(csv|tsv)$/i, '');

  try {
    const content = req.file.buffer.toString('utf-8');
    const result = importToWorkspace(content, workspaceName);

    if (!result.success) {
      const response: ApiResponse = {
        success: false,
        error: 'Import failed due to validation errors',
        code: 'IMPORT_VALIDATION_FAILED',
        details: { errors: result.errors }
      };
      return res.status(400).json(response);
    }

    const response: ApiResponse = {
      success: true,
      data: {
        workspaceId: result.workspaceId,
        shapesCreated: result.shapesCreated,
        rowsImported: result.rowsImported,
        warnings: result.warnings,
        unknownNamespaces: result.unknownNamespaces
      }
    };
    res.status(201).json(response);
  } catch (err) {
    return next(new AppError(500, 'Failed to import file', 'IMPORT_FAILED'));
  }
});

// Export workspace to CSV/TSV
router.get('/workspaces/:id/export', (req: Request, res: Response, next: NextFunction) => {
  const workspace = workspaceService.get(req.params.id);
  if (!workspace) {
    return next(new AppError(404, 'Workspace not found', 'WORKSPACE_NOT_FOUND'));
  }

  const format = req.query.format === 'tsv' ? 'tsv' : 'csv';
  const content = exportWorkspace(req.params.id, format);

  const filename = `${workspace.name.replace(/[^a-zA-Z0-9-_]/g, '_')}.${format}`;
  res.setHeader('Content-Type', format === 'tsv' ? 'text/tab-separated-values' : 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(content);
});

// Validate a single row and save errors to database
router.post('/validate/row', (req: Request, res: Response, next: NextFunction) => {
  const { workspaceId, row, shapeId } = req.body as { workspaceId: string; row: Partial<StatementRow>; shapeId?: string };

  if (!workspaceId) {
    return next(new AppError(400, 'Workspace ID is required', 'INVALID_WORKSPACE'));
  }

  const workspace = workspaceService.get(workspaceId);
  if (!workspace) {
    return next(new AppError(404, 'Workspace not found', 'WORKSPACE_NOT_FOUND'));
  }

  const result = validateRow(workspaceId, row);

  // If row has an ID and shapeId is provided, save the error state to the database
  if (row.id && shapeId) {
    const hasErrors = result.errors.length > 0;
    const errorDetails = hasErrors ? JSON.stringify(result.errors) : null;
    rowService.updateErrors(workspaceId, shapeId, row.id, hasErrors, errorDetails);
  }

  const response: ApiResponse = { success: true, data: result };
  res.json(response);
});

export default router;
