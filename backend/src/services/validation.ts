import {
  ValidationError,
  ValidationResult,
  StatementRow,
  VALUE_NODE_TYPES,
  VALUE_CONSTRAINT_TYPES,
  XSD_DATATYPES,
  Namespace
} from '../types/dctap.js';
import { shapeService, namespaceService } from './database.js';

export function validateRow(
  workspaceId: string,
  row: Partial<StatementRow>,
  existingShapes?: string[],
  namespaces?: Namespace[]
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Get shapes if not provided
  const shapes = existingShapes || shapeService.list(workspaceId).map(s => s.shapeId);

  // Get namespaces if not provided
  const nsList = namespaces || namespaceService.list(workspaceId);
  const prefixes = new Set(nsList.map(ns => ns.prefix));

  // Rule 1: propertyID is required (warning if empty for non-empty rows)
  const hasAnyData = row.propertyLabel || row.mandatory || row.repeatable ||
    row.valueNodeType || row.valueDataType || row.valueShape ||
    row.valueConstraint || row.valueConstraintType || row.note;

  if (!row.propertyId && hasAnyData) {
    warnings.push({
      column: 'propertyId',
      message: 'Property ID is required',
      severity: 'warning'
    });
  }

  // Rule 2: Check prefix exists in propertyId
  if (row.propertyId) {
    const colonIndex = row.propertyId.indexOf(':');
    if (colonIndex > 0) {
      const prefix = row.propertyId.substring(0, colonIndex);
      // Check if this looks like a full URI (e.g., http:// or https://)
      if (prefix === 'http' || prefix === 'https') {
        warnings.push({
          column: 'propertyId',
          message: `Property ID "${row.propertyId}" appears to be a full URI. Consider using a prefixed form (e.g., dcterms:title) instead.`,
          severity: 'warning'
        });
      } else if (!prefixes.has(prefix)) {
        warnings.push({
          column: 'propertyId',
          message: `Unknown namespace prefix "${prefix}" in property ID "${row.propertyId}"`,
          severity: 'warning'
        });
      }
    }
  }

  // Rule 3: valueNodeType must be valid if set (case-insensitive comparison)
  const nodeTypeLower = row.valueNodeType?.toLowerCase();
  const validNodeTypes = VALUE_NODE_TYPES.map(t => t.toLowerCase());
  if (row.valueNodeType && !validNodeTypes.includes(nodeTypeLower as string)) {
    errors.push({
      column: 'valueNodeType',
      message: `Invalid valueNodeType: ${row.valueNodeType}. Must be one of: ${VALUE_NODE_TYPES.join(', ')}`,
      severity: 'error'
    });
  }

  // Rule 4: valueDataType only valid when valueNodeType is 'literal'
  if (row.valueDataType && nodeTypeLower && nodeTypeLower !== 'literal') {
    errors.push({
      column: 'valueDataType',
      message: 'valueDataType can only be used when valueNodeType is "literal"',
      severity: 'error'
    });
  }

  // Rule 5: Check valueDataType is valid XSD type
  if (row.valueDataType && !XSD_DATATYPES.includes(row.valueDataType as typeof XSD_DATATYPES[number])) {
    warnings.push({
      column: 'valueDataType',
      message: `Unknown datatype: ${row.valueDataType}. Common types: ${XSD_DATATYPES.slice(0, 5).join(', ')}...`,
      severity: 'warning'
    });
  }

  // Rule 6: valueShape only valid when valueNodeType is 'IRI' or 'bnode'
  if (row.valueShape && nodeTypeLower === 'literal') {
    errors.push({
      column: 'valueShape',
      message: 'valueShape cannot be used when valueNodeType is "literal"',
      severity: 'error'
    });
  }

  // Rule 7: valueShape must reference existing shape(s)
  // valueShape can contain multiple values separated by pipe, comma, or newline
  if (row.valueShape) {
    const valueShapes = row.valueShape.split(/[,|\n]/).map(s => s.trim()).filter(s => s);
    const invalidShapes = valueShapes.filter(vs => !shapes.includes(vs));
    if (invalidShapes.length > 0) {
      errors.push({
        column: 'valueShape',
        message: `valueShape references non-existent shape(s): ${invalidShapes.join(', ')}`,
        severity: 'error'
      });
    }
  }

  // Rule 8: valueConstraintType must be valid
  if (row.valueConstraintType && !VALUE_CONSTRAINT_TYPES.includes(row.valueConstraintType as typeof VALUE_CONSTRAINT_TYPES[number])) {
    errors.push({
      column: 'valueConstraintType',
      message: `Invalid valueConstraintType: ${row.valueConstraintType}. Must be one of: ${VALUE_CONSTRAINT_TYPES.join(', ')}`,
      severity: 'error'
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

export function validateShape(
  workspaceId: string,
  shapeId: string,
  rows: StatementRow[]
): ValidationResult {
  const allErrors: ValidationError[] = [];
  const allWarnings: ValidationError[] = [];

  const shapes = shapeService.list(workspaceId).map(s => s.shapeId);
  const namespaces = namespaceService.list(workspaceId);

  for (let i = 0; i < rows.length; i++) {
    const result = validateRow(workspaceId, rows[i], shapes, namespaces);
    for (const error of result.errors) {
      allErrors.push({ ...error, row: i });
    }
    for (const warning of result.warnings) {
      allWarnings.push({ ...warning, row: i });
    }
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings
  };
}
