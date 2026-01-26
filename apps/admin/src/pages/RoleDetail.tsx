/**
 * Role Detail Page
 *
 * View and edit a role's details, menu visibility, and CASL permissions.
 * Organized into tabs: General Info, Menu Visibility, Data Permissions.
 */
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Shield, ArrowLeft, Save, Info, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { useActiveOrganization } from '../lib/auth-client';
import { trpc } from '../lib/trpc';
import {
    Button,
    Label,
    Input,
    Badge,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Card,
    CardContent,
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from '@wordrhyme/ui';
import { toast } from 'sonner';
import { MenuVisibilityEditor } from '../components/roles/menu-config';

/**
 * CASL rule structure
 */
interface CaslRule {
    action: string;
    subject: string;
    fields?: string[] | null;
    conditions?: Record<string, unknown> | null;
    inverted?: boolean;
}

interface PermissionMeta {
    subjects: Array<{ value: string; label: string; description: string }>;
    actions: Array<{ value: string; label: string; description: string }>;
}

/**
 * Single CASL Rule Editor Component
 */
function RuleEditor({
    rule,
    index,
    meta,
    disabled,
    onChange,
    onRemove,
}: {
    rule: CaslRule;
    index: number;
    meta: PermissionMeta;
    disabled: boolean;
    onChange: (index: number, rule: CaslRule) => void;
    onRemove: (index: number) => void;
}) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [fieldsInput, setFieldsInput] = useState(rule.fields?.join(', ') || '');
    const [conditionsInput, setConditionsInput] = useState(
        rule.conditions ? JSON.stringify(rule.conditions, null, 2) : ''
    );
    const [conditionsError, setConditionsError] = useState<string | null>(null);

    const handleFieldsChange = (value: string) => {
        setFieldsInput(value);
        const fields = value
            .split(',')
            .map(f => f.trim())
            .filter(f => f.length > 0);
        onChange(index, { ...rule, fields: fields.length > 0 ? fields : null });
    };

    const handleConditionsChange = (value: string) => {
        setConditionsInput(value);
        setConditionsError(null);

        if (!value.trim()) {
            onChange(index, { ...rule, conditions: null });
            return;
        }

        try {
            const parsed = JSON.parse(value);
            onChange(index, { ...rule, conditions: parsed });
        } catch {
            setConditionsError('Invalid JSON format');
        }
    };

    const actionLabel = meta.actions.find(a => a.value === rule.action)?.label || rule.action;
    const subjectLabel = meta.subjects.find(s => s.value === rule.subject)?.label || rule.subject;
    const hasAdvanced = rule.fields?.length || rule.conditions || rule.inverted;

    return (
        <Card className={rule.inverted ? 'border-destructive/50 bg-destructive/5' : ''}>
            <CardContent className="pt-4">
                <div className="flex items-start gap-4">
                    {/* Main rule config */}
                    <div className="flex-1 grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">
                                {rule.inverted ? 'Cannot' : 'Can'}
                            </Label>
                            <Select
                                value={rule.action}
                                onValueChange={(value) => onChange(index, { ...rule, action: value })}
                                disabled={disabled}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select action" />
                                </SelectTrigger>
                                <SelectContent>
                                    {meta.actions.map((action) => (
                                        <SelectItem key={action.value} value={action.value}>
                                            <div className="flex flex-col">
                                                <span>{action.label}</span>
                                                <span className="text-xs text-muted-foreground">{action.description}</span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">Subject</Label>
                            <Select
                                value={rule.subject}
                                onValueChange={(value) => onChange(index, { ...rule, subject: value })}
                                disabled={disabled}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select subject" />
                                </SelectTrigger>
                                <SelectContent>
                                    {meta.subjects.map((subject) => (
                                        <SelectItem key={subject.value} value={subject.value}>
                                            <div className="flex flex-col">
                                                <span>{subject.label}</span>
                                                <span className="text-xs text-muted-foreground">{subject.description}</span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Remove button */}
                    {!disabled && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:bg-destructive/10"
                            onClick={() => onRemove(index)}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    )}
                </div>

                {/* Advanced options (collapsible) */}
                <Collapsible open={isExpanded} onOpenChange={setIsExpanded} className="mt-4">
                    <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-full justify-between">
                            <span className="text-xs">
                                Advanced Options
                                {hasAdvanced && (
                                    <Badge variant="secondary" className="ml-2 text-xs">
                                        Configured
                                    </Badge>
                                )}
                            </span>
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-4 pt-4">
                        {/* Fields */}
                        <div className="space-y-2">
                            <Label className="text-xs">
                                Fields (comma-separated)
                                <span className="text-muted-foreground ml-2">e.g., title, body, status</span>
                            </Label>
                            <Input
                                value={fieldsInput}
                                onChange={(e) => handleFieldsChange(e.target.value)}
                                placeholder="Leave empty for all fields"
                                disabled={disabled}
                            />
                            <p className="text-xs text-muted-foreground">
                                Restrict access to specific fields only. Leave empty to allow all fields.
                            </p>
                        </div>

                        {/* Conditions */}
                        <div className="space-y-2">
                            <Label className="text-xs">
                                Conditions (JSON)
                                <span className="text-muted-foreground ml-2">e.g., {"{ \"ownerId\": \"${user.id}\" }"}</span>
                            </Label>
                            <textarea
                                value={conditionsInput}
                                onChange={(e) => handleConditionsChange(e.target.value)}
                                placeholder='{"ownerId": "${user.id}"}'
                                rows={3}
                                disabled={disabled}
                                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                            {conditionsError && (
                                <p className="text-xs text-destructive">{conditionsError}</p>
                            )}
                            <p className="text-xs text-muted-foreground">
                                ABAC conditions. Use {"${user.id}"} to reference current user's ID.
                            </p>
                        </div>

                        {/* Inverted (Cannot) */}
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id={`inverted-${index}`}
                                checked={rule.inverted || false}
                                onChange={(e) => onChange(index, { ...rule, inverted: e.target.checked })}
                                disabled={disabled}
                                className="h-4 w-4 rounded border-gray-300"
                            />
                            <Label htmlFor={`inverted-${index}`} className="text-sm font-normal">
                                Invert rule (Cannot instead of Can)
                            </Label>
                        </div>
                    </CollapsibleContent>
                </Collapsible>

                {/* Rule summary */}
                <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
                    {rule.inverted ? 'Cannot' : 'Can'} <span className="font-medium">{actionLabel}</span> on{' '}
                    <span className="font-medium">{subjectLabel}</span>
                    {rule.fields?.length ? ` (fields: ${rule.fields.join(', ')})` : ''}
                    {rule.conditions ? ' with conditions' : ''}
                </div>
            </CardContent>
        </Card>
    );
}

export function RoleDetailPage() {
    const { roleId } = useParams<{ roleId: string }>();
    const navigate = useNavigate();
    const { data: activeOrg } = useActiveOrganization();

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [rules, setRules] = useState<CaslRule[]>([]);
    const [hasChanges, setHasChanges] = useState(false);

    // Fetch role details
    const { data: role, isLoading: roleLoading, refetch: refetchRole } = trpc.roles.get.useQuery(
        { roleId: roleId! },
        { enabled: !!roleId && !!activeOrg?.id }
    );

    // Fetch permission metadata for dropdowns
    const { data: permissionMeta, isLoading: metaLoading } = trpc.permissions.meta.useQuery(
        undefined,
        { enabled: !!activeOrg?.id }
    );

    // Update role mutation
    const updateMutation = trpc.roles.update.useMutation({
        onSuccess: () => {
            toast.success('Role updated successfully');
            setHasChanges(false);
            refetchRole();
        },
        onError: (error: { message?: string }) => {
            toast.error(error.message || 'Failed to update role');
        },
    });

    // Assign permissions mutation (CASL format)
    const assignPermissionsMutation = trpc.roles.assignPermissions.useMutation({
        onSuccess: () => {
            toast.success('Permissions updated successfully');
            setHasChanges(false);
            refetchRole();
        },
        onError: (error: { message?: string }) => {
            toast.error(error.message || 'Failed to update permissions');
        },
    });

    // Initialize form when role data loads
    useEffect(() => {
        if (role) {
            setName(role.name);
            setDescription(role.description || '');
            setRules(role.rules || []);
        }
    }, [role]);

    // Default meta if not loaded
    const meta: PermissionMeta = permissionMeta || {
        subjects: [{ value: 'all', label: 'All', description: '' }],
        actions: [{ value: 'manage', label: 'Manage', description: '' }],
    };

    const handleAddRule = () => {
        setRules([...rules, { action: 'read', subject: 'Content' }]);
        setHasChanges(true);
    };

    const handleUpdateRule = (index: number, updatedRule: CaslRule) => {
        const newRules = [...rules];
        newRules[index] = updatedRule;
        setRules(newRules);
        setHasChanges(true);
    };

    const handleRemoveRule = (index: number) => {
        setRules(rules.filter((_, i) => i !== index));
        setHasChanges(true);
    };

    const handleSave = async () => {
        if (!roleId || !role) return;

        // Update role name/description if changed
        if (name !== role.name || description !== (role.description || '')) {
            await updateMutation.mutateAsync({
                roleId,
                name: name !== role.name ? name : undefined,
                description: description !== (role.description || '') ? description : undefined,
            });
        }

        // Update permissions with CASL rules format
        const originalRulesJson = JSON.stringify(role.rules || []);
        const currentRulesJson = JSON.stringify(rules);

        if (currentRulesJson !== originalRulesJson) {
            await assignPermissionsMutation.mutateAsync({
                roleId,
                rules: rules.map(r => ({
                    action: r.action,
                    subject: r.subject,
                    fields: r.fields ?? null,
                    conditions: r.conditions ?? null,
                    inverted: r.inverted ?? false,
                })),
            });
        }
    };

    const isLoading = roleLoading || metaLoading;
    const isSaving = updateMutation.isPending || assignPermissionsMutation.isPending;
    const isOwnerRole = role?.slug === 'owner';

    if (isLoading) {
        return (
            <div className="p-12 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            </div>
        );
    }

    if (!role) {
        return (
            <div className="p-12 text-center text-muted-foreground">
                <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Role not found.</p>
                <Button variant="outline" className="mt-4" onClick={() => navigate('/roles')}>
                    Back to Roles
                </Button>
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-center gap-4 mb-8">
                <Button variant="ghost" size="icon" onClick={() => navigate('/roles')}>
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        <h1 className="text-3xl font-bold">{role.name}</h1>
                        {role.isSystem && <Badge variant="secondary">System</Badge>}
                    </div>
                    <p className="text-muted-foreground">
                        {role.description || `Manage permissions for ${role.name}`}
                    </p>
                </div>
                {!isOwnerRole && (
                    <Button onClick={handleSave} disabled={!hasChanges || isSaving}>
                        <Save className="h-4 w-4 mr-2" />
                        {isSaving ? 'Saving...' : 'Save Changes'}
                    </Button>
                )}
            </div>

            {isOwnerRole && (
                <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950 p-4 flex items-start gap-3">
                    <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5" />
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                        The Owner role has full access to all resources and cannot be modified.
                    </p>
                </div>
            )}

            <Tabs defaultValue="general" className="w-full">
                <TabsList className="grid w-full grid-cols-3 mb-6">
                    <TabsTrigger value="general">General</TabsTrigger>
                    <TabsTrigger value="menu-visibility">Menu Visibility</TabsTrigger>
                    <TabsTrigger value="data-permissions">Data Permissions</TabsTrigger>
                </TabsList>

                {/* Tab 1: General Info */}
                <TabsContent value="general">
                    <div className="rounded-xl border border-border bg-card">
                        <div className="p-6 border-b border-border">
                            <h2 className="font-semibold">Role Details</h2>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Name</Label>
                                <Input
                                    id="name"
                                    value={name}
                                    onChange={(e) => {
                                        setName(e.target.value);
                                        setHasChanges(true);
                                    }}
                                    disabled={isOwnerRole}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="description">Description</Label>
                                <textarea
                                    id="description"
                                    value={description}
                                    onChange={(e) => {
                                        setDescription(e.target.value);
                                        setHasChanges(true);
                                    }}
                                    rows={3}
                                    disabled={isOwnerRole}
                                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                />
                            </div>
                        </div>
                    </div>
                </TabsContent>

                {/* Tab 2: Menu Visibility */}
                <TabsContent value="menu-visibility">
                    <MenuVisibilityEditor
                        roleId={roleId!}
                        isSystem={isOwnerRole}
                        organizationId={activeOrg?.id ?? null}
                    />
                </TabsContent>

                {/* Tab 3: Data Permissions (CASL) */}
                <TabsContent value="data-permissions">
                    <div className="rounded-xl border border-border bg-card">
                        <div className="p-6 border-b border-border flex items-center justify-between">
                            <div>
                                <h2 className="font-semibold">Permission Rules (CASL)</h2>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Configure fine-grained access control with actions, subjects, field restrictions, and conditions.
                                </p>
                            </div>
                            {!isOwnerRole && (
                                <Button onClick={handleAddRule} variant="outline" size="sm">
                                    <Plus className="h-4 w-4 mr-2" />
                                    Add Rule
                                </Button>
                            )}
                        </div>
                        <div className="p-6">
                            {rules.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                    <p>No permission rules configured.</p>
                                    {!isOwnerRole && (
                                        <Button onClick={handleAddRule} variant="outline" className="mt-4">
                                            <Plus className="h-4 w-4 mr-2" />
                                            Add First Rule
                                        </Button>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {rules.map((rule, index) => (
                                        <RuleEditor
                                            key={index}
                                            rule={rule}
                                            index={index}
                                            meta={meta}
                                            disabled={isOwnerRole}
                                            onChange={handleUpdateRule}
                                            onRemove={handleRemoveRule}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
