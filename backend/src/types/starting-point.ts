// LC Starting Point Types

export interface StartingPointMenuItem {
  label: string;
  type: string[];
  useResourceTemplates: string[];
}

export interface StartingPointMenuGroup {
  menuGroup: string;
  menuItems: StartingPointMenuItem[];
}

export interface StartingPointConfig {
  id: string;
  name: string;
  configType: 'startingPoints';
  json: StartingPointMenuGroup[];
}

// The file format is an array with a single config object
export type StartingPointFile = StartingPointConfig[];

export interface ImportStartingPointResult {
  shapesCreated: number;
  rowsCreated: number;
  folderId: number;
}

// Constants
export const STARTING_POINT_FOLDER_NAME = 'Starting Points';
export const STARTING_POINT_PREFIX = 'startingpoint:';
export const STARTING_POINT_INDEX_ID = 'startingpoint:index';
