// Marva Profile JSON Types (LC Sinopia/Marva format)

export interface MarvaProfileDocument {
  id: string;
  name: string;
  configType: 'profile';
  json: {
    Profile: MarvaProfile;
  };
  metadata: {
    createDate: string;
    updateDate: string;
    createUser?: string | null;
    updateUser?: string | null;
  };
  created: string;
  modified: string;
}

export interface MarvaProfile {
  id: string;
  title: string;
  description?: string;
  author?: string;
  date?: string;
  resourceTemplates: MarvaResourceTemplate[];
}

export interface MarvaResourceTemplate {
  id: string;
  resourceURI?: string;
  resourceLabel?: string;
  remark?: string;
  author?: string;
  date?: string;
  propertyTemplates: MarvaPropertyTemplate[];
}

export interface MarvaPropertyTemplate {
  propertyURI: string;
  propertyLabel: string;
  mandatory: string; // "true" or "false"
  repeatable: string; // "true" or "false"
  type: 'literal' | 'resource' | 'lookup' | 'list';
  remark?: string;
  resourceTemplates?: unknown[]; // Always ignore
  valueConstraint: MarvaValueConstraint;
}

export interface MarvaValueConstraint {
  valueTemplateRefs: string[];
  useValuesFrom: string[];
  defaults: MarvaDefault[];
  valueDataType: {
    dataTypeURI?: string;
  };
  editable?: string;
  repeatable?: string;
  valueLanguage?: string;
}

export interface MarvaDefault {
  defaultURI?: string;
  defaultLiteral?: string;
}

// Import request
export interface ImportMarvaProfileRequest {
  workspaceName: string;
  profiles: MarvaProfileDocument[];
}

// Import result
export interface ImportMarvaProfileResult {
  workspaceId: string;
  workspaceName: string;
  shapesCreated: number;
  rowsCreated: number;
}
