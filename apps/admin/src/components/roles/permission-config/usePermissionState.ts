/**
 * Permission State Reducer
 *
 * Manages the state of permission configuration with immutable updates.
 */
import { useReducer, useCallback, useMemo } from 'react';
import type { PermissionState, PermissionAction, ResourcePermissionState, PresetKey, ResourceTreeNode, FieldPermissionState } from './types';

/**
 * Default permission state for a resource
 */
const DEFAULT_RESOURCE_STATE: ResourcePermissionState = {
  actions: [],
  fields: null,
  preset: null,
  customConditions: null,
};

/**
 * Normalizes actions for a resource
 * If all available actions are selected, simplify to ['manage']
 */
function normalizeActions(actions: string[], availableActions?: readonly string[]): string[] {
  if (actions.includes('manage')) return ['manage'];

  if (availableActions && availableActions.length > 0) {
    const hasAll = availableActions.every(a => actions.includes(a));
    if (hasAll) return ['manage'];
  }

  return actions;
}

/**
 * Reducer for permission state
 */
function permissionReducer(state: PermissionState, action: PermissionAction): PermissionState {
  switch (action.type) {
    case 'SET_INITIAL':
      return action.payload;

    case 'TOGGLE_ACTION': {
      const { subject, action: actionName, availableActions } = action;
      const current = state[subject] || DEFAULT_RESOURCE_STATE;

      const hasAction = current.actions.includes(actionName);
      const hasManage = current.actions.includes('manage');
      const isEffectivelyChecked = hasAction || hasManage;

      let newActions: string[];
      if (isEffectivelyChecked) {
        // We are UNCHECKING
        if (hasManage && availableActions) {
          // If we had 'manage', expand it to all other actions
          newActions = availableActions.filter(a => a !== actionName && a !== 'manage');
        } else {
          // Just remove the specific action
          newActions = current.actions.filter(a => a !== actionName && a !== 'manage');
        }
      } else {
        // We are CHECKING
        newActions = [...current.actions, actionName];
      }

      return {
        ...state,
        [subject]: {
          ...current,
          actions: normalizeActions(newActions, availableActions),
        },
      };
    }

    case 'SET_ACTIONS': {
      const { subject, actions } = action;
      const current = state[subject] || DEFAULT_RESOURCE_STATE;

      // Try to find the node to get available actions for normalization
      // Note: In SET_ACTIONS, we might not have availableActions easily, 
      // but PermissionGroup can pass the normalized list if it wants.

      return {
        ...state,
        [subject]: {
          ...current,
          actions: normalizeActions(actions),
        },
      };
    }

    case 'SET_FIELDS': {
      const { subject, fields } = action;
      const current = state[subject] || DEFAULT_RESOURCE_STATE;
      return {
        ...state,
        [subject]: {
          ...current,
          fields,
        },
      };
    }

    case 'SET_PRESET': {
      const { subject, preset } = action;
      const current = state[subject] || DEFAULT_RESOURCE_STATE;
      return {
        ...state,
        [subject]: {
          ...current,
          preset,
          // Clear custom conditions when selecting a preset
          customConditions: preset !== 'none' ? null : current.customConditions,
        },
      };
    }

    case 'SET_CUSTOM_CONDITIONS': {
      const { subject, conditions } = action;
      const current = state[subject] || DEFAULT_RESOURCE_STATE;
      return {
        ...state,
        [subject]: {
          ...current,
          preset: null, // Custom conditions clear preset selection
          customConditions: conditions,
        },
      };
    }

    case 'CLEAR_RESOURCE': {
      const { subject } = action;
      const newState = { ...state };
      delete newState[subject];
      return newState;
    }

    case 'SET_ALL_CHILDREN': {
      const { subjects, actions } = action;
      const newState = { ...state };
      subjects.forEach((subject, index) => {
        const current = newState[subject] || DEFAULT_RESOURCE_STATE;
        newState[subject] = {
          ...current,
          actions: normalizeActions(actions[index] || []),
        };
      });
      return newState;
    }

    case 'TOGGLE_ALL': {
      const { resourceTree, selectAll } = action;
      const newState = { ...state };

      // Recursively collect all non-directory nodes
      const collectAllNodes = (nodes: ResourceTreeNode[]): ResourceTreeNode[] => {
        const result: ResourceTreeNode[] = [];
        for (const node of nodes) {
          if (!node.isDirectory) {
            result.push(node);
          }
          result.push(...collectAllNodes(node.children));
        }
        return result;
      };

      const allNodes = collectAllNodes(resourceTree);
      for (const node of allNodes) {
        const current = newState[node.subject] || DEFAULT_RESOURCE_STATE;
        newState[node.subject] = {
          ...current,
          actions: selectAll ? [...node.actions] : [],
        };
      }
      return newState;
    }

    case 'RESET':
      return {};

    default:
      return state;
  }
}

/**
 * Calculate permission count for a node and its children
 */
function calculatePermissionCount(
  node: ResourceTreeNode,
  state: PermissionState
): { selected: number; total: number } {
  let selected = 0;
  let total = 0;

  // Count this node's permissions (if not directory)
  if (!node.isDirectory && node.actions.length > 0) {
    total += node.actions.length;
    const nodeState = state[node.subject];
    if (nodeState) {
      // If 'manage' is present, all actions for this node are selected
      if (nodeState.actions.includes('manage')) {
        selected += node.actions.length;
      } else {
        selected += nodeState.actions.length;
      }
    }
  }

  // Count children recursively
  for (const child of node.children) {
    const childCount = calculatePermissionCount(child, state);
    selected += childCount.selected;
    total += childCount.total;
  }

  return { selected, total };
}

/**
 * Get all descendant resource subjects (non-directory)
 */
function getDescendantSubjects(node: ResourceTreeNode): string[] {
  const subjects: string[] = [];

  if (!node.isDirectory) {
    subjects.push(node.subject);
  }

  for (const child of node.children) {
    subjects.push(...getDescendantSubjects(child));
  }

  return subjects;
}

/**
 * Custom hook for managing permission state
 */
export function usePermissionState(initialState: PermissionState = {}) {
  const [state, dispatch] = useReducer(permissionReducer, initialState);

  const toggleAction = useCallback((subject: string, action: string, availableActions?: readonly string[]) => {
    dispatch({ type: 'TOGGLE_ACTION', subject, action, availableActions });
  }, []);

  const setActions = useCallback((subject: string, actions: string[]) => {
    dispatch({ type: 'SET_ACTIONS', subject, actions });
  }, []);

  const setFields = useCallback((subject: string, fields: FieldPermissionState | null) => {
    dispatch({ type: 'SET_FIELDS', subject, fields });
  }, []);

  const setPreset = useCallback((subject: string, preset: PresetKey) => {
    dispatch({ type: 'SET_PRESET', subject, preset });
  }, []);

  const setCustomConditions = useCallback(
    (subject: string, conditions: Record<string, unknown> | null) => {
      dispatch({ type: 'SET_CUSTOM_CONDITIONS', subject, conditions });
    },
    []
  );

  const clearResource = useCallback((subject: string) => {
    dispatch({ type: 'CLEAR_RESOURCE', subject });
  }, []);

  const setInitialState = useCallback((newState: PermissionState) => {
    dispatch({ type: 'SET_INITIAL', payload: newState });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  const getResourceState = useCallback(
    (subject: string): ResourcePermissionState => {
      return state[subject] || DEFAULT_RESOURCE_STATE;
    },
    [state]
  );

  const hasPermission = useCallback(
    (subject: string, action: string): boolean => {
      const resourceState = state[subject];
      if (!resourceState) return false;
      return resourceState.actions.includes(action) || resourceState.actions.includes('manage');
    },
    [state]
  );

  /**
   * Toggle all permissions for a directory node (cascade to children)
   */
  const toggleAllForNode = useCallback(
    (node: ResourceTreeNode, resourceTree: ResourceTreeNode[]) => {
      const descendants = getDescendantSubjects(node);
      const { selected, total } = calculatePermissionCount(node, state);
      const isFullySelected = selected === total && total > 0;

      // Find all descendant nodes to get their available actions
      const findNode = (nodes: ResourceTreeNode[], subject: string): ResourceTreeNode | null => {
        for (const n of nodes) {
          if (n.subject === subject) return n;
          const found = findNode(n.children, subject);
          if (found) return found;
        }
        return null;
      };

      const subjects: string[] = [];
      const actionsArray: string[][] = [];

      for (const subject of descendants) {
        const nodeForSubject = findNode(resourceTree, subject);
        if (nodeForSubject && !nodeForSubject.isDirectory) {
          subjects.push(subject);
          // If fully selected, clear all; otherwise select all
          actionsArray.push(isFullySelected ? [] : [...nodeForSubject.actions]);
        }
      }

      dispatch({ type: 'SET_ALL_CHILDREN', subjects, actions: actionsArray });
    },
    [state]
  );

  /**
   * Get permission count for a node (for display like "3/12")
   */
  const getPermissionCount = useCallback(
    (node: ResourceTreeNode): { selected: number; total: number } => {
      return calculatePermissionCount(node, state);
    },
    [state]
  );

  /**
   * Toggle all permissions (select all or clear all)
   */
  const toggleAll = useCallback(
    (resourceTree: ResourceTreeNode[], selectAll: boolean) => {
      dispatch({ type: 'TOGGLE_ALL', resourceTree, selectAll });
    },
    []
  );

  /**
   * Calculate total permission count across all resources
   */
  const getTotalPermissionCount = useCallback(
    (resourceTree: ResourceTreeNode[]): { selected: number; total: number } => {
      let selected = 0;
      let total = 0;
      for (const node of resourceTree) {
        const count = calculatePermissionCount(node, state);
        selected += count.selected;
        total += count.total;
      }
      return { selected, total };
    },
    [state]
  );

  // Check if there are any configured permissions
  const hasAnyPermissions = useMemo(() => {
    return Object.values(state).some(
      rs => rs.actions.length > 0 || rs.preset || rs.customConditions || rs.fields
    );
  }, [state]);

  return {
    state,
    toggleAction,
    setActions,
    setFields,
    setPreset,
    setCustomConditions,
    clearResource,
    setInitialState,
    reset,
    getResourceState,
    hasPermission,
    hasAnyPermissions,
    toggleAllForNode,
    getPermissionCount,
    toggleAll,
    getTotalPermissionCount,
  };
}

export { getDescendantSubjects, calculatePermissionCount };
