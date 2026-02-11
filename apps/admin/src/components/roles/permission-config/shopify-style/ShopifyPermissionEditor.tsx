import { useState, useEffect, useCallback, useMemo } from 'react';
import { Save, RotateCcw, Shield, Loader2 } from 'lucide-react';
import { Button, cn } from '@wordrhyme/ui';
import { toast } from 'sonner';
import { trpc } from '../../../../lib/trpc';
import { ShopifyPermissionList } from './ShopifyPermissionList';
import { AdvancedConfigPanel } from '../AdvancedConfigPanel';
import { usePermissionState } from '../usePermissionState';
import type {
  ResourceTreeNode,
  PresetInfo,
  PermissionState,
  PresetKey,
  ResourcePermissionState,
  FieldDefinition,
  FieldPermissionState,
} from '../types';

interface ShopifyPermissionEditorProps {
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

export function ShopifyPermissionEditor({
  roleId,
  isSystem = false,
}: ShopifyPermissionEditorProps) {
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
  const { data: allPresets } = trpc.permissionConfig.getPresets.useQuery();

  // Fetch current role permissions
  const {
    data: rolePermissions,
    isLoading: permissionsLoading,
    refetch,
  } = trpc.permissionConfig.getRolePermissions.useQuery(
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
    if (rolePermissions && !initialStateLoaded) {
      const initialState: PermissionState = {};
      for (const [subject, data] of Object.entries(
        rolePermissions as Record<
          string,
          {
            actions: string[];
            preset: string | null;
            conditions: Record<string, unknown> | null;
          }
        >
      )) {
        initialState[subject] = {
          actions: data.actions,
          fields: null, // TODO: Load from backend when field-level permissions are stored
          preset: data.preset as PresetKey | null,
          customConditions: data.conditions as Record<string, unknown> | null,
        };
      }
      setInitialState(initialState);
      setSavedState(initialState);
      setInitialStateLoaded(true);
    }
  }, [rolePermissions, initialStateLoaded, setInitialState]);

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
    if (!roleId || isSystem) return;

    const permissions: Record<
      string,
      {
        actions: string[];
        preset?: PresetKey | null;
        customConditions?: Record<string, unknown> | null;
      }
    > = {};

    for (const [subject, state] of Object.entries(permissionState)) {
      if (state.actions.length > 0 || state.preset || state.customConditions) {
        permissions[subject] = {
          actions: state.actions,
          preset: state.preset,
          customConditions: state.customConditions,
        };
      }
    }

    saveMutation.mutate({
      roleId,
      permissions,
    });
  }, [roleId, isSystem, permissionState, saveMutation]);

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
        setPreset(advancedSubject, 'none');
      }
    },
    [advancedSubject, setPreset, setCustomConditions, setFields]
  );

  // Get presets for current advanced subject
  const advancedPresets = useMemo((): PresetInfo[] => {
    if (!advancedSubject || !allPresets || !resourceTree) return [];
    const presets = allPresets as PresetInfo[];

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

  // Get available fields for advanced subject
  const { data: resourceDetail } = trpc.permissionConfig.getResourceDetail.useQuery(
    { subject: advancedSubject || '' },
    { enabled: !!advancedSubject }
  );

  const advancedFields = useMemo(() => {
    if (!resourceDetail) return [];
    return resourceDetail.availableFields || [];
  }, [resourceDetail]);

  // Handle toggle all for node (cascade selection)
  const handleToggleAllForNode = useCallback(
    (node: ResourceTreeNode) => {
      if (!resourceTree) return;
      toggleAllForNode(node, resourceTree);
    },
    [resourceTree, toggleAllForNode]
  );

  const isLoading = treeLoading || permissionsLoading;

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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Permissions</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configure what this role can access
          </p>
        </div>

        {!isSystem && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={!hasChanges || saveMutation.isPending}
            >
              <RotateCcw className="h-4 w-4 mr-1.5" />
              Reset
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!hasChanges || saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1.5" />
              )}
              Save
            </Button>
          </div>
        )}
      </div>



      {/* Shopify-style Permission List */}
      <ShopifyPermissionList
        resourceTree={resourceTree}
        permissionState={permissionState}
        searchTerm={searchTerm}
        disabled={isSystem}
        onSearchChange={setSearchTerm}
        onToggleAction={toggleAction}
        onSetActions={setActions}
        onToggleAllForNode={handleToggleAllForNode}
        onToggleAll={toggleAll}
        getPermissionCount={getPermissionCount}
        getTotalPermissionCount={getTotalPermissionCount}
        onOpenAdvanced={setAdvancedSubject}
      />

      {/* System Role Warning */}
      {isSystem && (
        <div className="px-3 py-2 bg-muted rounded-md">
          <p className="text-sm text-muted-foreground">
            System roles cannot be modified
          </p>
        </div>
      )}

      {/* Advanced Config Panel */}
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
