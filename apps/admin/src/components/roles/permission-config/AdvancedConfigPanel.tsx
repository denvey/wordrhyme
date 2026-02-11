import { memo, useState, useEffect, useMemo } from 'react';
import { X, Check, User, Users, Building, Globe, FileText, Eye, UserCheck, Archive, Shield, Search } from 'lucide-react';
import {
  Button,
  Label,
  Checkbox,
  cn,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@wordrhyme/ui';
import type { PresetKey, PresetInfo, ResourcePermissionState, FieldDefinition, FieldPermissionState } from './types';

/**
 * Preset icons mapping
 */
const PRESET_ICONS: Record<string, React.ElementType> = {
  none: Globe,
  own: User,
  team: Users,
  department: Building,
  public: Globe,
  draft: FileText,
  published: Eye,
  assigned: UserCheck,
  not_archived: Archive,
};

interface AdvancedConfigPanelProps {
  isOpen: boolean;
  subject: string;
  label: string;
  presets: PresetInfo[];
  availableFields: FieldDefinition[];
  currentState: ResourcePermissionState;
  onApply: (preset: PresetKey | null, customConditions: Record<string, unknown> | null, fields: FieldPermissionState | null) => void;
  onClose: () => void;
}

export const AdvancedConfigPanel = memo(function AdvancedConfigPanel({
  isOpen,
  subject,
  label,
  presets,
  availableFields,
  currentState,
  onApply,
  onClose,
}: AdvancedConfigPanelProps) {
  // Local state for editing
  const [selectedPreset, setSelectedPreset] = useState<PresetKey | null>(currentState.preset);
  const [customJson, setCustomJson] = useState<string>(
    currentState.customConditions ? JSON.stringify(currentState.customConditions, null, 2) : ''
  );
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isCustomMode, setIsCustomMode] = useState<boolean>(!!currentState.customConditions);
  const [fieldSearchTerm, setFieldSearchTerm] = useState('');

  // Field permissions: null = all allowed, otherwise specify readable/writable lists
  const [fieldPermissions, setFieldPermissions] = useState<FieldPermissionState | null>(currentState.fields);

  // Reset state when panel opens with new subject
  useEffect(() => {
    setSelectedPreset(currentState.preset);
    setCustomJson(
      currentState.customConditions ? JSON.stringify(currentState.customConditions, null, 2) : ''
    );
    setJsonError(null);
    setIsCustomMode(!!currentState.customConditions);
    setFieldPermissions(currentState.fields);
  }, [subject, currentState]);

  const handlePresetSelect = (preset: PresetKey) => {
    setSelectedPreset(preset === selectedPreset ? null : preset);
    setIsCustomMode(false);
    setCustomJson('');
    setJsonError(null);
  };

  const handleEnableCustom = () => {
    setIsCustomMode(!isCustomMode);
    setSelectedPreset(null);
  };

  const handleCustomJsonChange = (value: string) => {
    setCustomJson(value);
    setJsonError(null);

    if (value.trim()) {
      try {
        JSON.parse(value);
      } catch {
        setJsonError('Invalid JSON format');
      }
    }
  };

  const handleApply = () => {
    if (isCustomMode && customJson.trim()) {
      try {
        const parsed = JSON.parse(customJson);
        onApply(null, parsed, fieldPermissions);
      } catch {
        setJsonError('Invalid JSON format');
        return;
      }
    } else {
      onApply(selectedPreset, null, fieldPermissions);
    }
    onClose();
  };

  const handleClear = () => {
    setSelectedPreset(null);
    setCustomJson('');
    setIsCustomMode(false);
    setJsonError(null);
    setFieldPermissions(null);
  };

  // Field permission handlers
  const toggleFieldReadable = (fieldName: string) => {
    setFieldPermissions(prev => {
      const allFields = availableFields.map(f => f.name);
      const current = prev || { readable: allFields, writable: allFields };

      const readable = current.readable.includes(fieldName)
        ? current.readable.filter(f => f !== fieldName)
        : [...current.readable, fieldName];

      const next = { ...current, readable };
      // If all are selected, revert to null
      return next.readable.length === allFields.length && next.writable.length === allFields.length
        ? null
        : next;
    });
  };

  const toggleFieldWritable = (fieldName: string) => {
    setFieldPermissions(prev => {
      const allFields = availableFields.map(f => f.name);
      const current = prev || { readable: allFields, writable: allFields };

      const writable = current.writable.includes(fieldName)
        ? current.writable.filter(f => f !== fieldName)
        : [...current.writable, fieldName];

      const next = { ...current, writable };
      return next.readable.length === allFields.length && next.writable.length === allFields.length
        ? null
        : next;
    });
  };

  const isFieldReadable = (fieldName: string) =>
    fieldPermissions === null || fieldPermissions.readable.includes(fieldName);

  const isFieldWritable = (fieldName: string) =>
    fieldPermissions === null || fieldPermissions.writable.includes(fieldName);

  const filteredFields = useMemo(() => {
    if (!fieldSearchTerm.trim()) return availableFields;
    const term = fieldSearchTerm.toLowerCase();
    return availableFields.filter(f =>
      f.label.toLowerCase().includes(term) || f.name.toLowerCase().includes(term)
    );
  }, [availableFields, fieldSearchTerm]);

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        'fixed right-0 top-0 h-full w-[420px] bg-background border-l shadow-2xl z-[100] flex flex-col',
        'transform transition-transform duration-300 ease-in-out',
        isOpen ? 'translate-x-0' : 'translate-x-full'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b bg-muted/10">
        <div className="space-y-0.5">
          <h3 className="text-base font-bold tracking-tight">Advanced Configuration</h3>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium uppercase tracking-wider">
            <span className="px-1.5 py-0.5 bg-muted rounded">{subject}</span>
            <span>/</span>
            <span className="text-foreground">{label}</span>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8 pb-32">
        {/* Conditions Section (Presets + Custom) */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              <h4 className="text-sm font-bold text-foreground">Rule Conditions</h4>
            </div>
            <Button
              variant="link"
              size="sm"
              className={cn(
                'h-auto p-0 text-[11px] font-bold uppercase tracking-wider',
                isCustomMode ? 'text-primary' : 'text-muted-foreground'
              )}
              onClick={handleEnableCustom}
            >
              {isCustomMode ? 'Switch to Presets' : 'Use Custom JSON'}
            </Button>
          </div>

          {!isCustomMode ? (
            <div className="grid grid-cols-1 gap-2.5 animate-in fade-in duration-200">
              {presets.map((preset) => {
                const IconComponent = PRESET_ICONS[preset.key] || Globe;
                const isSelected = selectedPreset === preset.key;

                return (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => handlePresetSelect(preset.key as PresetKey)}
                    className={cn(
                      'group relative flex items-start gap-4 p-3 rounded-xl border text-left transition-all duration-200',
                      isSelected
                        ? 'border-primary bg-primary/[0.03] shadow-sm'
                        : 'border-border bg-card hover:border-primary/40 hover:bg-muted/30'
                    )}
                  >
                    <div className={cn(
                      'flex-shrink-0 h-9 w-9 rounded-lg flex items-center justify-center transition-colors',
                      isSelected ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground'
                    )}>
                      <IconComponent className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0 pr-6">
                      <p className={cn(
                        'text-sm font-bold transition-colors',
                        isSelected ? 'text-primary' : 'text-foreground'
                      )}>
                        {preset.label}
                      </p>
                      <p className="text-[11px] text-muted-foreground/80 mt-0.5 leading-relaxed">
                        {preset.description}
                      </p>
                    </div>
                    {isSelected && (
                      <div className="absolute top-2.5 right-2.5 h-4 w-4 rounded-full bg-primary flex items-center justify-center">
                        <Check className="h-2.5 w-2.5 text-primary-foreground stroke-[3px]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="relative">
                <textarea
                  value={customJson}
                  onChange={(e) => handleCustomJsonChange(e.target.value)}
                  placeholder='{"creatorId": "${user.id}"}'
                  rows={6}
                  className={cn(
                    'w-full rounded-xl border bg-card px-4 py-3 text-sm font-mono leading-relaxed transition-all shadow-inner',
                    'focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary',
                    jsonError ? 'border-destructive' : 'border-input'
                  )}
                />
              </div>
              {jsonError && (
                <div className="flex items-center gap-2 text-[11px] font-bold text-destructive bg-destructive/5 px-2 py-1 rounded">
                  {jsonError}
                </div>
              )}
              <div className="p-3 bg-muted/30 rounded-lg border border-border/50">
                <p className="text-[11px] font-medium text-muted-foreground leading-relaxed">
                  <span className="font-bold text-primary">TIP:</span> Use <code>{`\${user.id}`}</code> or <code>{`\${user.currentTeamId}`}</code>.
                </p>
              </div>
            </div>
          )}
        </section>

        {/* Field-Level Permissions Section */}
        {availableFields.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                <h4 className="text-sm font-bold text-foreground">Field Permissions</h4>
              </div>
              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-[11px] font-bold text-muted-foreground hover:text-primary"
                      onClick={() => setFieldPermissions(null)}
                    >
                      ALL
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Reset to all allowed</TooltipContent>
                </Tooltip>
                <div className="w-px h-3 bg-border" />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-[11px] font-bold text-muted-foreground hover:text-destructive"
                      onClick={() => setFieldPermissions({ readable: [], writable: [] })}
                    >
                      NONE
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Disable all fields</TooltipContent>
                </Tooltip>
              </div>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search fields..."
                value={fieldSearchTerm}
                onChange={e => setFieldSearchTerm(e.target.value)}
                className="pl-9 h-9 bg-muted/20 border-border/50 text-[13px] rounded-lg"
              />
            </div>

            {/* Field Table */}
            <div className="border rounded-xl bg-card overflow-hidden shadow-sm">
              <div className="flex items-center justify-between bg-muted/20 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 border-b">
                <span className="flex-1">Field Name</span>
                <div className="flex items-center w-[100px]">
                  <span className="w-1/2 text-center">Read</span>
                  <span className="w-1/2 text-center">Write</span>
                </div>
              </div>

              <div className="max-h-[300px] overflow-y-auto custom-scrollbar divide-y divide-border/40">
                {filteredFields.map((field) => {
                  const readable = isFieldReadable(field.name);
                  const writable = isFieldWritable(field.name);

                  return (
                    <div
                      key={field.name}
                      className={cn(
                        'flex items-center justify-between px-4 py-2.5 bg-background hover:bg-muted/10 transition-colors group/row',
                        (readable || writable) && 'bg-primary/[0.01]'
                      )}
                    >
                      <div className="flex-1 min-w-0 pr-4">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "text-[13px] font-medium truncate",
                            (readable || writable) ? "text-foreground" : "text-muted-foreground"
                          )}>
                            {field.label}
                          </span>
                          {field.sensitive && (
                            <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1 py-0.5 rounded-full border border-amber-100">
                              SENSITIVE
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground/60">{field.name}</span>
                      </div>

                      <div className="flex items-center w-[100px]">
                        <div className="w-1/2 flex justify-center">
                          <Checkbox
                            checked={readable}
                            onCheckedChange={() => toggleFieldReadable(field.name)}
                            className="h-3.5 w-3.5 rounded"
                          />
                        </div>
                        <div className="w-1/2 flex justify-center">
                          <Checkbox
                            checked={writable}
                            onCheckedChange={() => toggleFieldWritable(field.name)}
                            className="h-3.5 w-3.5 rounded"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
                {filteredFields.length === 0 && (
                  <div className="py-8 text-center text-muted-foreground text-xs italic">
                    No fields found
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Footer */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-background border-t shadow-sm z-10">
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1 text-xs font-medium"
            onClick={handleClear}
          >
            Reset
          </Button>
          <Button
            variant="outline"
            className="flex-1 text-xs font-medium"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 text-xs font-medium"
            onClick={handleApply}
          >
            Apply
          </Button>
        </div>
      </div>

      {/* Close shortcut hint */}
      <div className="absolute bottom-1 right-3 opacity-20 pointer-events-none">
        <span className="text-[10px] font-medium tracking-tight">ESC TO CLOSE</span>
      </div>
    </div>
  );
});
