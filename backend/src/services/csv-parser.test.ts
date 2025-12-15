import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseCSV, exportWorkspace, importToWorkspace } from './csv-parser.js';

// Mock the database services
vi.mock('./database.js', () => ({
  workspaceService: {
    create: vi.fn((name: string) => ({
      id: 'mock-workspace-id',
      name,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }))
  },
  shapeService: {
    create: vi.fn(),
    list: vi.fn(() => [])
  },
  rowService: {
    create: vi.fn(),
    list: vi.fn(() => [])
  },
  namespaceService: {
    create: vi.fn()
  }
}));

describe('CSV Parser', () => {
  describe('parseCSV', () => {
    it('should parse basic CSV with header row', () => {
      const csv = `shapeID,propertyID,propertyLabel
Person,dcterms:title,Title
Person,dcterms:description,Description`;

      const result = parseCSV(csv);
      expect(result.success).toBe(true);
      expect(result.rows).toHaveLength(2);
      expect(result.detectedFormat).toBe('csv');
    });

    it('should parse TSV format correctly', () => {
      const tsv = `shapeID\tpropertyID\tpropertyLabel
Person\tdcterms:title\tTitle`;

      const result = parseCSV(tsv);
      expect(result.success).toBe(true);
      expect(result.rows).toHaveLength(1);
      expect(result.detectedFormat).toBe('tsv');
    });

    it('should detect delimiter automatically (more tabs than commas = TSV)', () => {
      const tsv = `shapeID\tpropertyID\tpropertyLabel\tnote
Person\tdcterms:title\tTitle\tA note`;

      const result = parseCSV(tsv);
      expect(result.detectedFormat).toBe('tsv');
    });

    it('should detect delimiter automatically (more commas than tabs = CSV)', () => {
      const csv = `shapeID,propertyID,propertyLabel,note
Person,dcterms:title,Title,A note`;

      const result = parseCSV(csv);
      expect(result.detectedFormat).toBe('csv');
    });

    it('should handle quoted values with commas', () => {
      const csv = `shapeID,propertyID,valueConstraint
Person,dcterms:type,"Option A, Option B, Option C"`;

      const result = parseCSV(csv);
      expect(result.success).toBe(true);
      expect(result.rows?.[0].data.valueConstraint).toBe('Option A, Option B, Option C');
    });

    it('should handle quoted values with escaped quotes', () => {
      const csv = `shapeID,propertyID,note
Person,dcterms:title,"This is a ""quoted"" value"`;

      const result = parseCSV(csv);
      expect(result.success).toBe(true);
      expect(result.rows?.[0].data.note).toBe('This is a "quoted" value');
    });

    it('should return error for empty file', () => {
      const result = parseCSV('');
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors?.[0].message).toBe('Empty file');
    });

    it('should return error for file without required columns', () => {
      const csv = `name,description
Test,A test`;

      const result = parseCSV(csv);
      expect(result.success).toBe(false);
      expect(result.errors?.[0].message).toContain('propertyID or shapeID');
    });

    it('should handle shapeID inheritance across rows', () => {
      const csv = `shapeID,propertyID,propertyLabel
Person,dcterms:title,Title
,dcterms:description,Description
,dcterms:creator,Creator`;

      const result = parseCSV(csv);
      expect(result.success).toBe(true);
      expect(result.rows).toHaveLength(3);
      expect(result.rows?.[0].shapeID).toBe('Person');
      expect(result.rows?.[1].shapeID).toBe('Person');
      expect(result.rows?.[2].shapeID).toBe('Person');
    });

    it('should handle multiple shapes', () => {
      const csv = `shapeID,propertyID,propertyLabel
Person,dcterms:title,Title
Person,dcterms:description,Description
Organization,dcterms:name,Name
Organization,dcterms:address,Address`;

      const result = parseCSV(csv);
      expect(result.success).toBe(true);
      expect(result.rows).toHaveLength(4);
      expect(result.rows?.[0].shapeID).toBe('Person');
      expect(result.rows?.[1].shapeID).toBe('Person');
      expect(result.rows?.[2].shapeID).toBe('Organization');
      expect(result.rows?.[3].shapeID).toBe('Organization');
    });

    it('should skip empty rows', () => {
      const csv = `shapeID,propertyID,propertyLabel
Person,dcterms:title,Title

Person,dcterms:description,Description`;

      const result = parseCSV(csv);
      expect(result.success).toBe(true);
      expect(result.rows).toHaveLength(2);
    });

    it('should handle case-insensitive column names', () => {
      const csv = `SHAPEID,PropertyID,PropertyLabel,ValueNodeType
Person,dcterms:title,Title,literal`;

      const result = parseCSV(csv);
      expect(result.success).toBe(true);
      expect(result.rows?.[0].shapeID).toBe('Person');
      expect(result.rows?.[0].data.propertyId).toBe('dcterms:title');
      expect(result.rows?.[0].data.valueNodeType).toBe('literal');
    });

    it('should parse all supported columns', () => {
      const csv = `shapeID,shapeLabel,propertyID,propertyLabel,mandatory,repeatable,valueNodeType,valueDataType,valueShape,valueConstraint,valueConstraintType,note
Person,Person Shape,dcterms:title,Title,true,false,literal,xsd:string,,Option1|Option2,picklist,A note`;

      const result = parseCSV(csv);
      expect(result.success).toBe(true);

      const row = result.rows?.[0];
      expect(row?.shapeID).toBe('Person');
      expect(row?.shapeLabel).toBe('Person Shape');
      expect(row?.data.propertyId).toBe('dcterms:title');
      expect(row?.data.propertyLabel).toBe('Title');
      expect(row?.data.mandatory).toBe('true');
      expect(row?.data.repeatable).toBe('false');
      expect(row?.data.valueNodeType).toBe('literal');
      expect(row?.data.valueDataType).toBe('xsd:string');
      expect(row?.data.valueConstraint).toBe('Option1|Option2');
      expect(row?.data.valueConstraintType).toBe('picklist');
      expect(row?.data.note).toBe('A note');
    });

    it('should generate warning for rows without shapeID', () => {
      const csv = `propertyID,propertyLabel
dcterms:title,Title`;

      const result = parseCSV(csv);
      expect(result.success).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings?.[0].message).toContain('no associated shapeID');
      expect(result.rows?.[0].shapeID).toBe('default');
    });

    it('should handle Windows line endings (CRLF)', () => {
      const csv = 'shapeID,propertyID,propertyLabel\r\nPerson,dcterms:title,Title\r\nPerson,dcterms:description,Description';

      const result = parseCSV(csv);
      expect(result.success).toBe(true);
      expect(result.rows).toHaveLength(2);
    });
  });

  describe('importToWorkspace', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should return error for invalid CSV', () => {
      const result = importToWorkspace('', 'Test Workspace');
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should create workspace and import data', () => {
      const csv = `shapeID,propertyID,propertyLabel
Person,dcterms:title,Title
Person,dcterms:description,Description`;

      const result = importToWorkspace(csv, 'Test Workspace');
      expect(result.success).toBe(true);
      expect(result.workspaceId).toBe('mock-workspace-id');
      expect(result.shapesCreated).toBe(1);
      expect(result.rowsImported).toBe(2);
    });

    it('should detect unknown namespace prefixes', () => {
      const csv = `shapeID,propertyID,propertyLabel
Person,custom:property,Custom Property`;

      const result = importToWorkspace(csv, 'Test Workspace');
      expect(result.success).toBe(true);
      expect(result.unknownNamespaces).toContain('custom');
      expect(result.warnings?.some(w => w.message.includes('custom'))).toBe(true);
    });

    it('should group rows by shape', () => {
      const csv = `shapeID,propertyID,propertyLabel
Person,dcterms:title,Title
Organization,dcterms:name,Name
Person,dcterms:description,Description`;

      const result = importToWorkspace(csv, 'Test Workspace');
      expect(result.success).toBe(true);
      expect(result.shapesCreated).toBe(2); // Person and Organization
      expect(result.rowsImported).toBe(3);
    });
  });

  describe('exportWorkspace', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should export empty workspace with just headers', async () => {
      const { shapeService } = await import('./database.js');
      vi.mocked(shapeService.list).mockReturnValue([]);

      const result = exportWorkspace('workspace-1', 'csv');

      expect(result).toContain('shapeID');
      expect(result).toContain('propertyID');
      const lines = result.split('\n');
      expect(lines).toHaveLength(1); // Just the header
    });

    it('should export CSV format with comma delimiter', async () => {
      const { shapeService, rowService } = await import('./database.js');
      vi.mocked(shapeService.list).mockReturnValue([
        {
          id: 1,
          shapeId: 'Person',
          shapeLabel: 'Person Shape',
          description: null,
          resourceURI: null,
          folderId: null,
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
          mandatory: 'true',
          repeatable: null,
          valueNodeType: 'literal',
          valueDataType: 'xsd:string',
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

      const result = exportWorkspace('workspace-1', 'csv');

      expect(result).toContain(',');
      expect(result).toContain('Person');
      expect(result).toContain('dcterms:title');
    });

    it('should export TSV format with tab delimiter', async () => {
      const { shapeService, rowService } = await import('./database.js');
      vi.mocked(shapeService.list).mockReturnValue([
        {
          id: 1,
          shapeId: 'Person',
          shapeLabel: 'Person Shape',
          description: null,
          resourceURI: null,
          folderId: null,
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

      const result = exportWorkspace('workspace-1', 'tsv');

      expect(result).toContain('\t');
      expect(result).toContain('Person');
    });

    it('should only show shapeID and shapeLabel on first row of each shape', async () => {
      const { shapeService, rowService } = await import('./database.js');
      vi.mocked(shapeService.list).mockReturnValue([
        {
          id: 1,
          shapeId: 'Person',
          shapeLabel: 'Person Shape',
          description: null,
          resourceURI: null,
          folderId: null,
          createdAt: 1000,
          updatedAt: 1000
        }
      ]);
      vi.mocked(rowService.list).mockReturnValue([
        {
          id: 1, rowOrder: 0, propertyId: 'dcterms:title', propertyLabel: 'Title',
          mandatory: null, repeatable: null, valueNodeType: null, valueDataType: null,
          valueShape: null, valueConstraint: null, valueConstraintType: null,
          lcDefaultLiteral: null, lcDefaultURI: null, note: null, lcDataTypeURI: null, lcRemark: null,
          hasErrors: 0, errorDetails: null, createdAt: 1000, updatedAt: 1000
        },
        {
          id: 2, rowOrder: 1, propertyId: 'dcterms:description', propertyLabel: 'Description',
          mandatory: null, repeatable: null, valueNodeType: null, valueDataType: null,
          valueShape: null, valueConstraint: null, valueConstraintType: null,
          lcDefaultLiteral: null, lcDefaultURI: null, note: null, lcDataTypeURI: null, lcRemark: null,
          hasErrors: 0, errorDetails: null, createdAt: 1000, updatedAt: 1000
        }
      ]);

      const result = exportWorkspace('workspace-1', 'csv');
      const lines = result.split('\n');

      // First data row should have shapeID
      expect(lines[1]).toContain('Person');
      // Second data row should NOT have shapeID (empty first column)
      expect(lines[2].startsWith(',')).toBe(true);
    });

    it('should escape values with delimiters', async () => {
      const { shapeService, rowService } = await import('./database.js');
      vi.mocked(shapeService.list).mockReturnValue([
        {
          id: 1,
          shapeId: 'Person',
          shapeLabel: 'Person, Human',
          description: null,
          resourceURI: null,
          folderId: null,
          createdAt: 1000,
          updatedAt: 1000
        }
      ]);
      vi.mocked(rowService.list).mockReturnValue([
        {
          id: 1, rowOrder: 0, propertyId: 'dcterms:title', propertyLabel: 'Title',
          mandatory: null, repeatable: null, valueNodeType: null, valueDataType: null,
          valueShape: null, valueConstraint: null, valueConstraintType: null,
          lcDefaultLiteral: null, lcDefaultURI: null, note: null, lcDataTypeURI: null, lcRemark: null,
          hasErrors: 0, errorDetails: null, createdAt: 1000, updatedAt: 1000
        }
      ]);

      const result = exportWorkspace('workspace-1', 'csv');

      // Should be quoted because it contains comma
      expect(result).toContain('"Person, Human"');
    });

    it('should convert newlines to pipes in multi-value fields', async () => {
      const { shapeService, rowService } = await import('./database.js');
      vi.mocked(shapeService.list).mockReturnValue([
        {
          id: 1,
          shapeId: 'Person',
          shapeLabel: 'Person',
          description: null,
          resourceURI: null,
          folderId: null,
          createdAt: 1000,
          updatedAt: 1000
        }
      ]);
      vi.mocked(rowService.list).mockReturnValue([
        {
          id: 1, rowOrder: 0, propertyId: 'dcterms:title', propertyLabel: 'Title',
          mandatory: null, repeatable: null, valueNodeType: null, valueDataType: null,
          valueShape: 'Shape1\nShape2\nShape3', valueConstraint: 'Option1\nOption2',
          valueConstraintType: null, lcDefaultLiteral: null, lcDefaultURI: null, note: null,
          lcDataTypeURI: null, lcRemark: null,
          hasErrors: 0, errorDetails: null, createdAt: 1000, updatedAt: 1000
        }
      ]);

      const result = exportWorkspace('workspace-1', 'csv');

      // Newlines should be converted to pipes
      expect(result).toContain('Shape1 | Shape2 | Shape3');
      expect(result).toContain('Option1 | Option2');
    });

    it('should output shape header even when shape has no rows', async () => {
      const { shapeService, rowService } = await import('./database.js');
      vi.mocked(shapeService.list).mockReturnValue([
        {
          id: 1,
          shapeId: 'EmptyShape',
          shapeLabel: 'Empty Shape',
          description: null,
          resourceURI: null,
          folderId: null,
          createdAt: 1000,
          updatedAt: 1000
        }
      ]);
      vi.mocked(rowService.list).mockReturnValue([]);

      const result = exportWorkspace('workspace-1', 'csv');
      const lines = result.split('\n');

      expect(lines).toHaveLength(2); // Header + shape row
      expect(lines[1]).toContain('EmptyShape');
    });
  });
});
