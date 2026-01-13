#!/usr/bin/env node
/**
 * CLI tool to manage locked workspaces
 *
 * Usage:
 *   npx ts-node src/cli/lock-workspace.ts list              - List all workspaces and their lock status
 *   npx ts-node src/cli/lock-workspace.ts lock <id|name>    - Lock a workspace by ID or name
 *   npx ts-node src/cli/lock-workspace.ts unlock <id|name>  - Unlock a workspace by ID or name
 *   npx ts-node src/cli/lock-workspace.ts show              - Show current locked workspaces config
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import initSqlJs from 'sql.js';

const CONFIG_FILE = join(process.cwd(), 'locked-workspaces.json');
const DATA_DIR = join(process.cwd(), 'data');
const MASTER_DB_PATH = join(DATA_DIR, '_master.db');

interface LockedWorkspacesConfig {
  lockedWorkspaceIds?: string[];
  lockedWorkspaceNames?: string[];
}

interface Workspace {
  id: string;
  name: string;
}

function loadConfig(): LockedWorkspacesConfig {
  if (!existsSync(CONFIG_FILE)) {
    return { lockedWorkspaceIds: [], lockedWorkspaceNames: [] };
  }
  try {
    const content = readFileSync(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(content) as LockedWorkspacesConfig;
    return {
      lockedWorkspaceIds: parsed.lockedWorkspaceIds || [],
      lockedWorkspaceNames: parsed.lockedWorkspaceNames || []
    };
  } catch {
    return { lockedWorkspaceIds: [], lockedWorkspaceNames: [] };
  }
}

function saveConfig(config: LockedWorkspacesConfig): void {
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n');
}

async function getWorkspaces(): Promise<Workspace[]> {
  if (!existsSync(MASTER_DB_PATH)) {
    console.error('Error: No database found. Run the server first to create workspaces.');
    process.exit(1);
  }

  const SQL = await initSqlJs();
  const buffer = readFileSync(MASTER_DB_PATH);
  const db = new SQL.Database(buffer);

  const stmt = db.prepare('SELECT id, name FROM workspaces ORDER BY name ASC');
  const workspaces: Workspace[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as { id: string; name: string };
    workspaces.push({ id: row.id, name: row.name });
  }
  stmt.free();
  db.close();

  return workspaces;
}

function isLocked(config: LockedWorkspacesConfig, workspace: Workspace): boolean {
  return (
    (config.lockedWorkspaceIds?.includes(workspace.id) || false) ||
    (config.lockedWorkspaceNames?.includes(workspace.name) || false)
  );
}

async function listWorkspaces(): Promise<void> {
  const workspaces = await getWorkspaces();
  const config = loadConfig();

  if (workspaces.length === 0) {
    console.log('No workspaces found.');
    return;
  }

  console.log('\nWorkspaces:\n');
  console.log('  Status    ID                                     Name');
  console.log('  ------    --                                     ----');

  for (const ws of workspaces) {
    const locked = isLocked(config, ws);
    const status = locked ? '🔒 LOCKED' : '  open  ';
    console.log(`  ${status}  ${ws.id}   ${ws.name}`);
  }
  console.log('');
}

async function lockWorkspace(identifier: string): Promise<void> {
  const workspaces = await getWorkspaces();
  const config = loadConfig();

  // Find workspace by ID or name
  const workspace = workspaces.find(ws => ws.id === identifier || ws.name === identifier);

  if (!workspace) {
    console.error(`Error: Workspace not found: "${identifier}"`);
    console.log('\nAvailable workspaces:');
    for (const ws of workspaces) {
      console.log(`  - ${ws.name} (${ws.id})`);
    }
    process.exit(1);
  }

  if (isLocked(config, workspace)) {
    console.log(`Workspace "${workspace.name}" is already locked.`);
    return;
  }

  // Add to locked IDs (prefer ID over name for stability)
  if (!config.lockedWorkspaceIds) {
    config.lockedWorkspaceIds = [];
  }
  config.lockedWorkspaceIds.push(workspace.id);

  saveConfig(config);
  console.log(`✓ Locked workspace: "${workspace.name}" (${workspace.id})`);
}

async function unlockWorkspace(identifier: string): Promise<void> {
  const workspaces = await getWorkspaces();
  const config = loadConfig();

  // Find workspace by ID or name
  const workspace = workspaces.find(ws => ws.id === identifier || ws.name === identifier);

  if (!workspace) {
    console.error(`Error: Workspace not found: "${identifier}"`);
    process.exit(1);
  }

  if (!isLocked(config, workspace)) {
    console.log(`Workspace "${workspace.name}" is not locked.`);
    return;
  }

  // Remove from both ID and name lists
  if (config.lockedWorkspaceIds) {
    config.lockedWorkspaceIds = config.lockedWorkspaceIds.filter(id => id !== workspace.id);
  }
  if (config.lockedWorkspaceNames) {
    config.lockedWorkspaceNames = config.lockedWorkspaceNames.filter(name => name !== workspace.name);
  }

  saveConfig(config);
  console.log(`✓ Unlocked workspace: "${workspace.name}" (${workspace.id})`);
}

function showConfig(): void {
  const config = loadConfig();
  console.log('\nCurrent locked workspaces config:\n');
  console.log(JSON.stringify(config, null, 2));
  console.log('');
}

function showHelp(): void {
  console.log(`
Lock Workspace CLI Tool

Usage:
  npm run lock-workspace list              List all workspaces and their lock status
  npm run lock-workspace lock <id|name>    Lock a workspace by ID or name
  npm run lock-workspace unlock <id|name>  Unlock a workspace by ID or name
  npm run lock-workspace show              Show current locked workspaces config

Examples:
  npm run lock-workspace list
  npm run lock-workspace lock "Public Template"
  npm run lock-workspace unlock abc123-def456-...
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'list':
      await listWorkspaces();
      break;
    case 'lock':
      if (!args[1]) {
        console.error('Error: Please provide a workspace ID or name to lock.');
        process.exit(1);
      }
      await lockWorkspace(args[1]);
      break;
    case 'unlock':
      if (!args[1]) {
        console.error('Error: Please provide a workspace ID or name to unlock.');
        process.exit(1);
      }
      await unlockWorkspace(args[1]);
      break;
    case 'show':
      showConfig();
      break;
    case 'help':
    case '--help':
    case '-h':
      showHelp();
      break;
    default:
      showHelp();
      break;
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
