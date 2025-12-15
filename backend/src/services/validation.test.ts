import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateRow, validateShape } from './validation.js';

// Mock the database services
vi.mock('./database.js', () => ({
  shapeService: {
    list: vi.fn(() => [
      { shapeId: 'Person' },
      { shapeId: 'Organization' },
      { shapeId: 'Address' }
    ])
  },
  namespaceService: {
    list: vi.fn(() => [
      { id: 1, prefix: 'dcterms', namespace: 'http://purl.org/dc/terms/', createdAt: 1000 },
      { id: 2, prefix: 'rdf', namespace: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#', createdAt: 1000 },
      { id: 3, prefix: 'xsd', namespace: 'http://www.w3.org/2001/XMLSchema#', createdAt: 1000 }
    ])
  }
}));

describe('Validation Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validateRow', () => {
    describe('propertyId validation', () => {
      it('should generate warning when propertyId is missing but row has data', () => {
        const row = {
          propertyLabel: 'Title',
          valueNodeType: 'literal'
        };

        const result = validateRow('workspace-1', row);

        expect(result.warnings.some(w => w.message.includes('Property ID is required'))).toBe(true);
      });

      it('should not generate warning when row is completely empty', () => {
        const row = {};

        const result = validateRow('workspace-1', row);

        expect(result.warnings.filter(w => w.message.includes('Property ID'))).toHaveLength(0);
      });

      it('should not generate warning when propertyId is present', () => {
        const row = {
          propertyId: 'dcterms:title',
          propertyLabel: 'Title'
        };

        const result = validateRow('workspace-1', row);

        expect(result.warnings.filter(w => w.message.includes('Property ID'))).toHaveLength(0);
      });
    });

    describe('namespace prefix validation', () => {
      it('should warn about unknown namespace prefix', () => {
        const row = {
          propertyId: 'unknown:property',
          propertyLabel: 'Property'
        };

        const result = validateRow('workspace-1', row);

        expect(result.warnings.some(w => w.message.includes('Unknown namespace prefix "unknown"'))).toBe(true);
      });

      it('should not warn about known namespace prefix', () => {
        const row = {
          propertyId: 'dcterms:title',
          propertyLabel: 'Title'
        };

        const result = validateRow('workspace-1', row);

        expect(result.warnings.filter(w => w.message.includes('Unknown prefix'))).toHaveLength(0);
      });

      it('should not warn if propertyId has no prefix', () => {
        const row = {
          propertyId: 'nocolon',
          propertyLabel: 'No Prefix'
        };

        const result = validateRow('workspace-1', row);

        expect(result.warnings.filter(w => w.message.includes('Unknown prefix'))).toHaveLength(0);
      });
    });

    describe('valueNodeType validation', () => {
      it('should accept valid valueNodeType values', () => {
        for (const nodeType of ['IRI', 'literal', 'bnode']) {
          const row = {
            propertyId: 'dcterms:title',
            valueNodeType: nodeType
          };

          const result = validateRow('workspace-1', row);

          expect(result.errors.filter(e => e.column === 'valueNodeType')).toHaveLength(0);
        }
      });

      it('should accept case variations of valueNodeType', () => {
        for (const nodeType of ['iri', 'LITERAL', 'BNode', 'BNODE']) {
          const row = {
            propertyId: 'dcterms:title',
            valueNodeType: nodeType
          };

          const result = validateRow('workspace-1', row);

          expect(result.errors.filter(e => e.column === 'valueNodeType')).toHaveLength(0);
        }
      });

      it('should error on invalid valueNodeType', () => {
        const row = {
          propertyId: 'dcterms:title',
          valueNodeType: 'invalid'
        };

        const result = validateRow('workspace-1', row);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e =>
          e.column === 'valueNodeType' &&
          e.message.includes('Invalid valueNodeType')
        )).toBe(true);
      });
    });

    describe('valueDataType validation', () => {
      it('should error when valueDataType is used with non-literal valueNodeType', () => {
        const row = {
          propertyId: 'dcterms:title',
          valueNodeType: 'IRI',
          valueDataType: 'xsd:string'
        };

        const result = validateRow('workspace-1', row);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e =>
          e.column === 'valueDataType' &&
          e.message.includes('can only be used when valueNodeType is "literal"')
        )).toBe(true);
      });

      it('should not error when valueDataType is used with literal valueNodeType', () => {
        const row = {
          propertyId: 'dcterms:title',
          valueNodeType: 'literal',
          valueDataType: 'xsd:string'
        };

        const result = validateRow('workspace-1', row);

        expect(result.errors.filter(e => e.column === 'valueDataType')).toHaveLength(0);
      });

      it('should warn about unknown datatype', () => {
        const row = {
          propertyId: 'dcterms:title',
          valueNodeType: 'literal',
          valueDataType: 'custom:datatype'
        };

        const result = validateRow('workspace-1', row);

        expect(result.warnings.some(w =>
          w.column === 'valueDataType' &&
          w.message.includes('Unknown datatype')
        )).toBe(true);
      });

      it('should accept valid XSD datatypes', () => {
        const validTypes = ['xsd:string', 'xsd:boolean', 'xsd:integer', 'xsd:date', 'xsd:dateTime'];

        for (const dataType of validTypes) {
          const row = {
            propertyId: 'dcterms:title',
            valueNodeType: 'literal',
            valueDataType: dataType
          };

          const result = validateRow('workspace-1', row);

          expect(result.warnings.filter(w => w.column === 'valueDataType')).toHaveLength(0);
        }
      });
    });

    describe('valueShape validation', () => {
      it('should error when valueShape is used with literal valueNodeType', () => {
        const row = {
          propertyId: 'dcterms:creator',
          valueNodeType: 'literal',
          valueShape: 'Person'
        };

        const result = validateRow('workspace-1', row);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e =>
          e.column === 'valueShape' &&
          e.message.includes('cannot be used when valueNodeType is "literal"')
        )).toBe(true);
      });

      it('should not error when valueShape is used with IRI valueNodeType', () => {
        const row = {
          propertyId: 'dcterms:creator',
          valueNodeType: 'IRI',
          valueShape: 'Person'
        };

        const result = validateRow('workspace-1', row);

        expect(result.errors.filter(e =>
          e.column === 'valueShape' &&
          e.message.includes('cannot be used')
        )).toHaveLength(0);
      });

      it('should error when valueShape references non-existent shape', () => {
        const row = {
          propertyId: 'dcterms:creator',
          valueNodeType: 'IRI',
          valueShape: 'NonExistentShape'
        };

        const result = validateRow('workspace-1', row);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e =>
          e.column === 'valueShape' &&
          e.message.includes('non-existent shape')
        )).toBe(true);
      });

      it('should accept existing shapes in valueShape', () => {
        const row = {
          propertyId: 'dcterms:creator',
          valueNodeType: 'IRI',
          valueShape: 'Person'
        };

        const result = validateRow('workspace-1', row);

        expect(result.errors.filter(e =>
          e.column === 'valueShape' &&
          e.message.includes('non-existent')
        )).toHaveLength(0);
      });

      it('should validate multiple valueShape references', () => {
        const row = {
          propertyId: 'dcterms:creator',
          valueNodeType: 'IRI',
          valueShape: 'Person\nOrganization\nNonExistent'
        };

        const result = validateRow('workspace-1', row);

        expect(result.errors.some(e =>
          e.column === 'valueShape' &&
          e.message.includes('NonExistent')
        )).toBe(true);
      });

      it('should accept multiple valid valueShape references separated by newline', () => {
        const row = {
          propertyId: 'dcterms:creator',
          valueNodeType: 'IRI',
          valueShape: 'Person\nOrganization'
        };

        const result = validateRow('workspace-1', row);

        expect(result.errors.filter(e => e.column === 'valueShape')).toHaveLength(0);
      });

      it('should accept multiple valid valueShape references separated by pipe', () => {
        const row = {
          propertyId: 'dcterms:creator',
          valueNodeType: 'IRI',
          valueShape: 'Person|Organization|Address'
        };

        const result = validateRow('workspace-1', row);

        expect(result.errors.filter(e => e.column === 'valueShape')).toHaveLength(0);
      });
    });

    describe('valueConstraintType validation', () => {
      it('should accept valid valueConstraintType values', () => {
        const validTypes = ['picklist', 'IRIstem', 'pattern', 'languageTag', 'minLength', 'maxLength'];

        for (const constraintType of validTypes) {
          const row = {
            propertyId: 'dcterms:title',
            valueConstraintType: constraintType
          };

          const result = validateRow('workspace-1', row);

          expect(result.errors.filter(e => e.column === 'valueConstraintType')).toHaveLength(0);
        }
      });

      it('should error on invalid valueConstraintType', () => {
        const row = {
          propertyId: 'dcterms:title',
          valueConstraintType: 'invalidType'
        };

        const result = validateRow('workspace-1', row);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e =>
          e.column === 'valueConstraintType' &&
          e.message.includes('Invalid valueConstraintType')
        )).toBe(true);
      });
    });

    describe('validation result', () => {
      it('should return valid=true when no errors', () => {
        const row = {
          propertyId: 'dcterms:title',
          propertyLabel: 'Title',
          valueNodeType: 'literal',
          valueDataType: 'xsd:string'
        };

        const result = validateRow('workspace-1', row);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should return valid=false when there are errors', () => {
        const row = {
          propertyId: 'dcterms:title',
          valueNodeType: 'invalid'
        };

        const result = validateRow('workspace-1', row);

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });

      it('should return valid=true even with warnings', () => {
        const row = {
          propertyId: 'unknown:property',
          propertyLabel: 'Property'
        };

        const result = validateRow('workspace-1', row);

        expect(result.valid).toBe(true);
        expect(result.warnings.length).toBeGreaterThan(0);
      });
    });

    describe('custom shapes and namespaces', () => {
      it('should use provided shapes list for validation', () => {
        const row = {
          propertyId: 'dcterms:creator',
          valueNodeType: 'IRI',
          valueShape: 'CustomShape'
        };

        const result = validateRow('workspace-1', row, ['CustomShape']);

        expect(result.errors.filter(e => e.column === 'valueShape')).toHaveLength(0);
      });

      it('should use provided namespaces for validation', () => {
        const row = {
          propertyId: 'custom:property',
          propertyLabel: 'Property'
        };

        const customNamespaces = [
          { id: 1, prefix: 'custom', namespace: 'http://example.org/', createdAt: 1000 }
        ];

        const result = validateRow('workspace-1', row, undefined, customNamespaces);

        expect(result.warnings.filter(w => w.message.includes('Unknown prefix'))).toHaveLength(0);
      });
    });
  });

  describe('validateShape', () => {
    it('should validate all rows in a shape', () => {
      const rows = [
        { id: 1, rowOrder: 0, propertyId: 'dcterms:title', valueNodeType: 'literal' } as never,
        { id: 2, rowOrder: 1, propertyId: 'dcterms:creator', valueNodeType: 'invalid' } as never,
        { id: 3, rowOrder: 2, propertyId: 'unknown:prop', valueNodeType: 'IRI' } as never
      ];

      const result = validateShape('workspace-1', 'TestShape', rows);

      // Should have error from row 2 (invalid valueNodeType)
      expect(result.errors.some(e => e.row === 1 && e.column === 'valueNodeType')).toBe(true);
      // Should have warning from row 3 (unknown prefix)
      expect(result.warnings.some(w => w.row === 2 && w.message.includes('Unknown namespace prefix'))).toBe(true);
    });

    it('should return valid=true when all rows are valid', () => {
      const rows = [
        { id: 1, rowOrder: 0, propertyId: 'dcterms:title', valueNodeType: 'literal' } as never,
        { id: 2, rowOrder: 1, propertyId: 'dcterms:description', valueNodeType: 'literal' } as never
      ];

      const result = validateShape('workspace-1', 'TestShape', rows);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return valid=false when any row has errors', () => {
      const rows = [
        { id: 1, rowOrder: 0, propertyId: 'dcterms:title', valueNodeType: 'literal' } as never,
        { id: 2, rowOrder: 1, propertyId: 'dcterms:type', valueNodeType: 'invalid' } as never
      ];

      const result = validateShape('workspace-1', 'TestShape', rows);

      expect(result.valid).toBe(false);
    });

    it('should include row index in error/warning objects', () => {
      const rows = [
        { id: 1, rowOrder: 0, propertyId: 'unknown:first' } as never,
        { id: 2, rowOrder: 1, propertyId: 'unknown:second' } as never
      ];

      const result = validateShape('workspace-1', 'TestShape', rows);

      const row0Warnings = result.warnings.filter(w => w.row === 0);
      const row1Warnings = result.warnings.filter(w => w.row === 1);

      expect(row0Warnings.length).toBeGreaterThan(0);
      expect(row1Warnings.length).toBeGreaterThan(0);
    });
  });
});
