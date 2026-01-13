import { existsSync, readFileSync, watchFile } from 'fs';
import { join } from 'path';

const CONFIG_FILE = join(process.cwd(), 'locked-workspaces.json');

interface LockedWorkspacesConfig {
  // Can specify by workspace ID (UUID) or name
  lockedWorkspaceIds?: string[];
  lockedWorkspaceNames?: string[];
}

let config: LockedWorkspacesConfig = {
  lockedWorkspaceIds: [],
  lockedWorkspaceNames: []
};

let lastLoadTime = 0;

function loadConfig(): void {
  if (!existsSync(CONFIG_FILE)) {
    config = { lockedWorkspaceIds: [], lockedWorkspaceNames: [] };
    return;
  }

  try {
    const content = readFileSync(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(content) as LockedWorkspacesConfig;
    config = {
      lockedWorkspaceIds: parsed.lockedWorkspaceIds || [],
      lockedWorkspaceNames: parsed.lockedWorkspaceNames || []
    };
    lastLoadTime = Date.now();
    console.log(`Loaded locked workspaces config: ${config.lockedWorkspaceIds?.length || 0} IDs, ${config.lockedWorkspaceNames?.length || 0} names`);
  } catch (err) {
    console.error('Failed to load locked-workspaces.json:', err);
    config = { lockedWorkspaceIds: [], lockedWorkspaceNames: [] };
  }
}

// Load config on startup
loadConfig();

// Watch for changes to the config file (reload when modified)
if (existsSync(CONFIG_FILE)) {
  watchFile(CONFIG_FILE, { interval: 5000 }, () => {
    console.log('locked-workspaces.json changed, reloading...');
    loadConfig();
  });
}

export const lockedWorkspacesService = {
  /**
   * Check if a workspace is locked by its ID
   */
  isLockedById(workspaceId: string): boolean {
    return config.lockedWorkspaceIds?.includes(workspaceId) || false;
  },

  /**
   * Check if a workspace is locked by its name
   */
  isLockedByName(workspaceName: string): boolean {
    return config.lockedWorkspaceNames?.includes(workspaceName) || false;
  },

  /**
   * Check if a workspace is locked (by ID or name)
   */
  isLocked(workspaceId: string, workspaceName?: string): boolean {
    if (this.isLockedById(workspaceId)) {
      return true;
    }
    if (workspaceName && this.isLockedByName(workspaceName)) {
      return true;
    }
    return false;
  },

  /**
   * Get all locked workspace IDs
   */
  getLockedIds(): string[] {
    return config.lockedWorkspaceIds || [];
  },

  /**
   * Get all locked workspace names
   */
  getLockedNames(): string[] {
    return config.lockedWorkspaceNames || [];
  },

  /**
   * Reload the config from disk
   */
  reload(): void {
    loadConfig();
  }
};
