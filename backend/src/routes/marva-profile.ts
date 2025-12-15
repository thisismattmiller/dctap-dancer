import { Router, Request, Response, NextFunction } from 'express';
import { importMarvaProfiles, exportMarvaProfiles } from '../services/marva-profile.js';
import { AppError } from '../middleware/error-handler.js';
import { ApiResponse } from '../types/dctap.js';
import { MarvaProfileDocument, ImportMarvaProfileRequest } from '../types/marva-profile.js';
import { workspaceService } from '../services/database.js';

const router = Router();

// Import Marva Profile JSON
router.post('/import', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { workspaceName, profiles } = req.body as ImportMarvaProfileRequest;

    if (!workspaceName || typeof workspaceName !== 'string' || workspaceName.trim().length === 0) {
      return next(new AppError(400, 'Workspace name is required', 'INVALID_WORKSPACE_NAME'));
    }

    if (!profiles || !Array.isArray(profiles) || profiles.length === 0) {
      return next(new AppError(400, 'At least one profile is required', 'INVALID_PROFILES'));
    }

    // Validate profile structure
    for (const profile of profiles) {
      if (!profile.json?.Profile) {
        return next(new AppError(400, 'Invalid profile structure: missing json.Profile', 'INVALID_PROFILE_STRUCTURE'));
      }
    }

    const result = importMarvaProfiles(workspaceName.trim(), profiles);
    const response: ApiResponse = { success: true, data: result };
    res.status(201).json(response);
  } catch (err) {
    console.error('Import error:', err);
    return next(new AppError(500, `Failed to import profiles: ${(err as Error).message}`, 'IMPORT_FAILED'));
  }
});

// Export workspace as Marva Profile JSON
router.get('/export/:workspaceId', (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspace = workspaceService.get(req.params.workspaceId);
    if (!workspace) {
      return next(new AppError(404, 'Workspace not found', 'WORKSPACE_NOT_FOUND'));
    }

    const profiles = exportMarvaProfiles(req.params.workspaceId);

    // Set content disposition for download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${workspace.name.replace(/[^a-zA-Z0-9]/g, '_')}_marva_profiles.json"`
    );

    res.json(profiles);
  } catch (err) {
    console.error('Export error:', err);
    return next(new AppError(500, `Failed to export profiles: ${(err as Error).message}`, 'EXPORT_FAILED'));
  }
});

export default router;
