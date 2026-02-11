/**
 * PermissionEditor Component
 *
 * Main container component that combines ResourcePermissionTree and AdvancedConfigPanel.
 * Manages state and provides save/reset functionality.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, Save, RotateCcw, Shield, Loader2 } from 'lucide-react';
import { Button, Input, Checkbox, cn } from '@wordrhyme/ui';
import { toast } from 'sonner';
import { trpc } from '../../../lib/trpc';
import { ResourcePermissionTree } from './ResourcePermissionTree';
import { AdvancedConfigPanel } from './AdvancedConfigPanel';
import { usePermissionState } from './usePermissionState';
import type {
  ResourceTreeNode,
  PresetInfo,
  PermissionState,
  PresetKey,
  ResourcePermissionState,
  FieldDefinition,
  FieldPermissionState,
} from './types';

interface PermissionEditorProps {
  roleId: string;
  isSystem?: boolean;
}

/**
 * Default resource permission state
 */
const DEFAULT_RESOURCE_STATE: ResourcePermissionState = {
  actions: [],
  fields: null,
  preset: null,
  customConditions: null,
};

export function PermissionEditor({ roleId, isSystem = false }: PermissionEditorProps) {
  console.log('[PermissionEditor] Component rendered with roleId:', roleId);

  const [searchTerm, setSearchTerm] = useState('');
  const [advancedSubject, setAdvancedSubject] = useState<string | null>(null);
  const [initialStateLoaded, setInitialStateLoaded] = useState(false);

  // Permission state management
  const {
    state: permissionState,
    toggleAction,
    setActions,
    setFields,
    setPreset,
    setCustomConditions,
    setInitialState,
    getResourceState,
    reset,
    toggleAllForNode,
    getPermissionCount,
    toggleAll,
    getTotalPermissionCount,
  } = usePermissionState();

  // Store initial state for dirty checking
  const [savedState, setSavedState] = useState<PermissionState>({});

  // Fetch resource tree
  const { data: resourceTree, isLoading: treeLoading } =
    trpc.permissionConfig.getResourceTree.useQuery();

  // Fetch presets
  const { data: allPresets, isLoading: presetsLoading } =
    trpc.permissionConfig.getPresets.useQuery();

  // Fetch current role permissions
  const { data: rolePermissions, isLoading: permissionsLoading, refetch } =
    trpc.permissionConfig.getRolePermissions.useQuery(
      { roleId },
      { enabled: !!roleId }
    );

  // Save mutation
  const saveMutation = trpc.permissionConfig.savePermissions.useMutation({
    onSuccess: () => {
      toast.success('Permissions saved successfully');
      setSavedState(permissionState);
      refetch();
    },
    onError: (error: { message?: string }) => {
      toast.error(error.message || 'Failed to save permissions');
    },
  });

  // Initialize permission state from backend
  useEffect(() => {
    console.log('[PermissionEditor] useEffect triggered:', {
      hasRolePermissions: !!rolePermissions,
      hasResourceTree: !!resourceTree,
      initialStateLoaded,
    });

    if (rolePermissions && resourceTree && !initialStateLoaded) {
      /**
       * Expand 'manage' action to all available actions for a resource.
       * If the actions array contains 'manage', replace it with the resource's full action set.
       */
      const expandManageAction = (subject: string, actions: string[]): string[] => {
        if (!actions.includes('manage')) {
          return actions;
        }

        // Find the resource definition to get available actions
        const findNode = (nodes: ResourceTreeNode[]): ResourceTreeNode | null => {
          for (const node of nodes) {
            if (node.subject === subject) return node;
            const found = findNode(node.children);
            if (found) return found;
          }
          return null;
        };

        const node = findNode(resourceTree);
        if (node && node.actions.length > 0) {
          // Replace 'manage' with all available actions
          console.log(`[PermissionEditor] Expanding 'manage' for ${subject} to:`, [...node.actions]);
          return [...node.actions];
        }

        console.log(`[PermissionEditor] No node found for ${subject}, keeping 'manage'`);
        return actions;
      };

      // Transform backend format to our state format
      const initialState: PermissionState = {};
      console.log('[PermissionEditor] Loading rolePermissions:', rolePermissions);

      for (const [subject, data] of Object.entries(rolePermissions as Record<string, { actions: string[]; preset: string | null; conditions: Record<string, unknown> | null }>)) {
        // Expand 'manage' to all specific actions for proper UI display
        const expandedActions = expandManageAction(subject, data.actions);

        initialState[subject] = {
          actions: expandedActions,
          fields: null, // TODO: Load from backend when field-level permissions are stored
          preset: data.preset as PresetKey | null,
          customConditions: data.conditions as Record<string, unknown> | null,
        };
      }

      console.log('[PermissionEditor] Initialized state:', initialState);
      setInitialState(initialState);
      setSavedState(initialState);
      setInitialStateLoaded(true);
    }
  }, [rolePermissions, resourceTree, initialStateLoaded, setInitialState]);

  // Reset initial state loaded when roleId changes
  useEffect(() => {
    setInitialStateLoaded(false);
  }, [roleId]);

  // Check for unsaved changes
  const hasChanges = useMemo(() => {
    return JSON.stringify(permissionState) !== JSON.stringify(savedState);
  }, [permissionState, savedState]);

  // Handle save
  const handleSave = useCallback(() => {
    if (!roleId || isSystem || !resourceTree) return;

    /**
     * Helper to find a resource node in the tree
     */
    const findNode = (nodes: ResourceTreeNode[], subject: string): ResourceTreeNode | null => {
      for (const node of nodes) {
        if (node.subject === subject) return node;
        const found = findNode(node.children, subject);
        if (found) return found;
      }
      return null;
    };

    /**
     * Compress actions to 'manage' if all available actions are selected.
     * This optimizes storage and allows CASL's 'manage' alias to work properly.
     */
    const compressToManage = (subject: string, actions: string[]): string[] => {
      const node = findNode(resourceTree, subject);
      if (!node || node.actions.length === 0) {
        return actions;
      }

      // Check if all resource actions are selected
      const allActionsSelected = node.actions.every(a => actions.includes(a));
      if (allActionsSelected && actions.length === node.actions.length) {
        console.log(`[PermissionEditor] Compressing ${subject} actions to 'manage'`);
        return ['manage'];
      }

      return actions;
    };

    // Transform state to backend format
    const permissions: Record<
      string,
      { actions: string[]; preset?: PresetKey | null; customConditions?: Record<string, unknown> | null }
    > = {};

    for (const [subject, state] of Object.entries(permissionState)) {
      if (state.actions.length > 0 || state.preset || state.customConditions) {
        // Compress to 'manage' if all actions are selected
        const compressedActions = compressToManage(subject, state.actions);

        permissions[subject] = {
          actions: compressedActions,
          preset: state.preset,
          customConditions: state.customConditions,
        };
      }
    }

    console.log('[PermissionEditor] Saving permissions:', permissions);
    saveMutation.mutate({
      roleId,
      permissions,
    });
  }, [roleId, isSystem, resourceTree, permissionState, saveMutation]);

  // Handle reset
  const handleReset = useCallback(() => {
    setInitialState(savedState);
    toast.info('Changes reverted');
  }, [savedState, setInitialState]);

  // Handle advanced config apply
  const handleAdvancedApply = useCallback(
    (preset: PresetKey | null, customConditions: Record<string, unknown> | null, fields: FieldPermissionState | null) => {
      if (!advancedSubject) return;

      if (fields !== undefined) {
        setFields(advancedSubject, fields);
      }

      if (customConditions) {
        setCustomConditions(advancedSubject, customConditions);
      } else if (preset) {
        setPreset(advancedSubject, preset);
      } else {
        // Clear advanced config
        setPreset(advancedSubject, 'none');
      }
    },
    [advancedSubject, setPreset, setCustomConditions, setFields]
  );

  // Get presets for current advanced subject
  const advancedPresets = useMemo((): PresetInfo[] => {
    if (!advancedSubject || !allPresets || !resourceTree) return [];

    // Cast allPresets to proper type (tRPC inference workaround)
    const presets = allPresets as PresetInfo[];

    // Find the resource node
    const findNode = (nodes: ResourceTreeNode[]): ResourceTreeNode | null => {
      for (const node of nodes) {
        if (node.subject === advancedSubject) return node;
        if (node.children) {
          const found = findNode(node.children);
          if (found) return found;
        }
      }
      return null;
    };

    const node = findNode(resourceTree);
    if (!node) return presets;

    // Filter presets by availablePresets
    return presets.filter(
      (preset) =>
        node.availablePresets.includes(preset.key as PresetKey) ||
        preset.key === 'none'
    );
  }, [advancedSubject, allPresets, resourceTree]);

  // Get label for advanced subject
  const advancedLabel = useMemo((): string => {
    if (!advancedSubject || !resourceTree) return '';

    const findNode = (nodes: ResourceTreeNode[]): ResourceTreeNode | null => {
      for (const node of nodes) {
        if (node.subject === advancedSubject) return node;
        if (node.children) {
          const found = findNode(node.children);
          if (found) return found;
        }
      }
      return null;
    };

    return findNode(resourceTree)?.label || advancedSubject;
  }, [advancedSubject, resourceTree]);

  // Get available fields for advanced subject (fetch from backend)
  const { data: resourceDetail } = trpc.permissionConfig.getResourceDetail.useQuery(
    { subject: advancedSubject || '' },
    { enabled: !!advancedSubject }
  );

  const advancedFields = useMemo(() => {
    if (!resourceDetail) return [];
    return resourceDetail.availableFields || [];
  }, [resourceDetail]);

  // Handle cascade selection for directory nodes
  const handleToggleAllForNode = useCallback(
    (node: ResourceTreeNode) => {
      if (!resourceTree) return;
      toggleAllForNode(node, resourceTree);
    },
    [resourceTree, toggleAllForNode]
  );

  const isLoading = treeLoading || presetsLoading || permissionsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!resourceTree) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>Failed to load resources</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between gap-4">
        <div className="flex-1">
          <h2 className="font-semibold">Permission Configuration</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configure resource access permissions. Click checkboxes for quick selection, or use
            advanced config for condition rules.
          </p>
        </div>

        {/* Search */}
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search resources..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Tree Content */}
      <div className="p-4 max-h-[600px] overflow-y-auto">
        {/* Top-level Select All Row */}
        {(() => {
          const totalCount = getTotalPermissionCount(resourceTree);
          const isAllSelected = totalCount.selected === totalCount.total && totalCount.total > 0;
          const isPartiallySelected = totalCount.selected > 0 && totalCount.selected < totalCount.total;

          return (
            <div
              className={cn(
                'flex items-center gap-3 py-3 px-3 mb-2 rounded-lg border',
                'bg-muted/30 hover:bg-muted/50 transition-colors'
              )}
            >
              <Checkbox
                checked={isAllSelected}
                disabled={isSystem}
                onCheckedChange={(checked) => {
                  toggleAll(resourceTree, !!checked);
                }}
                className="h-4 w-4"
                {...(isPartiallySelected ? { 'data-state': 'indeterminate' as const } : {})}
              />
              <span className="text-sm font-medium flex-1">Select All Permissions</span>
              <span className={cn(
                'text-xs px-2 py-0.5 rounded',
                totalCount.selected > 0
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted text-muted-foreground'
              )}>
                {totalCount.selected}/{totalCount.total}
              </span>
            </div>
          );
        })()}

        <ResourcePermissionTree
          resourceTree={resourceTree}
          permissionState={permissionState}
          searchTerm={searchTerm}
          disabled={isSystem}
          onToggleAction={toggleAction}
          onSetActions={setActions}
          onOpenAdvanced={setAdvancedSubject}
          onToggleAllForNode={handleToggleAllForNode}
          getPermissionCount={getPermissionCount}
        />
      </div>

      {/* Footer */}
      {!isSystem && (
        <div className="p-4 border-t border-border flex items-center justify-between">
          <div>
            {hasChanges && (
              <span className="text-sm text-amber-600 dark:text-amber-400">
                You have unsaved changes
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={!hasChanges || saveMutation.isPending}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>
            <Button
              onClick={handleSave}
              disabled={!hasChanges || saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Changes
            </Button>
          </div>
        </div>
      )}

      {/* Advanced Config Panel (Slide-in from right) */}
      <AdvancedConfigPanel
        isOpen={!!advancedSubject}
        subject={advancedSubject || ''}
        label={advancedLabel}
        presets={advancedPresets}
        availableFields={advancedFields as FieldDefinition[]}
        currentState={advancedSubject ? getResourceState(advancedSubject) : DEFAULT_RESOURCE_STATE}
        onApply={handleAdvancedApply}
        onClose={() => setAdvancedSubject(null)}
      />

      {/* Overlay when panel is open */}
      {advancedSubject && (
        <div
          className="fixed inset-0 bg-black/20 z-40"
          onClick={() => setAdvancedSubject(null)}
        />
      )}
    </div>
  );
}
