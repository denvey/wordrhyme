/**
 * Types for Permission Config Components
 */

/**
 * Developer-defined quick-select action group
 */
export interface ActionGroupDefinition {
  key: string;
  label: string;
  actions: readonly string[];
}

/**
 * Field definition for field-level permissions
 */
export interface FieldDefinition {
  name: string;
  label: string;
  description?: string;
  sensitive?: boolean;
}

/**
 * Resource tree node structure from backend
 */
export interface ResourceTreeNode {
  code: string;
  subject: string;
  label: string;
  icon: string;
  category: string;
  order: number;
  isDirectory: boolean;
  actions: readonly string[];
  /** Optional descriptions for actions (shown as tooltip) */
  actionDescriptions?: Readonly<Record<string, string>>;
  availablePresets: readonly string[];
  children: ResourceTreeNode[];
  /** System reserved: cannot be assigned to other roles via UI */
  systemReserved?: boolean;
  /** Developer-defined quick-select action groups */
  actionGroups?: readonly ActionGroupDefinition[];
}

/**
 * Condition preset key
 */
export type PresetKey =
  | 'none'
  | 'own'
  | 'team'
  | 'department'
  | 'public'
  | 'draft'
  | 'published'
  | 'assigned'
  | 'not_archived';

/**
 * Preset info from backend
 */
export interface PresetInfo {
  key: string;
  label: string;
  description: string;
  icon: string;
}

/**
 * Field permission state (read/write separately)
 */
export interface FieldPermissionState {
  readable: string[];  // Fields that can be read
  writable: string[];  // Fields that can be written/updated
}

/**
 * Permission state for a single resource
 */
export interface ResourcePermissionState {
  actions: string[];
  fields: FieldPermissionState | null; // null means all fields allowed for all operations
  preset: PresetKey | null;
  customConditions: Record<string, unknown> | null;
}

/**
 * Overall permission state keyed by subject
 */
export type PermissionState = Record<string, ResourcePermissionState>;

/**
 * Action for permission state reducer
 */
export type PermissionAction =
  | { type: 'SET_INITIAL'; payload: PermissionState }
  | { type: 'TOGGLE_ACTION'; subject: string; action: string; availableActions?: readonly string[] | undefined }
  | { type: 'SET_ACTIONS'; subject: string; actions: string[] }
  | { type: 'SET_FIELDS'; subject: string; fields: FieldPermissionState | null }
  | { type: 'SET_PRESET'; subject: string; preset: PresetKey }
  | { type: 'SET_CUSTOM_CONDITIONS'; subject: string; conditions: Record<string, unknown> | null }
  | { type: 'CLEAR_RESOURCE'; subject: string }
  | { type: 'SET_ALL_CHILDREN'; subjects: string[]; actions: string[][] }
  | { type: 'TOGGLE_ALL'; resourceTree: ResourceTreeNode[]; selectAll: boolean }
  | { type: 'RESET' };
