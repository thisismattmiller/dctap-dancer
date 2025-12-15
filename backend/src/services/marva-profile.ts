// Marva Profile Import/Export Service

import {
  MarvaProfileDocument,
  MarvaProfile,
  MarvaResourceTemplate,
  MarvaPropertyTemplate,
  ImportMarvaProfileResult
} from '../types/marva-profile.js';
import {
  workspaceService,
  shapeService,
  rowService,
  namespaceService,
  optionsService,
  folderService
} from './database.js';
import { CreateRowRequest, DEFAULT_NAMESPACES } from '../types/dctap.js';
import { v4 as uuidv4 } from 'uuid';
import { isStartingPointShape, isInStartingPointFolder } from './starting-point.js';

/**
 * Convert a full URI to prefixed form if a matching namespace exists
 */
function prefixUri(uri: string, namespaces: Array<{ prefix: string; namespace: string }>): string {
  for (const ns of namespaces) {
    if (uri.startsWith(ns.namespace)) {
      const localPart = uri.substring(ns.namespace.length);
      return `${ns.prefix}:${localPart}`;
    }
  }
  return uri;
}

/**
 * Convert a prefixed URI back to full form
 */
function expandUri(prefixedUri: string, namespaces: Array<{ prefix: string; namespace: string }>): string {
  const colonIndex = prefixedUri.indexOf(':');
  if (colonIndex === -1) return prefixedUri;

  const prefix = prefixedUri.substring(0, colonIndex);
  const localPart = prefixedUri.substring(colonIndex + 1);

  // Check if it looks like a full URI (has ://)
  if (prefixedUri.includes('://')) return prefixedUri;

  for (const ns of namespaces) {
    if (ns.prefix === prefix) {
      return ns.namespace + localPart;
    }
  }
  return prefixedUri;
}

/**
 * Convert a property template to a row request
 */
function propertyTemplateToRow(
  prop: MarvaPropertyTemplate,
  rowOrder: number,
  namespaces: Array<{ prefix: string; namespace: string }>
): CreateRowRequest {
  const row: CreateRowRequest = {
    rowOrder,
    propertyId: prefixUri(prop.propertyURI, namespaces),
    propertyLabel: prop.propertyLabel,
    mandatory: prop.mandatory,
    repeatable: prop.repeatable || prop.valueConstraint?.repeatable || 'false',
    lcRemark: prop.remark || undefined
  };

  // Handle type-specific logic
  if (prop.type === 'literal') {
    row.valueNodeType = 'literal';
  } else if (prop.type === 'resource' || prop.type === 'list') {
    // If valueTemplateRefs is populated, set bnode and value shape
    // 'list' type also uses valueTemplateRefs for component references
    if (prop.valueConstraint?.valueTemplateRefs?.length > 0) {
      row.valueNodeType = 'bnode';
      // Handle both array and comma-separated string formats
      const refs = prop.valueConstraint.valueTemplateRefs;
      const refArray = refs.flatMap(ref =>
        typeof ref === 'string' ? ref.split(',').map(s => s.trim()).filter(Boolean) : [ref]
      );
      row.valueShape = refArray.join('\n');
    }
  } else if (prop.type === 'lookup') {
    // If useValuesFrom is populated, set constraint type to IRIstem
    if (prop.valueConstraint?.useValuesFrom?.length > 0) {
      row.valueConstraintType = 'IRIstem';
      // Handle both array and comma-separated string formats
      const vals = prop.valueConstraint.useValuesFrom;
      const valArray = vals.flatMap(val =>
        typeof val === 'string' ? val.split(',').map(s => s.trim()).filter(Boolean) : [val]
      );
      row.valueConstraint = valArray.join('\n');
    }
  }

  // Handle LC dataTypeURI
  if (prop.valueConstraint?.valueDataType?.dataTypeURI) {
    row.lcDataTypeURI = prefixUri(prop.valueConstraint.valueDataType.dataTypeURI, namespaces);
  }

  // Handle defaults -> lcDefaultLiteral and lcDefaultURI
  if (prop.valueConstraint?.defaults?.length > 0) {
    const literals: string[] = [];
    const uris: string[] = [];

    for (const def of prop.valueConstraint.defaults) {
      if (def.defaultLiteral) {
        literals.push(def.defaultLiteral);
      }
      if (def.defaultURI) {
        uris.push(def.defaultURI);
      }
    }

    if (literals.length > 0) {
      row.lcDefaultLiteral = literals.join('\n');
    }
    if (uris.length > 0) {
      row.lcDefaultURI = uris.join('\n');
    }
  }

  return row;
}

/**
 * Extract folder name from a shape ID based on common patterns
 * e.g., "lc:profile:bf2:Work" -> "profile_bf2"
 *       "lc:RT:bf2:Title:LookupTitleLc" -> "RT_bf2_Title"
 *       "lc:RT:bflc:Agents:PersonLite" -> "RT_bflc_Agents"
 */
function extractFolderName(shapeId: string): string | null {
  // Split by colons
  const parts = shapeId.split(':');

  // Look for patterns like lc:profile:XXX or lc:RT:XXX where XXX is the group
  if (parts.length >= 3 && parts[0] === 'lc') {
    const type = parts[1]; // e.g., "profile", "RT"
    const group = parts[2]; // e.g., "bf2", "bflc"

    // Only use it as a folder if the group looks like a short identifier (not a full name)
    if (type && group && group.length <= 20 && !group.includes(' ')) {
      // For RT types with 4+ parts, include the 4th segment for finer grouping
      // e.g., "lc:RT:bf2:Identifiers:..." -> "RT_bf2_Identifiers"
      if (type === 'RT' && parts.length >= 4 && parts[3] && parts[3].length <= 30 && !parts[3].includes(' ')) {
        return `${type}_${group}_${parts[3]}`;
      }
      return `${type}_${group}`;
    }
  }

  return null;
}

/**
 * Import Marva Profile JSON documents into a new workspace
 */
export function importMarvaProfiles(
  workspaceName: string,
  profiles: MarvaProfileDocument[]
): ImportMarvaProfileResult {
  // Create new workspace
  const workspace = workspaceService.create(workspaceName);

  // Set useLCColumns to true
  optionsService.update(workspace.id, { useLCColumns: true });

  // Get namespaces for URI prefixing
  const namespaces = namespaceService.list(workspace.id);

  let shapesCreated = 0;
  let rowsCreated = 0;

  // Track folders: folderName -> folderId
  const folderMap = new Map<string, number>();

  // Helper to get or create folder
  function getOrCreateFolder(folderName: string): number {
    if (folderMap.has(folderName)) {
      return folderMap.get(folderName)!;
    }
    const folder = folderService.create(workspace.id, folderName);
    folderMap.set(folderName, folder.id);
    return folder.id;
  }

  // Process each profile document
  for (const doc of profiles) {
    const profile = doc.json.Profile;
    if (!profile) continue;

    // Create the profile shape (links to all resourceTemplates)
    const profileShapeId = profile.id;
    const profileFolderName = extractFolderName(profileShapeId);
    const profileFolderId = profileFolderName ? getOrCreateFolder(profileFolderName) : undefined;

    shapeService.create(
      workspace.id,
      profileShapeId,
      profile.title,
      undefined, // No resourceURI for profile shape
      profileFolderId,
      profile.description || undefined // Description from profile
    );
    shapesCreated++;

    // Collect all resourceTemplate IDs for linking
    const resourceTemplateIds: string[] = [];

    // Create shapes for each resourceTemplate
    for (const rt of profile.resourceTemplates || []) {
      resourceTemplateIds.push(rt.id);

      // Determine folder for this shape
      const rtFolderName = extractFolderName(rt.id);
      const rtFolderId = rtFolderName ? getOrCreateFolder(rtFolderName) : undefined;

      // Prefix the resourceURI if present
      const prefixedResourceURI = rt.resourceURI ? prefixUri(rt.resourceURI, namespaces) : undefined;

      shapeService.create(
        workspace.id,
        rt.id,
        rt.resourceLabel || undefined,
        prefixedResourceURI,
        rtFolderId,
        rt.remark || undefined // Description from resource template remark
      );
      shapesCreated++;

      // Create rows for each propertyTemplate
      let rowOrder = 0;
      for (const prop of rt.propertyTemplates || []) {
        const rowData = propertyTemplateToRow(prop, rowOrder, namespaces);
        rowService.create(workspace.id, rt.id, rowData);
        rowsCreated++;
        rowOrder++;
      }
    }

    // Create rows in the profile shape linking to each resourceTemplate
    let linkRowOrder = 0;
    for (const rtId of resourceTemplateIds) {
      rowService.create(workspace.id, profileShapeId, {
        rowOrder: linkRowOrder,
        propertyId: 'dcterms:hasPart',
        propertyLabel: 'Has Shape',
        valueShape: rtId,
        valueNodeType: 'bnode'
      });
      rowsCreated++;
      linkRowOrder++;
    }
  }

  return {
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    shapesCreated,
    rowsCreated
  };
}

/**
 * Export a workspace to Marva Profile JSON format
 * Excludes starting point shapes (shapes in Starting Points folder or with 'startingpoint' in ID)
 */
export function exportMarvaProfiles(workspaceId: string): MarvaProfileDocument[] {
  const workspace = workspaceService.get(workspaceId);
  if (!workspace) {
    throw new Error('Workspace not found');
  }

  const namespaces = namespaceService.list(workspaceId);
  const allShapes = shapeService.list(workspaceId);

  // Filter out starting point shapes
  const shapes = allShapes.filter(shape =>
    !isStartingPointShape(shape.shapeId) &&
    !isInStartingPointFolder(workspaceId, shape.folderId)
  );

  // Find profile shapes (shapes that have dcterms:hasPart rows linking to other shapes)
  const profileShapes: Array<{
    shape: typeof shapes[0];
    linkedShapeIds: string[];
  }> = [];

  const linkedShapeIds = new Set<string>();

  for (const shape of shapes) {
    const rows = rowService.list(workspaceId, shape.shapeId);
    const hasPartRows = rows.filter(r =>
      r.propertyId === 'dcterms:hasPart' && r.propertyLabel === 'Has Shape' && r.valueShape
    );

    if (hasPartRows.length > 0) {
      const ids = hasPartRows
        .map(r => r.valueShape!)
        .flatMap(vs => vs.split('\n').map(s => s.trim()).filter(Boolean))
        // Filter out starting point shape references
        .filter(id => !isStartingPointShape(id));

      if (ids.length > 0) {
        profileShapes.push({
          shape,
          linkedShapeIds: ids
        });

        ids.forEach(id => linkedShapeIds.add(id));
      }
    }
  }

  // Build profile documents
  const documents: MarvaProfileDocument[] = [];

  for (const profileInfo of profileShapes) {
    const profile: MarvaProfile = {
      id: profileInfo.shape.shapeId,
      title: profileInfo.shape.shapeLabel || profileInfo.shape.shapeId,
      description: profileInfo.shape.description || undefined,
      resourceTemplates: []
    };

    // Add resource templates
    for (const rtId of profileInfo.linkedShapeIds) {
      const rtShape = shapes.find(s => s.shapeId === rtId);
      if (!rtShape) continue;

      const rtRows = rowService.list(workspaceId, rtId);

      const resourceTemplate: MarvaResourceTemplate = {
        id: rtId,
        resourceURI: rtShape.resourceURI ? expandUri(rtShape.resourceURI, namespaces) : undefined,
        resourceLabel: rtShape.shapeLabel || undefined,
        remark: rtShape.description || undefined,
        propertyTemplates: []
      };

      // Convert rows to property templates
      for (const row of rtRows) {
        const prop: MarvaPropertyTemplate = {
          propertyURI: expandUri(row.propertyId || '', namespaces),
          propertyLabel: row.propertyLabel || '',
          mandatory: row.mandatory || 'false',
          repeatable: row.repeatable || 'false',
          type: 'literal',
          resourceTemplates: [],
          valueConstraint: {
            valueTemplateRefs: [],
            useValuesFrom: [],
            defaults: [],
            valueDataType: {}
          }
        };

        // Determine type based on data
        if (row.valueNodeType === 'literal') {
          prop.type = 'literal';
        } else if (row.valueNodeType === 'bnode' && row.valueShape) {
          prop.type = 'resource';
          prop.valueConstraint.valueTemplateRefs = row.valueShape
            .split('\n')
            .map(s => s.trim())
            .filter(Boolean);
        } else if (row.valueConstraintType === 'IRIstem' && row.valueConstraint) {
          prop.type = 'lookup';
          prop.valueConstraint.useValuesFrom = row.valueConstraint
            .split('\n')
            .map(s => s.trim())
            .filter(Boolean);
        } else if (row.valueShape) {
          prop.type = 'resource';
          prop.valueConstraint.valueTemplateRefs = row.valueShape
            .split('\n')
            .map(s => s.trim())
            .filter(Boolean);
        }

        // Handle LC dataTypeURI
        if (row.lcDataTypeURI) {
          prop.valueConstraint.valueDataType = {
            dataTypeURI: expandUri(row.lcDataTypeURI, namespaces)
          };
        }

        // Handle defaults
        const defaultLiterals = row.lcDefaultLiteral?.split('\n').filter(Boolean) || [];
        const defaultURIs = row.lcDefaultURI?.split('\n').filter(Boolean) || [];
        const maxDefaults = Math.max(defaultLiterals.length, defaultURIs.length);

        for (let i = 0; i < maxDefaults; i++) {
          const def: { defaultLiteral?: string; defaultURI?: string } = {};
          if (defaultLiterals[i]) def.defaultLiteral = defaultLiterals[i];
          if (defaultURIs[i]) def.defaultURI = defaultURIs[i];
          if (Object.keys(def).length > 0) {
            prop.valueConstraint.defaults.push(def);
          }
        }

        // Handle remark
        if (row.lcRemark) {
          prop.remark = row.lcRemark;
        }

        resourceTemplate.propertyTemplates.push(prop);
      }

      profile.resourceTemplates.push(resourceTemplate);
    }

    const now = new Date().toISOString();
    const doc: MarvaProfileDocument = {
      id: uuidv4(),
      name: profile.title,
      configType: 'profile',
      json: {
        Profile: profile
      },
      metadata: {
        createDate: now,
        updateDate: now
      },
      created: now,
      modified: now
    };

    documents.push(doc);
  }

  // If no profile shapes found, create a single profile from all shapes
  if (documents.length === 0 && shapes.length > 0) {
    const profile: MarvaProfile = {
      id: `lc:profile:${workspace.name.toLowerCase().replace(/\s+/g, '_')}`,
      title: workspace.name,
      resourceTemplates: []
    };

    for (const shape of shapes) {
      const rows = rowService.list(workspaceId, shape.shapeId);

      const resourceTemplate: MarvaResourceTemplate = {
        id: shape.shapeId,
        resourceURI: shape.resourceURI ? expandUri(shape.resourceURI, namespaces) : undefined,
        resourceLabel: shape.shapeLabel || undefined,
        remark: shape.description || undefined,
        propertyTemplates: []
      };

      for (const row of rows) {
        const prop: MarvaPropertyTemplate = {
          propertyURI: expandUri(row.propertyId || '', namespaces),
          propertyLabel: row.propertyLabel || '',
          mandatory: row.mandatory || 'false',
          repeatable: row.repeatable || 'false',
          type: 'literal',
          resourceTemplates: [],
          valueConstraint: {
            valueTemplateRefs: [],
            useValuesFrom: [],
            defaults: [],
            valueDataType: {}
          }
        };

        if (row.valueNodeType === 'literal') {
          prop.type = 'literal';
        } else if (row.valueNodeType === 'bnode' && row.valueShape) {
          prop.type = 'resource';
          prop.valueConstraint.valueTemplateRefs = row.valueShape
            .split('\n')
            .map(s => s.trim())
            .filter(Boolean);
        } else if (row.valueConstraintType === 'IRIstem' && row.valueConstraint) {
          prop.type = 'lookup';
          prop.valueConstraint.useValuesFrom = row.valueConstraint
            .split('\n')
            .map(s => s.trim())
            .filter(Boolean);
        }

        if (row.lcDataTypeURI) {
          prop.valueConstraint.valueDataType = {
            dataTypeURI: expandUri(row.lcDataTypeURI, namespaces)
          };
        }

        const defaultLiterals = row.lcDefaultLiteral?.split('\n').filter(Boolean) || [];
        const defaultURIs = row.lcDefaultURI?.split('\n').filter(Boolean) || [];
        const maxDefaults = Math.max(defaultLiterals.length, defaultURIs.length);

        for (let i = 0; i < maxDefaults; i++) {
          const def: { defaultLiteral?: string; defaultURI?: string } = {};
          if (defaultLiterals[i]) def.defaultLiteral = defaultLiterals[i];
          if (defaultURIs[i]) def.defaultURI = defaultURIs[i];
          if (Object.keys(def).length > 0) {
            prop.valueConstraint.defaults.push(def);
          }
        }

        if (row.lcRemark) {
          prop.remark = row.lcRemark;
        }

        resourceTemplate.propertyTemplates.push(prop);
      }

      profile.resourceTemplates.push(resourceTemplate);
    }

    const now = new Date().toISOString();
    documents.push({
      id: uuidv4(),
      name: workspace.name,
      configType: 'profile',
      json: {
        Profile: profile
      },
      metadata: {
        createDate: now,
        updateDate: now
      },
      created: now,
      modified: now
    });
  }

  return documents;
}
