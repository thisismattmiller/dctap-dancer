// DCTap Core Types

export interface Workspace {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface Folder {
  id: number;
  name: string;
  createdAt: number;
}

export interface Shape {
  id: number;
  shapeId: string;
  shapeLabel: string | null;
  description: string | null;
  resourceURI: string | null;
  folderId: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface StatementRow {
  id: number;
  rowOrder: number;
  propertyId: string | null;
  propertyLabel: string | null;
  mandatory: string | null;
  repeatable: string | null;
  valueNodeType: string | null;
  valueDataType: string | null;
  valueShape: string | null;
  valueConstraint: string | null;
  valueConstraintType: string | null;
  lcDefaultLiteral: string | null;
  lcDefaultURI: string | null;
  note: string | null;
  lcDataTypeURI: string | null;
  lcRemark: string | null;
  hasErrors: number;
  errorDetails: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Namespace {
  id: number;
  prefix: string;
  namespace: string;
  createdAt: number;
}

// Workspace options
export interface WorkspaceOptions {
  useLCColumns: boolean;
}

export const DEFAULT_OPTIONS: WorkspaceOptions = {
  useLCColumns: false
};

// Valid values for constrained fields
export const VALUE_NODE_TYPES = ['IRI', 'literal', 'bnode'] as const;
export type ValueNodeType = typeof VALUE_NODE_TYPES[number];

export const VALUE_CONSTRAINT_TYPES = [
  'picklist',
  'IRIstem',
  'pattern',
  'languageTag',
  'minLength',
  'maxLength',
  'minInclusive',
  'maxInclusive'
] as const;
export type ValueConstraintType = typeof VALUE_CONSTRAINT_TYPES[number];

export const XSD_DATATYPES = [
  'xsd:string',
  'xsd:boolean',
  'xsd:decimal',
  'xsd:integer',
  'xsd:float',
  'xsd:double',
  'xsd:date',
  'xsd:dateTime',
  'xsd:time',
  'xsd:duration',
  'xsd:gYear',
  'xsd:gYearMonth',
  'xsd:anyURI',
  'rdf:langString'
] as const;
export type XsdDatatype = typeof XSD_DATATYPES[number];

// Default namespaces for new workspaces
export const DEFAULT_NAMESPACES: Array<{ prefix: string; namespace: string }> = [
  { prefix: 'rdf', namespace: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#' },
  { prefix: 'rdfs', namespace: 'http://www.w3.org/2000/01/rdf-schema#' },
  { prefix: 'xsd', namespace: 'http://www.w3.org/2001/XMLSchema#' },
  { prefix: 'owl', namespace: 'http://www.w3.org/2002/07/owl#' },
  { prefix: 'skos', namespace: 'http://www.w3.org/2004/02/skos/core#' },
  { prefix: 'dcterms', namespace: 'http://purl.org/dc/terms/' },
  { prefix: 'foaf', namespace: 'http://xmlns.com/foaf/0.1/' },
  { prefix: 'bf', namespace: 'http://id.loc.gov/ontologies/bibframe/' },
  { prefix: 'bflc', namespace: 'http://id.loc.gov/ontologies/bflc/' },
  { prefix: 'bfsimple', namespace: 'http://id.loc.gov/ontologies/bfsimple/' },
  { prefix: 'cc', namespace: 'http://creativecommons.org/ns#' },
  { prefix: 'sp', namespace: 'http://id.loc.gov/ontologies/sp/' },
  { prefix: 'pom', namespace: 'http://performedmusicontology.org/ontology/' },
  { prefix: 'mads', namespace: 'http://www.loc.gov/mads/rdf/v1#' }

  
];

// API Request/Response types
export interface CreateWorkspaceRequest {
  name: string;
}

export interface UpdateWorkspaceRequest {
  name: string;
}

export interface CreateShapeRequest {
  shapeId: string;
  shapeLabel?: string;
  description?: string;
  resourceURI?: string;
}

export interface UpdateShapeRequest {
  shapeId?: string;
  shapeLabel?: string;
  description?: string;
  resourceURI?: string;
  folderId?: number | null;
}

export interface CreateFolderRequest {
  name: string;
}

export interface UpdateFolderRequest {
  name: string;
}

export interface CreateRowRequest {
  propertyId?: string;
  propertyLabel?: string;
  mandatory?: string;
  repeatable?: string;
  valueNodeType?: string;
  valueDataType?: string;
  valueShape?: string;
  valueConstraint?: string;
  valueConstraintType?: string;
  lcDefaultLiteral?: string;
  lcDefaultURI?: string;
  note?: string;
  lcDataTypeURI?: string;
  lcRemark?: string;
  rowOrder?: number;
}

export interface UpdateRowRequest extends CreateRowRequest {
  id?: number;
}

export interface BulkUpdateRowsRequest {
  rows: UpdateRowRequest[];
}

export interface CreateNamespaceRequest {
  prefix: string;
  namespace: string;
}

export interface UpdateNamespaceRequest {
  namespace: string;
}

// Validation types
export interface ValidationError {
  row?: number;
  column?: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

// API Response wrapper
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  details?: Record<string, unknown>;
}
