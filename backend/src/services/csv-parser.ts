import {
  CreateRowRequest,
  DEFAULT_NAMESPACES,
  ValidationError
} from '../types/dctap.js';
import { workspaceService, shapeService, rowService, namespaceService } from './database.js';
import { validateRow } from './validation.js';

// Column name mappings (case-insensitive)
const COLUMN_MAPPINGS: Record<string, keyof CreateRowRequest | 'shapeID' | 'shapeLabel' | 'resourceURI'> = {
  'shapeid': 'shapeID' as 'shapeID',
  'shapelabel': 'shapeLabel' as 'shapeLabel',
  'resourceuri': 'resourceURI' as 'resourceURI',
  'propertyid': 'propertyId',
  'propertylabel': 'propertyLabel',
  'mandatory': 'mandatory',
  'repeatable': 'repeatable',
  'valuenodetype': 'valueNodeType',
  'valuedatatype': 'valueDataType',
  'valueshape': 'valueShape',
  'valueconstraint': 'valueConstraint',
  'valueconstrainttype': 'valueConstraintType',
  'note': 'note',
  // LC extension columns
  'lcdefaultliteral': 'lcDefaultLiteral',
  'lcdefaulturi': 'lcDefaultURI',
  'lcdatatypeuri': 'lcDataTypeURI',
  'lcremark': 'lcRemark'
};

interface ParsedRow {
  shapeID: string | null;
  shapeLabel: string | null;
  resourceURI: string | null;
  data: CreateRowRequest;
}

interface ParseResult {
  success: boolean;
  rows?: ParsedRow[];
  errors?: ValidationError[];
  warnings?: ValidationError[];
  detectedFormat?: 'csv' | 'tsv';
}

function detectDelimiter(content: string): string {
  const firstLine = content.split('\n')[0];
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  return tabCount > commaCount ? '\t' : ',';
}

function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());

  return result;
}

function escapeCSVValue(value: string | null | undefined, delimiter: string, convertNewlinesToPipes = false): string {
  if (value === null || value === undefined) return '';
  let str = String(value);
  // Convert newlines to pipes for multi-value fields
  if (convertNewlinesToPipes) {
    str = str.replace(/\n/g, ' | ');
  }
  if (str.includes(delimiter) || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function parseCSV(content: string): ParseResult {
  const delimiter = detectDelimiter(content);
  const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);

  if (lines.length === 0) {
    return { success: false, errors: [{ message: 'Empty file', severity: 'error' }] };
  }

  // Parse header
  const headerLine = parseCSVLine(lines[0], delimiter);
  const columnIndices: Record<string, number> = {};

  for (let i = 0; i < headerLine.length; i++) {
    const normalized = headerLine[i].toLowerCase().replace(/[^a-z]/g, '');
    const mapped = COLUMN_MAPPINGS[normalized];
    if (mapped) {
      columnIndices[mapped] = i;
    }
  }

  // Check for required columns
  if (!('propertyId' in columnIndices) && !('shapeID' in columnIndices)) {
    return {
      success: false,
      errors: [{
        message: 'File must contain at least propertyID or shapeID column',
        severity: 'error'
      }]
    };
  }

  const rows: ParsedRow[] = [];
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  let currentShapeID: string | null = null;
  let currentShapeLabel: string | null = null;
  let currentResourceURI: string | null = null;

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i], delimiter);
    const lineNum = i + 1;

    // Extract shapeID, shapeLabel, and resourceURI
    const rowShapeID = columnIndices.shapeID !== undefined ? values[columnIndices.shapeID] || null : null;
    const rowShapeLabel = columnIndices.shapeLabel !== undefined ? values[columnIndices.shapeLabel] || null : null;
    const rowResourceURI = columnIndices.resourceURI !== undefined ? values[columnIndices.resourceURI] || null : null;

    // Update current shape if provided
    if (rowShapeID) {
      currentShapeID = rowShapeID;
      currentShapeLabel = rowShapeLabel;
      currentResourceURI = rowResourceURI;
    } else if (rowShapeLabel && !currentShapeLabel) {
      currentShapeLabel = rowShapeLabel;
    }

    // Build row data
    const data: CreateRowRequest = {};

    if (columnIndices.propertyId !== undefined) {
      data.propertyId = values[columnIndices.propertyId] || undefined;
    }
    if (columnIndices.propertyLabel !== undefined) {
      data.propertyLabel = values[columnIndices.propertyLabel] || undefined;
    }
    if (columnIndices.mandatory !== undefined) {
      data.mandatory = values[columnIndices.mandatory] || undefined;
    }
    if (columnIndices.repeatable !== undefined) {
      data.repeatable = values[columnIndices.repeatable] || undefined;
    }
    if (columnIndices.valueNodeType !== undefined) {
      data.valueNodeType = values[columnIndices.valueNodeType] || undefined;
    }
    if (columnIndices.valueDataType !== undefined) {
      data.valueDataType = values[columnIndices.valueDataType] || undefined;
    }
    if (columnIndices.valueShape !== undefined) {
      data.valueShape = values[columnIndices.valueShape] || undefined;
    }
    if (columnIndices.valueConstraint !== undefined) {
      data.valueConstraint = values[columnIndices.valueConstraint] || undefined;
    }
    if (columnIndices.valueConstraintType !== undefined) {
      data.valueConstraintType = values[columnIndices.valueConstraintType] || undefined;
    }
    if (columnIndices.note !== undefined) {
      data.note = values[columnIndices.note] || undefined;
    }
    // LC extension columns
    if (columnIndices.lcDefaultLiteral !== undefined) {
      data.lcDefaultLiteral = values[columnIndices.lcDefaultLiteral] || undefined;
    }
    if (columnIndices.lcDefaultURI !== undefined) {
      data.lcDefaultURI = values[columnIndices.lcDefaultURI] || undefined;
    }
    if (columnIndices.lcDataTypeURI !== undefined) {
      data.lcDataTypeURI = values[columnIndices.lcDataTypeURI] || undefined;
    }
    if (columnIndices.lcRemark !== undefined) {
      data.lcRemark = values[columnIndices.lcRemark] || undefined;
    }

    // Skip completely empty rows
    const hasData = Object.values(data).some(v => v !== undefined && v !== '');
    if (!hasData && !rowShapeID) {
      continue;
    }

    if (!currentShapeID) {
      warnings.push({
        row: lineNum,
        message: 'Row has no associated shapeID, will use "default"',
        severity: 'warning'
      });
      currentShapeID = 'default';
    }

    rows.push({
      shapeID: currentShapeID,
      shapeLabel: currentShapeLabel,
      resourceURI: currentResourceURI,
      data
    });
  }

  return {
    success: errors.length === 0,
    rows,
    errors,
    warnings,
    detectedFormat: delimiter === '\t' ? 'tsv' : 'csv'
  };
}

export interface ImportResult {
  success: boolean;
  workspaceId?: string;
  shapesCreated?: number;
  rowsImported?: number;
  errors?: ValidationError[];
  warnings?: ValidationError[];
  unknownNamespaces?: string[];
}

export function importToWorkspace(
  content: string,
  workspaceName: string
): ImportResult {
  const parseResult = parseCSV(content);

  if (!parseResult.success || !parseResult.rows) {
    return {
      success: false,
      errors: parseResult.errors
    };
  }

  // Group rows by shape
  const shapeGroups = new Map<string, { label: string | null; resourceURI: string | null; rows: CreateRowRequest[] }>();

  for (const row of parseResult.rows) {
    const shapeId = row.shapeID || 'default';
    if (!shapeGroups.has(shapeId)) {
      shapeGroups.set(shapeId, { label: row.shapeLabel, resourceURI: row.resourceURI, rows: [] });
    }
    const group = shapeGroups.get(shapeId)!;
    if (row.shapeLabel && !group.label) {
      group.label = row.shapeLabel;
    }
    if (row.resourceURI && !group.resourceURI) {
      group.resourceURI = row.resourceURI;
    }
    group.rows.push(row.data);
  }

  // Create workspace
  const workspace = workspaceService.create(workspaceName);

  // Collect unknown namespaces
  const unknownNamespaces: string[] = [];
  const knownPrefixes = new Set(DEFAULT_NAMESPACES.map(ns => ns.prefix));

  // Create shapes and import rows
  let totalRows = 0;
  const allWarnings: ValidationError[] = [...(parseResult.warnings || [])];

  for (const [shapeId, group] of shapeGroups) {
    shapeService.create(workspace.id, shapeId, group.label || undefined, group.resourceURI || undefined);

    for (let i = 0; i < group.rows.length; i++) {
      const rowData = group.rows[i];

      // Check for unknown prefixes
      if (rowData.propertyId) {
        const colonIndex = rowData.propertyId.indexOf(':');
        if (colonIndex > 0) {
          const prefix = rowData.propertyId.substring(0, colonIndex);
          // Check for full URIs (http:// or https://)
          if (prefix === 'http' || prefix === 'https') {
            allWarnings.push({
              message: `Shape "${shapeId}", row ${i + 1}: Property ID "${rowData.propertyId}" appears to be a full URI. Consider using a prefixed form.`,
              severity: 'warning'
            });
          } else if (!knownPrefixes.has(prefix) && !unknownNamespaces.includes(prefix)) {
            unknownNamespaces.push(prefix);
          }
        }
      }

      rowService.create(workspace.id, shapeId, { ...rowData, rowOrder: i });
      totalRows++;
    }
  }

  // Add placeholder for unknown namespaces
  for (const prefix of unknownNamespaces) {
    namespaceService.create(workspace.id, prefix, `http://example.org/${prefix}/`);
    allWarnings.push({
      message: `Unknown namespace prefix "${prefix}" - placeholder URI created. You may want to update this in the Namespaces panel.`,
      severity: 'warning'
    });
  }

  return {
    success: true,
    workspaceId: workspace.id,
    shapesCreated: shapeGroups.size,
    rowsImported: totalRows,
    warnings: allWarnings.length > 0 ? allWarnings : undefined,
    unknownNamespaces: unknownNamespaces.length > 0 ? unknownNamespaces : undefined
  };
}

export function exportWorkspace(
  workspaceId: string,
  format: 'csv' | 'tsv' = 'csv'
): string {
  const delimiter = format === 'tsv' ? '\t' : ',';
  const shapes = shapeService.list(workspaceId);

  const headers = [
    'shapeID',
    'shapeLabel',
    'resourceURI',
    'propertyID',
    'propertyLabel',
    'mandatory',
    'repeatable',
    'valueNodeType',
    'valueDataType',
    'valueShape',
    'valueConstraint',
    'valueConstraintType',
    'note',
    // LC extension columns
    'lcDefaultLiteral',
    'lcDefaultURI',
    'lcDataTypeURI',
    'lcRemark'
  ];

  const lines: string[] = [headers.join(delimiter)];

  for (const shape of shapes) {
    const rows = rowService.list(workspaceId, shape.shapeId);
    let isFirstRow = true;

    for (const row of rows) {
      const values = [
        escapeCSVValue(isFirstRow ? shape.shapeId : '', delimiter),
        escapeCSVValue(isFirstRow ? shape.shapeLabel : '', delimiter),
        escapeCSVValue(isFirstRow ? shape.resourceURI : '', delimiter),
        escapeCSVValue(row.propertyId, delimiter),
        escapeCSVValue(row.propertyLabel, delimiter),
        escapeCSVValue(row.mandatory, delimiter),
        escapeCSVValue(row.repeatable, delimiter),
        escapeCSVValue(row.valueNodeType, delimiter),
        escapeCSVValue(row.valueDataType, delimiter),
        escapeCSVValue(row.valueShape, delimiter, true), // Convert newlines to pipes
        escapeCSVValue(row.valueConstraint, delimiter, true), // Convert newlines to pipes
        escapeCSVValue(row.valueConstraintType, delimiter),
        escapeCSVValue(row.note, delimiter),
        // LC extension columns
        escapeCSVValue(row.lcDefaultLiteral, delimiter),
        escapeCSVValue(row.lcDefaultURI, delimiter),
        escapeCSVValue(row.lcDataTypeURI, delimiter),
        escapeCSVValue(row.lcRemark, delimiter)
      ];
      lines.push(values.join(delimiter));
      isFirstRow = false;
    }

    // If shape has no rows, still output the shape header
    if (rows.length === 0) {
      const values = [
        escapeCSVValue(shape.shapeId, delimiter),
        escapeCSVValue(shape.shapeLabel, delimiter),
        escapeCSVValue(shape.resourceURI, delimiter),
        '', '', '', '', '', '', '', '', '', '', '', '', '', ''
      ];
      lines.push(values.join(delimiter));
    }
  }

  return lines.join('\n');
}
