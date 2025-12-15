import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isStartingPointShape,
  isInStartingPointFolder,
  importStartingPoints,
  exportStartingPoints,
  hasStartingPoints
} from './starting-point.js';
import {
  STARTING_POINT_PREFIX,
  STARTING_POINT_FOLDER_NAME,
  STARTING_POINT_INDEX_ID
} from '../types/starting-point.js';

// Mock the database services
vi.mock('./database.js', () => ({
  shapeService: {
    list: vi.fn(() => []),
    get: vi.fn(() => null),
    create: vi.fn((workspaceId, shapeId, shapeLabel) => ({
      id: 1,
      shapeId,
      shapeLabel,
      description: null,
      resourceURI: null,
      folderId: null,
      createdAt: 1000,
      updatedAt: 1000
    })),
    delete: vi.fn(() => true)
  },
  rowService: {
    list: vi.fn(() => []),
    create: vi.fn((workspaceId, shapeId, data) => ({
      id: 1,
      rowOrder: data.rowOrder || 0,
      propertyId: data.propertyId || null,
      propertyLabel: data.propertyLabel || null,
      mandatory: null,
      repeatable: null,
      valueNodeType: data.valueNodeType || null,
      valueDataType: null,
      valueShape: data.valueShape || null,
      valueConstraint: data.valueConstraint || null,
      valueConstraintType: data.valueConstraintType || null,
      lcDefaultLiteral: null,
      lcDefaultURI: null,
      note: null,
      lcDataTypeURI: null,
      lcRemark: null,
      hasErrors: 0,
      errorDetails: null,
      createdAt: 1000,
      updatedAt: 1000
    }))
  },
  folderService: {
    list: vi.fn(() => []),
    create: vi.fn((workspaceId, name) => ({
      id: 1,
      name,
      createdAt: 1000
    }))
  }
}));

describe('Starting Point Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isStartingPointShape', () => {
    it('should return true for shapes with starting point prefix', () => {
      expect(isStartingPointShape(`${STARTING_POINT_PREFIX}WorksBF2`)).toBe(true);
      expect(isStartingPointShape('startingpoint:TestShape')).toBe(true);
    });

    it('should return true for shapes with startingpoint in ID (case-insensitive)', () => {
      expect(isStartingPointShape('StartingPointMenu')).toBe(true);
      expect(isStartingPointShape('somethingStartingPointelse')).toBe(true);
      expect(isStartingPointShape('STARTINGPOINT_test')).toBe(true);
    });

    it('should return false for regular shapes', () => {
      expect(isStartingPointShape('Person')).toBe(false);
      expect(isStartingPointShape('bf:Work')).toBe(false);
      expect(isStartingPointShape('Organization')).toBe(false);
    });

    it('should return true for the starting point index', () => {
      expect(isStartingPointShape(STARTING_POINT_INDEX_ID)).toBe(true);
    });
  });

  describe('isInStartingPointFolder', () => {
    it('should return false for null folderId', () => {
      const result = isInStartingPointFolder('workspace-1', null);
      expect(result).toBe(false);
    });

    it('should return true when shape is in Starting Points folder', async () => {
      const { folderService } = await import('./database.js');
      vi.mocked(folderService.list).mockReturnValue([
        { id: 1, name: STARTING_POINT_FOLDER_NAME, createdAt: 1000 },
        { id: 2, name: 'Other Folder', createdAt: 1000 }
      ]);

      const result = isInStartingPointFolder('workspace-1', 1);
      expect(result).toBe(true);
    });

    it('should return false when shape is in different folder', async () => {
      const { folderService } = await import('./database.js');
      vi.mocked(folderService.list).mockReturnValue([
        { id: 1, name: STARTING_POINT_FOLDER_NAME, createdAt: 1000 },
        { id: 2, name: 'Other Folder', createdAt: 1000 }
      ]);

      const result = isInStartingPointFolder('workspace-1', 2);
      expect(result).toBe(false);
    });

    it('should return false when folder does not exist', async () => {
      const { folderService } = await import('./database.js');
      vi.mocked(folderService.list).mockReturnValue([]);

      const result = isInStartingPointFolder('workspace-1', 999);
      expect(result).toBe(false);
    });
  });

  describe('importStartingPoints', () => {
    it('should throw error if no startingPoints config in file', () => {
      const data = [{ configType: 'other', json: [] }] as never;

      expect(() => importStartingPoints('workspace-1', data)).toThrow('No startingPoints config found');
    });

    it('should throw error if no menu groups in config', () => {
      const data = [{ configType: 'startingPoints', json: [] }] as never;

      expect(() => importStartingPoints('workspace-1', data)).toThrow('No menu groups found');
    });

    it('should create folder and shapes for each menu group', async () => {
      const { shapeService, rowService, folderService } = await import('./database.js');

      const data = [{
        id: 'test-id',
        name: 'config',
        configType: 'startingPoints' as const,
        json: [
          {
            menuGroup: 'Works BF2',
            menuItems: [
              {
                label: 'Music Audio',
                type: ['http://id.loc.gov/ontologies/bibframe/MusicAudio'],
                useResourceTemplates: ['lc:RT:bf2:MusicAudio']
              }
            ]
          }
        ]
      }];

      const result = importStartingPoints('workspace-1', data);

      // Should create folder
      expect(folderService.create).toHaveBeenCalledWith('workspace-1', STARTING_POINT_FOLDER_NAME);

      // Should create shapes (one for each menu group + one index)
      expect(shapeService.create).toHaveBeenCalledTimes(2);

      // Should create rows
      expect(rowService.create).toHaveBeenCalled();

      expect(result.shapesCreated).toBe(2);
      expect(result.rowsCreated).toBeGreaterThan(0);
      expect(result.folderId).toBe(1);
    });

    it('should use existing Starting Points folder if it exists', async () => {
      const { folderService } = await import('./database.js');
      vi.mocked(folderService.list).mockReturnValue([
        { id: 42, name: STARTING_POINT_FOLDER_NAME, createdAt: 1000 }
      ]);

      const data = [{
        id: 'test-id',
        name: 'config',
        configType: 'startingPoints' as const,
        json: [
          {
            menuGroup: 'Test Group',
            menuItems: [
              { label: 'Test Item', type: ['http://example.org'], useResourceTemplates: ['test:rt'] }
            ]
          }
        ]
      }];

      const result = importStartingPoints('workspace-1', data);

      // Should NOT create new folder
      expect(folderService.create).not.toHaveBeenCalled();
      expect(result.folderId).toBe(42);
    });

    it('should delete existing shape before recreating', async () => {
      const { shapeService } = await import('./database.js');
      vi.mocked(shapeService.get).mockReturnValue({
        id: 1,
        shapeId: `${STARTING_POINT_PREFIX}Test_Group`,
        shapeLabel: 'Test Group',
        description: null,
        resourceURI: null,
        folderId: null,
        createdAt: 1000,
        updatedAt: 1000
      });

      const data = [{
        id: 'test-id',
        name: 'config',
        configType: 'startingPoints' as const,
        json: [
          {
            menuGroup: 'Test Group',
            menuItems: [
              { label: 'Test Item', type: ['http://example.org'], useResourceTemplates: ['test:rt'] }
            ]
          }
        ]
      }];

      importStartingPoints('workspace-1', data);

      expect(shapeService.delete).toHaveBeenCalled();
    });

    it('should create index shape linking to all menu groups', async () => {
      const { shapeService, rowService } = await import('./database.js');

      const data = [{
        id: 'test-id',
        name: 'config',
        configType: 'startingPoints' as const,
        json: [
          {
            menuGroup: 'Group A',
            menuItems: [{ label: 'Item A', type: [], useResourceTemplates: [] }]
          },
          {
            menuGroup: 'Group B',
            menuItems: [{ label: 'Item B', type: [], useResourceTemplates: [] }]
          }
        ]
      }];

      importStartingPoints('workspace-1', data);

      // Should create index shape
      expect(shapeService.create).toHaveBeenCalledWith(
        'workspace-1',
        STARTING_POINT_INDEX_ID,
        'Starting Point Index',
        undefined,
        expect.any(Number)
      );

      // Should create rows in index linking to each group
      const indexRowCalls = vi.mocked(rowService.create).mock.calls.filter(
        call => call[1] === STARTING_POINT_INDEX_ID
      );
      expect(indexRowCalls.length).toBe(2);
    });

    it('should sanitize menu group name for shapeId', async () => {
      const { shapeService } = await import('./database.js');

      const data = [{
        id: 'test-id',
        name: 'config',
        configType: 'startingPoints' as const,
        json: [
          {
            menuGroup: 'Works BF2 Special',
            menuItems: [{ label: 'Item', type: [], useResourceTemplates: [] }]
          }
        ]
      }];

      importStartingPoints('workspace-1', data);

      // Spaces should be replaced with underscores
      expect(shapeService.create).toHaveBeenCalledWith(
        'workspace-1',
        `${STARTING_POINT_PREFIX}Works_BF2_Special`,
        'Works BF2 Special',
        undefined,
        expect.any(Number)
      );
    });
  });

  describe('exportStartingPoints', () => {
    it('should return null when no starting point shapes exist', async () => {
      const { shapeService } = await import('./database.js');
      vi.mocked(shapeService.list).mockReturnValue([
        { id: 1, shapeId: 'Person', shapeLabel: 'Person', description: null, resourceURI: null, folderId: null, createdAt: 1000, updatedAt: 1000 }
      ]);

      const result = exportStartingPoints('workspace-1');
      expect(result).toBeNull();
    });

    it('should return null when only index shape exists without menu groups', async () => {
      const { shapeService } = await import('./database.js');
      vi.mocked(shapeService.list).mockReturnValue([
        { id: 1, shapeId: STARTING_POINT_INDEX_ID, shapeLabel: 'Index', description: null, resourceURI: null, folderId: null, createdAt: 1000, updatedAt: 1000 }
      ]);

      const result = exportStartingPoints('workspace-1');
      expect(result).toBeNull();
    });

    it('should export starting points to file format', async () => {
      const { shapeService, rowService } = await import('./database.js');
      vi.mocked(shapeService.list).mockReturnValue([
        {
          id: 1,
          shapeId: `${STARTING_POINT_PREFIX}Works_BF2`,
          shapeLabel: 'Works BF2',
          description: null,
          resourceURI: null,
          folderId: 1,
          createdAt: 1000,
          updatedAt: 1000
        }
      ]);
      vi.mocked(rowService.list).mockReturnValue([
        {
          id: 1,
          rowOrder: 0,
          propertyId: 'dcterms:hasPart',
          propertyLabel: 'Music Audio',
          mandatory: null,
          repeatable: null,
          valueNodeType: 'IRI',
          valueDataType: null,
          valueShape: 'lc:RT:bf2:MusicAudio',
          valueConstraint: 'http://id.loc.gov/ontologies/bibframe/MusicAudio',
          valueConstraintType: 'picklist',
          lcDefaultLiteral: null,
          lcDefaultURI: null,
          note: null,
          lcDataTypeURI: null,
          lcRemark: null,
          hasErrors: 0,
          errorDetails: null,
          createdAt: 1000,
          updatedAt: 1000
        }
      ]);

      const result = exportStartingPoints('workspace-1');

      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      expect(result![0].configType).toBe('startingPoints');
      expect(result![0].json).toHaveLength(1);
      expect(result![0].json[0].menuGroup).toBe('Works BF2');
      expect(result![0].json[0].menuItems).toHaveLength(1);
      expect(result![0].json[0].menuItems[0].label).toBe('Music Audio');
    });

    it('should exclude the index shape from export', async () => {
      const { shapeService, rowService } = await import('./database.js');
      vi.mocked(shapeService.list).mockReturnValue([
        {
          id: 1,
          shapeId: `${STARTING_POINT_PREFIX}TestGroup`,
          shapeLabel: 'Test Group',
          description: null,
          resourceURI: null,
          folderId: 1,
          createdAt: 1000,
          updatedAt: 1000
        },
        {
          id: 2,
          shapeId: STARTING_POINT_INDEX_ID,
          shapeLabel: 'Index',
          description: null,
          resourceURI: null,
          folderId: 1,
          createdAt: 1000,
          updatedAt: 1000
        }
      ]);
      vi.mocked(rowService.list).mockReturnValue([
        {
          id: 1,
          rowOrder: 0,
          propertyId: 'dcterms:hasPart',
          propertyLabel: 'Item',
          mandatory: null,
          repeatable: null,
          valueNodeType: null,
          valueDataType: null,
          valueShape: 'test:shape',
          valueConstraint: 'http://example.org',
          valueConstraintType: null,
          lcDefaultLiteral: null,
          lcDefaultURI: null,
          note: null,
          lcDataTypeURI: null,
          lcRemark: null,
          hasErrors: 0,
          errorDetails: null,
          createdAt: 1000,
          updatedAt: 1000
        }
      ]);

      const result = exportStartingPoints('workspace-1');

      expect(result).not.toBeNull();
      expect(result![0].json).toHaveLength(1);
      expect(result![0].json[0].menuGroup).toBe('Test Group');
    });

    it('should skip shapes with no dcterms:hasPart rows', async () => {
      const { shapeService, rowService } = await import('./database.js');
      vi.mocked(shapeService.list).mockReturnValue([
        {
          id: 1,
          shapeId: `${STARTING_POINT_PREFIX}TestGroup`,
          shapeLabel: 'Test Group',
          description: null,
          resourceURI: null,
          folderId: 1,
          createdAt: 1000,
          updatedAt: 1000
        }
      ]);
      vi.mocked(rowService.list).mockReturnValue([
        {
          id: 1,
          rowOrder: 0,
          propertyId: 'dcterms:title',
          propertyLabel: 'Title',
          mandatory: null,
          repeatable: null,
          valueNodeType: null,
          valueDataType: null,
          valueShape: null,
          valueConstraint: null,
          valueConstraintType: null,
          lcDefaultLiteral: null,
          lcDefaultURI: null,
          note: null,
          lcDataTypeURI: null,
          lcRemark: null,
          hasErrors: 0,
          errorDetails: null,
          createdAt: 1000,
          updatedAt: 1000
        }
      ]);

      const result = exportStartingPoints('workspace-1');

      expect(result).toBeNull();
    });
  });

  describe('hasStartingPoints', () => {
    it('should return false when no shapes exist', async () => {
      const { shapeService } = await import('./database.js');
      vi.mocked(shapeService.list).mockReturnValue([]);

      const result = hasStartingPoints('workspace-1');
      expect(result).toBe(false);
    });

    it('should return false when no starting point shapes exist', async () => {
      const { shapeService } = await import('./database.js');
      vi.mocked(shapeService.list).mockReturnValue([
        { id: 1, shapeId: 'Person', shapeLabel: 'Person', description: null, resourceURI: null, folderId: null, createdAt: 1000, updatedAt: 1000 },
        { id: 2, shapeId: 'Organization', shapeLabel: 'Org', description: null, resourceURI: null, folderId: null, createdAt: 1000, updatedAt: 1000 }
      ]);

      const result = hasStartingPoints('workspace-1');
      expect(result).toBe(false);
    });

    it('should return true when starting point shapes exist', async () => {
      const { shapeService } = await import('./database.js');
      vi.mocked(shapeService.list).mockReturnValue([
        { id: 1, shapeId: 'Person', shapeLabel: 'Person', description: null, resourceURI: null, folderId: null, createdAt: 1000, updatedAt: 1000 },
        { id: 2, shapeId: `${STARTING_POINT_PREFIX}Test`, shapeLabel: 'Test', description: null, resourceURI: null, folderId: null, createdAt: 1000, updatedAt: 1000 }
      ]);

      const result = hasStartingPoints('workspace-1');
      expect(result).toBe(true);
    });
  });
});
