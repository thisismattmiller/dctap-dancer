// LC Starting Point Import/Export Service

import {
  StartingPointFile,
  StartingPointMenuGroup,
  StartingPointConfig,
  ImportStartingPointResult,
  STARTING_POINT_FOLDER_NAME,
  STARTING_POINT_PREFIX,
  STARTING_POINT_INDEX_ID
} from '../types/starting-point.js';
import {
  shapeService,
  rowService,
  folderService
} from './database.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Check if a shape ID is a starting point shape
 */
export function isStartingPointShape(shapeId: string): boolean {
  return shapeId.toLowerCase().startsWith(STARTING_POINT_PREFIX.toLowerCase()) ||
         shapeId.toLowerCase().includes('startingpoint');
}

/**
 * Check if a shape is in the Starting Points folder
 */
export function isInStartingPointFolder(workspaceId: string, folderId: number | null): boolean {
  if (folderId === null) return false;

  const folders = folderService.list(workspaceId);
  const folder = folders.find(f => f.id === folderId);
  return folder?.name === STARTING_POINT_FOLDER_NAME;
}

/**
 * Get or create the Starting Points folder
 */
function getOrCreateStartingPointFolder(workspaceId: string): number {
  const folders = folderService.list(workspaceId);
  const existingFolder = folders.find(f => f.name === STARTING_POINT_FOLDER_NAME);

  if (existingFolder) {
    return existingFolder.id;
  }

  const newFolder = folderService.create(workspaceId, STARTING_POINT_FOLDER_NAME);
  return newFolder.id;
}

/**
 * Import LC Starting Point JSON file into a workspace
 */
export function importStartingPoints(
  workspaceId: string,
  data: StartingPointFile
): ImportStartingPointResult {
  // Find the startingPoints config in the file
  const config = data.find(item => item.configType === 'startingPoints');
  if (!config) {
    throw new Error('No startingPoints config found in file');
  }

  const menuGroups = config.json;
  if (!Array.isArray(menuGroups) || menuGroups.length === 0) {
    throw new Error('No menu groups found in starting points config');
  }

  // Get or create the Starting Points folder
  const folderId = getOrCreateStartingPointFolder(workspaceId);

  let shapesCreated = 0;
  let rowsCreated = 0;

  // Track created shape IDs for the index
  const createdShapeIds: Array<{ shapeId: string; label: string }> = [];

  // Create a shape for each menu group
  for (const group of menuGroups) {
    const shapeId = `${STARTING_POINT_PREFIX}${group.menuGroup.replace(/\s+/g, '_')}`;
    const shapeLabel = group.menuGroup;

    // Check if shape already exists
    const existing = shapeService.get(workspaceId, shapeId);
    if (existing) {
      // Delete existing shape to replace it
      shapeService.delete(workspaceId, shapeId);
    }

    // Create the shape
    shapeService.create(
      workspaceId,
      shapeId,
      shapeLabel,
      undefined, // resourceURI
      folderId
    );
    shapesCreated++;
    createdShapeIds.push({ shapeId, label: shapeLabel });

    // Create rows for each menu item
    let rowOrder = 0;
    for (const item of group.menuItems) {
      // Get the first type and resourceTemplate (most common case)
      const type = item.type[0] || '';
      const resourceTemplate = item.useResourceTemplates[0] || '';

      rowService.create(workspaceId, shapeId, {
        rowOrder,
        propertyId: 'dcterms:hasPart',
        propertyLabel: item.label,
        valueNodeType: 'IRI',
        valueShape: resourceTemplate,
        valueConstraint: type,
        valueConstraintType: 'picklist'
      });
      rowsCreated++;
      rowOrder++;
    }
  }

  // Create or update the index shape
  const existingIndex = shapeService.get(workspaceId, STARTING_POINT_INDEX_ID);
  if (existingIndex) {
    shapeService.delete(workspaceId, STARTING_POINT_INDEX_ID);
  }

  shapeService.create(
    workspaceId,
    STARTING_POINT_INDEX_ID,
    'Starting Point Index',
    undefined,
    folderId
  );
  shapesCreated++;

  // Create rows in the index linking to each menu group shape
  let indexRowOrder = 0;
  for (const { shapeId, label } of createdShapeIds) {
    rowService.create(workspaceId, STARTING_POINT_INDEX_ID, {
      rowOrder: indexRowOrder,
      propertyId: 'dcterms:hasPart',
      propertyLabel: label,
      valueShape: shapeId
    });
    rowsCreated++;
    indexRowOrder++;
  }

  return {
    shapesCreated,
    rowsCreated,
    folderId
  };
}

/**
 * Export starting points from a workspace to LC Starting Point JSON format
 * Orders menu groups according to the startingpoint:index row order
 */
export function exportStartingPoints(workspaceId: string): StartingPointFile | null {
  const shapes = shapeService.list(workspaceId);

  // Find starting point shapes (excluding the index)
  const startingPointShapes = shapes.filter(shape =>
    isStartingPointShape(shape.shapeId) &&
    shape.shapeId !== STARTING_POINT_INDEX_ID
  );

  if (startingPointShapes.length === 0) {
    return null;
  }

  // Get the index shape to determine ordering
  const indexShape = shapes.find(shape => shape.shapeId === STARTING_POINT_INDEX_ID);
  let orderedShapeIds: string[] = [];

  if (indexShape) {
    // Get rows from index shape, sorted by rowOrder
    const indexRows = rowService.list(workspaceId, STARTING_POINT_INDEX_ID);
    // Extract shape IDs in order from the index rows
    orderedShapeIds = indexRows
      .filter(row => row.valueShape)
      .map(row => row.valueShape as string);
  }

  // Build a map of shapeId -> shape for quick lookup
  const shapeMap = new Map(startingPointShapes.map(s => [s.shapeId, s]));

  // Order shapes: first by index order, then any remaining shapes not in index
  const orderedShapes = [
    // Shapes that are in the index, in index order
    ...orderedShapeIds
      .filter(id => shapeMap.has(id))
      .map(id => shapeMap.get(id)!),
    // Any shapes not referenced in the index
    ...startingPointShapes.filter(s => !orderedShapeIds.includes(s.shapeId))
  ];

  const menuGroups: StartingPointMenuGroup[] = [];

  for (const shape of orderedShapes) {
    const rows = rowService.list(workspaceId, shape.shapeId);

    const menuItems = rows
      .filter(row => row.propertyId === 'dcterms:hasPart')
      .map(row => ({
        label: row.propertyLabel || '',
        type: row.valueConstraint ? [row.valueConstraint] : [],
        useResourceTemplates: row.valueShape ? [row.valueShape] : []
      }));

    if (menuItems.length > 0) {
      menuGroups.push({
        menuGroup: shape.shapeLabel || shape.shapeId.replace(STARTING_POINT_PREFIX, '').replace(/_/g, ' '),
        menuItems
      });
    }
  }

  if (menuGroups.length === 0) {
    return null;
  }

  const config: StartingPointConfig = {
    id: uuidv4(),
    name: 'config',
    configType: 'startingPoints',
    json: menuGroups
  };

  return [config];
}

/**
 * Check if workspace has any starting points
 */
export function hasStartingPoints(workspaceId: string): boolean {
  const shapes = shapeService.list(workspaceId);
  return shapes.some(shape => isStartingPointShape(shape.shapeId));
}
