import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, copyFileSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  Workspace,
  Folder,
  Shape,
  StatementRow,
  Namespace,
  WorkspaceOptions,
  DEFAULT_NAMESPACES,
  DEFAULT_OPTIONS,
  CreateRowRequest,
  UpdateRowRequest
} from '../types/dctap.js';
import { invalidateWorkspaceCache } from './cache.js';

const DATA_DIR = join(process.cwd(), 'data');

// Ensure data directory exists
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let masterDb: SqlJsDatabase;

// Cache for workspace database connections
const dbCache = new Map<string, SqlJsDatabase>();

// Initialize SQL.js
async function initDb() {
  if (SQL) return;
  SQL = await initSqlJs();

  // Initialize master database
  const masterDbPath = join(DATA_DIR, '_master.db');
  if (existsSync(masterDbPath)) {
    const buffer = readFileSync(masterDbPath);
    masterDb = new SQL.Database(buffer);
  } else {
    masterDb = new SQL.Database();
  }

  masterDb.run(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

  saveMasterDb();
}

function saveMasterDb() {
  const data = masterDb.export();
  const buffer = Buffer.from(data);
  writeFileSync(join(DATA_DIR, '_master.db'), buffer);
}

function saveWorkspaceDb(workspaceId: string) {
  const db = dbCache.get(workspaceId);
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  writeFileSync(join(DATA_DIR, `${workspaceId}.db`), buffer);
}

function getWorkspaceDb(workspaceId: string): SqlJsDatabase {
  if (dbCache.has(workspaceId)) {
    return dbCache.get(workspaceId)!;
  }

  const dbPath = join(DATA_DIR, `${workspaceId}.db`);
  if (!existsSync(dbPath)) {
    throw new Error(`Workspace database not found: ${workspaceId}`);
  }

  const buffer = readFileSync(dbPath);
  const db = new SQL.Database(buffer);
  dbCache.set(workspaceId, db);
  return db;
}

function closeWorkspaceDb(workspaceId: string): void {
  const db = dbCache.get(workspaceId);
  if (db) {
    saveWorkspaceDb(workspaceId);
    db.close();
    dbCache.delete(workspaceId);
  }
}

function initializeWorkspaceDb(db: SqlJsDatabase, name: string): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS _metadata (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS _namespaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prefix TEXT UNIQUE NOT NULL,
      namespace TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS _folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS _shapes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shape_id TEXT UNIQUE NOT NULL,
      shape_label TEXT,
      description TEXT,
      resource_uri TEXT,
      folder_id INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (folder_id) REFERENCES _folders(id) ON DELETE SET NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS _options (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

  const now = Math.floor(Date.now() / 1000);
  db.run('INSERT INTO _metadata (key, value, updated_at) VALUES (?, ?, ?)', ['name', name, now]);
  db.run('INSERT INTO _metadata (key, value, updated_at) VALUES (?, ?, ?)', ['created_at', now.toString(), now]);

  // Insert default namespaces
  for (const ns of DEFAULT_NAMESPACES) {
    db.run('INSERT INTO _namespaces (prefix, namespace) VALUES (?, ?)', [ns.prefix, ns.namespace]);
  }

  // Insert default options
  for (const [key, value] of Object.entries(DEFAULT_OPTIONS)) {
    db.run('INSERT INTO _options (key, value, updated_at) VALUES (?, ?, ?)', [key, JSON.stringify(value), now]);
  }
}

function sanitizeTableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
}

function createShapeTable(db: SqlJsDatabase, shapeId: string): void {
  const tableName = `shape_${sanitizeTableName(shapeId)}`;
  db.run(`
    CREATE TABLE IF NOT EXISTS "${tableName}" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      row_order INTEGER NOT NULL,
      property_id TEXT,
      property_label TEXT,
      mandatory TEXT,
      repeatable TEXT,
      value_node_type TEXT,
      value_data_type TEXT,
      value_shape TEXT,
      value_constraint TEXT,
      value_constraint_type TEXT,
      lc_default_literal TEXT,
      lc_default_uri TEXT,
      note TEXT,
      lc_data_type_uri TEXT,
      lc_remark TEXT,
      has_errors INTEGER DEFAULT 0,
      error_details TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);
}

function updateWorkspaceTimestamp(workspaceId: string): void {
  const now = Math.floor(Date.now() / 1000);
  masterDb.run('UPDATE workspaces SET updated_at = ? WHERE id = ?', [now, workspaceId]);
  saveMasterDb();

  try {
    const db = getWorkspaceDb(workspaceId);
    db.run('UPDATE _metadata SET value = ?, updated_at = ? WHERE key = ?', [now.toString(), now, 'updated_at']);
    saveWorkspaceDb(workspaceId);
  } catch {
    // Workspace db might not exist yet
  }

  // Invalidate cache for this workspace since data changed
  invalidateWorkspaceCache(workspaceId);
}

// Helper to extract rows from sql.js result
function extractRows<T>(db: SqlJsDatabase, sql: string, params: unknown[] = []): T[] {
  const stmt = db.prepare(sql);
  if (params.length > 0) {
    stmt.bind(params);
  }
  const results: T[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as T;
    results.push(row);
  }
  stmt.free();
  return results;
}

function extractOne<T>(db: SqlJsDatabase, sql: string, params: unknown[] = []): T | null {
  const rows = extractRows<T>(db, sql, params);
  return rows.length > 0 ? rows[0] : null;
}

// Workspace operations
export const workspaceService = {
  async init() {
    await initDb();
  },

  list(): Workspace[] {
    const rows = extractRows<{
      id: string;
      name: string;
      created_at: number;
      updated_at: number;
    }>(masterDb, 'SELECT * FROM workspaces ORDER BY updated_at DESC');

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  },

  get(id: string): Workspace | null {
    const row = extractOne<{
      id: string;
      name: string;
      created_at: number;
      updated_at: number;
    }>(masterDb, 'SELECT * FROM workspaces WHERE id = ?', [id]);

    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  },

  create(name: string): Workspace {
    const id = uuidv4();
    const now = Math.floor(Date.now() / 1000);

    masterDb.run('INSERT INTO workspaces (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)', [id, name, now, now]);
    saveMasterDb();

    // Create workspace database
    const db = new SQL.Database();
    initializeWorkspaceDb(db, name);
    dbCache.set(id, db);
    saveWorkspaceDb(id);

    return { id, name, createdAt: now, updatedAt: now };
  },

  update(id: string, name: string): Workspace | null {
    const existing = this.get(id);
    if (!existing) return null;

    const now = Math.floor(Date.now() / 1000);
    masterDb.run('UPDATE workspaces SET name = ?, updated_at = ? WHERE id = ?', [name, now, id]);
    saveMasterDb();

    const db = getWorkspaceDb(id);
    db.run('UPDATE _metadata SET value = ?, updated_at = ? WHERE key = ?', [name, now, 'name']);
    saveWorkspaceDb(id);

    return { ...existing, name, updatedAt: now };
  },

  delete(id: string): boolean {
    const existing = this.get(id);
    if (!existing) return false;

    closeWorkspaceDb(id);
    masterDb.run('DELETE FROM workspaces WHERE id = ?', [id]);
    saveMasterDb();

    const dbPath = join(DATA_DIR, `${id}.db`);
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }

    return true;
  },

  duplicate(id: string, newName: string): Workspace | null {
    const existing = this.get(id);
    if (!existing) return null;

    const newId = uuidv4();
    const now = Math.floor(Date.now() / 1000);

    // Copy database file
    const srcPath = join(DATA_DIR, `${id}.db`);
    const destPath = join(DATA_DIR, `${newId}.db`);
    closeWorkspaceDb(id);
    copyFileSync(srcPath, destPath);

    // Update master db
    masterDb.run('INSERT INTO workspaces (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)', [newId, newName, now, now]);
    saveMasterDb();

    // Update name in new workspace db
    const buffer = readFileSync(destPath);
    const db = new SQL.Database(buffer);
    db.run('UPDATE _metadata SET value = ?, updated_at = ? WHERE key = ?', [newName, now, 'name']);
    const data = db.export();
    writeFileSync(destPath, Buffer.from(data));
    db.close();

    return { id: newId, name: newName, createdAt: now, updatedAt: now };
  },

  getUpdatedAt(id: string): number | null {
    const row = extractOne<{ updated_at: number }>(masterDb, 'SELECT updated_at FROM workspaces WHERE id = ?', [id]);
    return row?.updated_at ?? null;
  }
};

// Migration helper for existing databases - add description column to _shapes
const migratedDbs = new Set<string>();
function migrateShapesTable(db: SqlJsDatabase, workspaceId: string): void {
  if (migratedDbs.has(workspaceId)) return;

  // Check if description column exists
  const columns = extractRows<{ name: string }>(db, "PRAGMA table_info(_shapes)");
  const hasDescription = columns.some(c => c.name === 'description');

  if (!hasDescription) {
    db.run('ALTER TABLE _shapes ADD COLUMN description TEXT');
    saveWorkspaceDb(workspaceId);
  }

  migratedDbs.add(workspaceId);
}

// Shape operations
export const shapeService = {
  list(workspaceId: string): Shape[] {
    const db = getWorkspaceDb(workspaceId);

    // Check if description column exists (for migration)
    migrateShapesTable(db, workspaceId);

    const rows = extractRows<{
      id: number;
      shape_id: string;
      shape_label: string | null;
      description: string | null;
      resource_uri: string | null;
      folder_id: number | null;
      created_at: number;
      updated_at: number;
    }>(db, 'SELECT * FROM _shapes ORDER BY shape_id ASC');

    return rows.map(row => ({
      id: row.id,
      shapeId: row.shape_id,
      shapeLabel: row.shape_label,
      description: row.description,
      resourceURI: row.resource_uri,
      folderId: row.folder_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  },

  get(workspaceId: string, shapeId: string): Shape | null {
    const db = getWorkspaceDb(workspaceId);

    // Check if description column exists (for migration)
    migrateShapesTable(db, workspaceId);

    const row = extractOne<{
      id: number;
      shape_id: string;
      shape_label: string | null;
      description: string | null;
      resource_uri: string | null;
      folder_id: number | null;
      created_at: number;
      updated_at: number;
    }>(db, 'SELECT * FROM _shapes WHERE shape_id = ?', [shapeId]);

    if (!row) return null;
    return {
      id: row.id,
      shapeId: row.shape_id,
      shapeLabel: row.shape_label,
      description: row.description,
      resourceURI: row.resource_uri,
      folderId: row.folder_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  },

  create(workspaceId: string, shapeId: string, shapeLabel?: string, resourceURI?: string, folderId?: number | null, description?: string): Shape {
    const db = getWorkspaceDb(workspaceId);
    const now = Math.floor(Date.now() / 1000);

    db.run('INSERT INTO _shapes (shape_id, shape_label, description, resource_uri, folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [shapeId, shapeLabel || null, description || null, resourceURI || null, folderId ?? null, now, now]);

    const result = extractOne<{ id: number }>(db, 'SELECT last_insert_rowid() as id');
    const id = result?.id || 0;

    createShapeTable(db, shapeId);
    saveWorkspaceDb(workspaceId);

    updateWorkspaceTimestamp(workspaceId);

    return {
      id,
      shapeId,
      shapeLabel: shapeLabel || null,
      description: description || null,
      resourceURI: resourceURI || null,
      folderId: folderId ?? null,
      createdAt: now,
      updatedAt: now
    };
  },

  update(workspaceId: string, shapeId: string, updates: { shapeId?: string; shapeLabel?: string; description?: string; resourceURI?: string; folderId?: number | null }): Shape | null {
    const db = getWorkspaceDb(workspaceId);
    const existing = this.get(workspaceId, shapeId);
    if (!existing) return null;

    const now = Math.floor(Date.now() / 1000);
    const newShapeId = updates.shapeId || shapeId;
    const newShapeLabel = updates.shapeLabel !== undefined ? updates.shapeLabel : existing.shapeLabel;
    const newDescription = updates.description !== undefined ? updates.description : existing.description;
    const newResourceURI = updates.resourceURI !== undefined ? updates.resourceURI : existing.resourceURI;
    const newFolderId = updates.folderId !== undefined ? updates.folderId : existing.folderId;

    // If shapeId changed, rename table
    if (updates.shapeId && updates.shapeId !== shapeId) {
      const oldTable = `shape_${sanitizeTableName(shapeId)}`;
      const newTable = `shape_${sanitizeTableName(updates.shapeId)}`;
      db.run(`ALTER TABLE "${oldTable}" RENAME TO "${newTable}"`);
    }

    db.run('UPDATE _shapes SET shape_id = ?, shape_label = ?, description = ?, resource_uri = ?, folder_id = ?, updated_at = ? WHERE shape_id = ?', [newShapeId, newShapeLabel, newDescription, newResourceURI, newFolderId, now, shapeId]);
    saveWorkspaceDb(workspaceId);

    updateWorkspaceTimestamp(workspaceId);

    return {
      id: existing.id,
      shapeId: newShapeId,
      shapeLabel: newShapeLabel,
      description: newDescription,
      resourceURI: newResourceURI,
      folderId: newFolderId,
      createdAt: existing.createdAt,
      updatedAt: now
    };
  },

  delete(workspaceId: string, shapeId: string): boolean {
    const db = getWorkspaceDb(workspaceId);
    const existing = this.get(workspaceId, shapeId);
    if (!existing) return false;

    const tableName = `shape_${sanitizeTableName(shapeId)}`;
    db.run(`DROP TABLE IF EXISTS "${tableName}"`);
    db.run('DELETE FROM _shapes WHERE shape_id = ?', [shapeId]);
    saveWorkspaceDb(workspaceId);

    updateWorkspaceTimestamp(workspaceId);
    return true;
  },

  getUsages(workspaceId: string, shapeId: string): string[] {
    const db = getWorkspaceDb(workspaceId);
    const shapes = this.list(workspaceId);
    const usages: string[] = [];

    for (const shape of shapes) {
      if (shape.shapeId === shapeId) continue;
      const tableName = `shape_${sanitizeTableName(shape.shapeId)}`;
      const result = extractOne<{ count: number }>(db, `SELECT COUNT(*) as count FROM "${tableName}" WHERE value_shape = ?`, [shapeId]);
      if (result && result.count > 0) {
        usages.push(shape.shapeId);
      }
    }

    return usages;
  },

  copyToWorkspace(sourceWorkspaceId: string, shapeId: string, targetWorkspaceId: string): { shape: Shape; rowsCopied: number; overwrote: boolean } {
    // Get source shape
    const sourceShape = this.get(sourceWorkspaceId, shapeId);
    if (!sourceShape) {
      throw new Error('Source shape not found');
    }

    // Check if target workspace exists
    const targetWorkspace = workspaceService.get(targetWorkspaceId);
    if (!targetWorkspace) {
      throw new Error('Target workspace not found');
    }

    // Get source rows
    const sourceRows = rowService.list(sourceWorkspaceId, shapeId);

    // Check if shape already exists in target
    const existingShape = this.get(targetWorkspaceId, shapeId);
    const overwrote = existingShape !== null;

    // If shape exists, delete it first (including its table)
    if (existingShape) {
      this.delete(targetWorkspaceId, shapeId);
    }

    // Create shape in target workspace
    const newShape = this.create(
      targetWorkspaceId,
      sourceShape.shapeId,
      sourceShape.shapeLabel || undefined,
      sourceShape.resourceURI || undefined,
      null, // Don't copy folder assignment
      sourceShape.description || undefined
    );

    // Copy all rows
    for (const row of sourceRows) {
      rowService.create(targetWorkspaceId, shapeId, {
        rowOrder: row.rowOrder,
        propertyId: row.propertyId ?? undefined,
        propertyLabel: row.propertyLabel ?? undefined,
        mandatory: row.mandatory ?? undefined,
        repeatable: row.repeatable ?? undefined,
        valueNodeType: row.valueNodeType ?? undefined,
        valueDataType: row.valueDataType ?? undefined,
        valueShape: row.valueShape ?? undefined,
        valueConstraint: row.valueConstraint ?? undefined,
        valueConstraintType: row.valueConstraintType ?? undefined,
        lcDefaultLiteral: row.lcDefaultLiteral ?? undefined,
        lcDefaultURI: row.lcDefaultURI ?? undefined,
        note: row.note ?? undefined,
        lcDataTypeURI: row.lcDataTypeURI ?? undefined,
        lcRemark: row.lcRemark ?? undefined
      });
    }

    return {
      shape: newShape,
      rowsCopied: sourceRows.length,
      overwrote
    };
  }
};

// Row operations
export const rowService = {
  list(workspaceId: string, shapeId: string): StatementRow[] {
    const db = getWorkspaceDb(workspaceId);
    const tableName = `shape_${sanitizeTableName(shapeId)}`;
    const rows = extractRows<{
      id: number;
      row_order: number;
      property_id: string | null;
      property_label: string | null;
      mandatory: string | null;
      repeatable: string | null;
      value_node_type: string | null;
      value_data_type: string | null;
      value_shape: string | null;
      value_constraint: string | null;
      value_constraint_type: string | null;
      lc_default_literal: string | null;
      lc_default_uri: string | null;
      note: string | null;
      lc_data_type_uri: string | null;
      lc_remark: string | null;
      has_errors: number;
      error_details: string | null;
      created_at: number;
      updated_at: number;
    }>(db, `SELECT * FROM "${tableName}" ORDER BY row_order ASC`);

    return rows.map(row => ({
      id: row.id,
      rowOrder: row.row_order,
      propertyId: row.property_id,
      propertyLabel: row.property_label,
      mandatory: row.mandatory,
      repeatable: row.repeatable,
      valueNodeType: row.value_node_type,
      valueDataType: row.value_data_type,
      valueShape: row.value_shape,
      valueConstraint: row.value_constraint,
      valueConstraintType: row.value_constraint_type,
      lcDefaultLiteral: row.lc_default_literal,
      lcDefaultURI: row.lc_default_uri,
      note: row.note,
      lcDataTypeURI: row.lc_data_type_uri,
      lcRemark: row.lc_remark,
      hasErrors: row.has_errors,
      errorDetails: row.error_details,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  },

  get(workspaceId: string, shapeId: string, rowId: number): StatementRow | null {
    const db = getWorkspaceDb(workspaceId);
    const tableName = `shape_${sanitizeTableName(shapeId)}`;
    const row = extractOne<{
      id: number;
      row_order: number;
      property_id: string | null;
      property_label: string | null;
      mandatory: string | null;
      repeatable: string | null;
      value_node_type: string | null;
      value_data_type: string | null;
      value_shape: string | null;
      value_constraint: string | null;
      value_constraint_type: string | null;
      lc_default_literal: string | null;
      lc_default_uri: string | null;
      note: string | null;
      lc_data_type_uri: string | null;
      lc_remark: string | null;
      has_errors: number;
      error_details: string | null;
      created_at: number;
      updated_at: number;
    }>(db, `SELECT * FROM "${tableName}" WHERE id = ?`, [rowId]);

    if (!row) return null;
    return {
      id: row.id,
      rowOrder: row.row_order,
      propertyId: row.property_id,
      propertyLabel: row.property_label,
      mandatory: row.mandatory,
      repeatable: row.repeatable,
      valueNodeType: row.value_node_type,
      valueDataType: row.value_data_type,
      valueShape: row.value_shape,
      valueConstraint: row.value_constraint,
      valueConstraintType: row.value_constraint_type,
      lcDefaultLiteral: row.lc_default_literal,
      lcDefaultURI: row.lc_default_uri,
      note: row.note,
      lcDataTypeURI: row.lc_data_type_uri,
      lcRemark: row.lc_remark,
      hasErrors: row.has_errors,
      errorDetails: row.error_details,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  },

  create(workspaceId: string, shapeId: string, data: CreateRowRequest): StatementRow {
    const db = getWorkspaceDb(workspaceId);
    const tableName = `shape_${sanitizeTableName(shapeId)}`;
    const now = Math.floor(Date.now() / 1000);

    // Get next row order
    let rowOrder = data.rowOrder;
    if (rowOrder === undefined) {
      const maxOrder = extractOne<{ max_order: number | null }>(db, `SELECT MAX(row_order) as max_order FROM "${tableName}"`);
      rowOrder = (maxOrder?.max_order ?? -1) + 1;
    }

    db.run(`
      INSERT INTO "${tableName}" (
        row_order, property_id, property_label, mandatory, repeatable,
        value_node_type, value_data_type, value_shape, value_constraint,
        value_constraint_type, lc_default_literal, lc_default_uri, note, lc_data_type_uri, lc_remark, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      rowOrder,
      data.propertyId || null,
      data.propertyLabel || null,
      data.mandatory || null,
      data.repeatable || null,
      data.valueNodeType || null,
      data.valueDataType || null,
      data.valueShape || null,
      data.valueConstraint || null,
      data.valueConstraintType || null,
      data.lcDefaultLiteral || null,
      data.lcDefaultURI || null,
      data.note || null,
      data.lcDataTypeURI || null,
      data.lcRemark || null,
      now,
      now
    ]);

    const result = extractOne<{ id: number }>(db, 'SELECT last_insert_rowid() as id');
    const id = result?.id || 0;

    saveWorkspaceDb(workspaceId);
    updateWorkspaceTimestamp(workspaceId);

    return {
      id,
      rowOrder,
      propertyId: data.propertyId || null,
      propertyLabel: data.propertyLabel || null,
      mandatory: data.mandatory || null,
      repeatable: data.repeatable || null,
      valueNodeType: data.valueNodeType || null,
      valueDataType: data.valueDataType || null,
      valueShape: data.valueShape || null,
      valueConstraint: data.valueConstraint || null,
      valueConstraintType: data.valueConstraintType || null,
      lcDefaultLiteral: data.lcDefaultLiteral || null,
      lcDefaultURI: data.lcDefaultURI || null,
      note: data.note || null,
      lcDataTypeURI: data.lcDataTypeURI || null,
      lcRemark: data.lcRemark || null,
      hasErrors: 0,
      errorDetails: null,
      createdAt: now,
      updatedAt: now
    };
  },

  update(workspaceId: string, shapeId: string, rowId: number, data: UpdateRowRequest): StatementRow | null {
    const db = getWorkspaceDb(workspaceId);
    const tableName = `shape_${sanitizeTableName(shapeId)}`;
    const existing = this.get(workspaceId, shapeId, rowId);
    if (!existing) return null;

    const now = Math.floor(Date.now() / 1000);

    db.run(`
      UPDATE "${tableName}" SET
        row_order = ?,
        property_id = ?,
        property_label = ?,
        mandatory = ?,
        repeatable = ?,
        value_node_type = ?,
        value_data_type = ?,
        value_shape = ?,
        value_constraint = ?,
        value_constraint_type = ?,
        lc_default_literal = ?,
        lc_default_uri = ?,
        note = ?,
        lc_data_type_uri = ?,
        lc_remark = ?,
        has_errors = ?,
        error_details = ?,
        updated_at = ?
      WHERE id = ?
    `, [
      data.rowOrder !== undefined ? data.rowOrder : existing.rowOrder,
      data.propertyId !== undefined ? data.propertyId : existing.propertyId,
      data.propertyLabel !== undefined ? data.propertyLabel : existing.propertyLabel,
      data.mandatory !== undefined ? data.mandatory : existing.mandatory,
      data.repeatable !== undefined ? data.repeatable : existing.repeatable,
      data.valueNodeType !== undefined ? data.valueNodeType : existing.valueNodeType,
      data.valueDataType !== undefined ? data.valueDataType : existing.valueDataType,
      data.valueShape !== undefined ? data.valueShape : existing.valueShape,
      data.valueConstraint !== undefined ? data.valueConstraint : existing.valueConstraint,
      data.valueConstraintType !== undefined ? data.valueConstraintType : existing.valueConstraintType,
      data.lcDefaultLiteral !== undefined ? data.lcDefaultLiteral : existing.lcDefaultLiteral,
      data.lcDefaultURI !== undefined ? data.lcDefaultURI : existing.lcDefaultURI,
      data.note !== undefined ? data.note : existing.note,
      data.lcDataTypeURI !== undefined ? data.lcDataTypeURI : existing.lcDataTypeURI,
      data.lcRemark !== undefined ? data.lcRemark : existing.lcRemark,
      existing.hasErrors,
      existing.errorDetails,
      now,
      rowId
    ]);

    saveWorkspaceDb(workspaceId);
    updateWorkspaceTimestamp(workspaceId);

    return this.get(workspaceId, shapeId, rowId);
  },

  bulkUpdate(workspaceId: string, shapeId: string, rows: UpdateRowRequest[]): StatementRow[] {
    const results: StatementRow[] = [];
    for (const row of rows) {
      if (row.id) {
        const updated = this.update(workspaceId, shapeId, row.id, row);
        if (updated) results.push(updated);
      } else {
        const created = this.create(workspaceId, shapeId, row);
        results.push(created);
      }
    }
    return results;
  },

  delete(workspaceId: string, shapeId: string, rowId: number): boolean {
    const db = getWorkspaceDb(workspaceId);
    const tableName = `shape_${sanitizeTableName(shapeId)}`;
    const existing = this.get(workspaceId, shapeId, rowId);
    if (!existing) return false;

    db.run(`DELETE FROM "${tableName}" WHERE id = ?`, [rowId]);
    saveWorkspaceDb(workspaceId);
    updateWorkspaceTimestamp(workspaceId);
    return true;
  },

  bulkDelete(workspaceId: string, shapeId: string, rowIds: number[]): number {
    const db = getWorkspaceDb(workspaceId);
    const tableName = `shape_${sanitizeTableName(shapeId)}`;
    let count = 0;

    for (const rowId of rowIds) {
      const existing = this.get(workspaceId, shapeId, rowId);
      if (existing) {
        db.run(`DELETE FROM "${tableName}" WHERE id = ?`, [rowId]);
        count++;
      }
    }

    if (count > 0) {
      saveWorkspaceDb(workspaceId);
      updateWorkspaceTimestamp(workspaceId);
    }

    return count;
  },

  updateErrors(workspaceId: string, shapeId: string, rowId: number, hasErrors: boolean, errorDetails: string | null): void {
    const db = getWorkspaceDb(workspaceId);
    const tableName = `shape_${sanitizeTableName(shapeId)}`;
    db.run(`UPDATE "${tableName}" SET has_errors = ?, error_details = ? WHERE id = ?`, [hasErrors ? 1 : 0, errorDetails, rowId]);
    saveWorkspaceDb(workspaceId);
  },

  reorder(workspaceId: string, shapeId: string, rowIds: number[]): void {
    const db = getWorkspaceDb(workspaceId);
    const tableName = `shape_${sanitizeTableName(shapeId)}`;
    const now = Math.floor(Date.now() / 1000);

    // Update row_order for each row based on position in array
    for (let i = 0; i < rowIds.length; i++) {
      db.run(`UPDATE "${tableName}" SET row_order = ?, updated_at = ? WHERE id = ?`, [i, now, rowIds[i]]);
    }

    saveWorkspaceDb(workspaceId);
    updateWorkspaceTimestamp(workspaceId);
  }
};

// Namespace operations
export const namespaceService = {
  list(workspaceId: string): Namespace[] {
    const db = getWorkspaceDb(workspaceId);
    const rows = extractRows<{
      id: number;
      prefix: string;
      namespace: string;
      created_at: number;
    }>(db, 'SELECT * FROM _namespaces ORDER BY prefix ASC');

    return rows.map(row => ({
      id: row.id,
      prefix: row.prefix,
      namespace: row.namespace,
      createdAt: row.created_at
    }));
  },

  get(workspaceId: string, prefix: string): Namespace | null {
    const db = getWorkspaceDb(workspaceId);
    const row = extractOne<{
      id: number;
      prefix: string;
      namespace: string;
      created_at: number;
    }>(db, 'SELECT * FROM _namespaces WHERE prefix = ?', [prefix]);

    if (!row) return null;
    return {
      id: row.id,
      prefix: row.prefix,
      namespace: row.namespace,
      createdAt: row.created_at
    };
  },

  create(workspaceId: string, prefix: string, namespace: string): Namespace {
    const db = getWorkspaceDb(workspaceId);
    const now = Math.floor(Date.now() / 1000);
    db.run('INSERT INTO _namespaces (prefix, namespace, created_at) VALUES (?, ?, ?)', [prefix, namespace, now]);

    const result = extractOne<{ id: number }>(db, 'SELECT last_insert_rowid() as id');
    const id = result?.id || 0;

    saveWorkspaceDb(workspaceId);
    updateWorkspaceTimestamp(workspaceId);

    return { id, prefix, namespace, createdAt: now };
  },

  update(workspaceId: string, prefix: string, namespace: string): Namespace | null {
    const db = getWorkspaceDb(workspaceId);
    const existing = this.get(workspaceId, prefix);
    if (!existing) return null;

    db.run('UPDATE _namespaces SET namespace = ? WHERE prefix = ?', [namespace, prefix]);
    saveWorkspaceDb(workspaceId);
    updateWorkspaceTimestamp(workspaceId);

    return { ...existing, namespace };
  },

  delete(workspaceId: string, prefix: string): boolean {
    const db = getWorkspaceDb(workspaceId);
    const existing = this.get(workspaceId, prefix);
    if (!existing) return false;

    db.run('DELETE FROM _namespaces WHERE prefix = ?', [prefix]);
    saveWorkspaceDb(workspaceId);
    updateWorkspaceTimestamp(workspaceId);

    return true;
  }
};

// Folder operations
export const folderService = {
  list(workspaceId: string): Folder[] {
    const db = getWorkspaceDb(workspaceId);
    const rows = extractRows<{
      id: number;
      name: string;
      created_at: number;
    }>(db, 'SELECT * FROM _folders ORDER BY name ASC');

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at
    }));
  },

  get(workspaceId: string, folderId: number): Folder | null {
    const db = getWorkspaceDb(workspaceId);
    const row = extractOne<{
      id: number;
      name: string;
      created_at: number;
    }>(db, 'SELECT * FROM _folders WHERE id = ?', [folderId]);

    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      createdAt: row.created_at
    };
  },

  create(workspaceId: string, name: string): Folder {
    const db = getWorkspaceDb(workspaceId);
    const now = Math.floor(Date.now() / 1000);

    db.run('INSERT INTO _folders (name, created_at) VALUES (?, ?)', [name, now]);

    const result = extractOne<{ id: number }>(db, 'SELECT last_insert_rowid() as id');
    const id = result?.id || 0;

    saveWorkspaceDb(workspaceId);
    updateWorkspaceTimestamp(workspaceId);

    return { id, name, createdAt: now };
  },

  update(workspaceId: string, folderId: number, name: string): Folder | null {
    const db = getWorkspaceDb(workspaceId);
    const existing = this.get(workspaceId, folderId);
    if (!existing) return null;

    db.run('UPDATE _folders SET name = ? WHERE id = ?', [name, folderId]);
    saveWorkspaceDb(workspaceId);
    updateWorkspaceTimestamp(workspaceId);

    return { ...existing, name };
  },

  delete(workspaceId: string, folderId: number): boolean {
    const db = getWorkspaceDb(workspaceId);
    const existing = this.get(workspaceId, folderId);
    if (!existing) return false;

    // Shapes in this folder will have folder_id set to NULL due to ON DELETE SET NULL
    db.run('DELETE FROM _folders WHERE id = ?', [folderId]);
    saveWorkspaceDb(workspaceId);
    updateWorkspaceTimestamp(workspaceId);

    return true;
  }
};

// Options operations
export const optionsService = {
  get(workspaceId: string): WorkspaceOptions {
    const db = getWorkspaceDb(workspaceId);

    // Check if _options table exists (for existing workspaces)
    const tableExists = extractOne<{ name: string }>(
      db,
      "SELECT name FROM sqlite_master WHERE type='table' AND name='_options'"
    );

    if (!tableExists) {
      // Create options table for existing workspaces
      db.run(`
        CREATE TABLE IF NOT EXISTS _options (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);
      const now = Math.floor(Date.now() / 1000);
      for (const [key, value] of Object.entries(DEFAULT_OPTIONS)) {
        db.run('INSERT INTO _options (key, value, updated_at) VALUES (?, ?, ?)', [key, JSON.stringify(value), now]);
      }
      saveWorkspaceDb(workspaceId);
    }

    const rows = extractRows<{ key: string; value: string }>(
      db,
      'SELECT key, value FROM _options'
    );

    const options: WorkspaceOptions = { ...DEFAULT_OPTIONS };
    for (const row of rows) {
      if (row.key in options) {
        try {
          (options as unknown as Record<string, unknown>)[row.key] = JSON.parse(row.value);
        } catch {
          // Keep default value if parsing fails
        }
      }
    }

    return options;
  },

  update(workspaceId: string, updates: Partial<WorkspaceOptions>): WorkspaceOptions {
    const db = getWorkspaceDb(workspaceId);
    const now = Math.floor(Date.now() / 1000);

    // Ensure table exists
    this.get(workspaceId);

    for (const [key, value] of Object.entries(updates)) {
      if (key in DEFAULT_OPTIONS) {
        db.run(
          'INSERT OR REPLACE INTO _options (key, value, updated_at) VALUES (?, ?, ?)',
          [key, JSON.stringify(value), now]
        );
      }
    }

    saveWorkspaceDb(workspaceId);
    updateWorkspaceTimestamp(workspaceId);

    return this.get(workspaceId);
  }
};
