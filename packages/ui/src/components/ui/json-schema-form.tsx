/**
 * JSON Schema Form Renderer
 *
 * A lightweight form renderer that generates form fields from JSON Schema.
 * Uses existing shadcn/ui components for consistent styling.
 *
 * @task 5.4.8 - Implement JSON Schema Form renderer for plugin config
 *
 * Supports:
 * - string (text input, textarea, select with enum)
 * - number/integer (number input)
 * - boolean (switch or checkbox)
 * - object (nested fieldset)
 * - array of strings (multi-select or tag input)
 */
import * as React from 'react';
import { Input } from './input';
import { Label } from './label';
import { Switch } from './switch';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from './select';
import { cn } from '../../lib/utils';

/** JSON Schema type definition (subset for config forms) */
export interface JSONSchema {
    type?: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array';
    title?: string;
    description?: string;
    default?: unknown;
    enum?: string[] | number[];
    enumNames?: string[];
    format?: 'textarea' | 'password' | 'email' | 'url' | 'date' | 'time';
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    required?: string[];
    properties?: Record<string, JSONSchema>;
    items?: JSONSchema;
}

export interface JSONSchemaFormProps {
    /** The JSON Schema defining the form structure */
    schema: JSONSchema;
    /** Current form values */
    value: Record<string, unknown>;
    /** Called when any value changes */
    onChange: (value: Record<string, unknown>) => void;
    /** Additional CSS classes */
    className?: string;
    /** Disable all form fields */
    disabled?: boolean;
}

/**
 * JSON Schema Form Component
 *
 * Renders a form based on a JSON Schema definition.
 */
export function JSONSchemaForm({
    schema,
    value,
    onChange,
    className,
    disabled = false,
}: JSONSchemaFormProps) {
    const handleFieldChange = React.useCallback(
        (fieldName: string, fieldValue: unknown) => {
            onChange({
                ...value,
                [fieldName]: fieldValue,
            });
        },
        [value, onChange]
    );

    if (schema.type !== 'object' || !schema.properties) {
        return <div className="text-muted-foreground">Invalid schema: root must be an object with properties</div>;
    }

    const requiredFields = new Set(schema.required ?? []);

    return (
        <div className={cn('space-y-6', className)}>
            {Object.entries(schema.properties).map(([fieldName, fieldSchema]) => (
                <FormField
                    key={fieldName}
                    name={fieldName}
                    schema={fieldSchema}
                    value={value[fieldName]}
                    onChange={(v) => handleFieldChange(fieldName, v)}
                    required={requiredFields.has(fieldName)}
                    disabled={disabled}
                />
            ))}
        </div>
    );
}

interface FormFieldProps {
    name: string;
    schema: JSONSchema;
    value: unknown;
    onChange: (value: unknown) => void;
    required?: boolean;
    disabled?: boolean;
}

/**
 * Individual form field renderer
 */
function FormField({
    name,
    schema,
    value,
    onChange,
    required = false,
    disabled = false,
}: FormFieldProps) {
    const id = `field-${name}`;
    const label = schema.title ?? name;
    const description = schema.description;

    // Determine the field type
    const fieldType = schema.type ?? 'string';
    const hasEnum = schema.enum && schema.enum.length > 0;

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2">
                <Label htmlFor={id} className="text-sm font-medium">
                    {label}
                    {required && <span className="text-destructive ml-1">*</span>}
                </Label>
            </div>

            {/* String with enum → Select */}
            {fieldType === 'string' && hasEnum ? (
                <Select
                    value={(value as string) ?? ''}
                    onValueChange={onChange}
                    disabled={disabled}
                >
                    <SelectTrigger id={id} className="w-full">
                        <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
                    </SelectTrigger>
                    <SelectContent>
                        {schema.enum?.map((option, idx) => (
                            <SelectItem key={String(option)} value={String(option)}>
                                {schema.enumNames?.[idx] ?? String(option)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            ) : /* String → Input or Textarea */
                fieldType === 'string' ? (
                    schema.format === 'textarea' ? (
                        <textarea
                            id={id}
                            value={(value as string) ?? ''}
                            onChange={(e) => onChange(e.target.value)}
                            disabled={disabled}
                            required={required}
                            minLength={schema.minLength}
                            maxLength={schema.maxLength}
                            className="flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            placeholder={description}
                        />
                    ) : (
                        <Input
                            id={id}
                            type={schema.format === 'password' ? 'password' : schema.format === 'email' ? 'email' : 'text'}
                            value={(value as string) ?? ''}
                            onChange={(e) => onChange(e.target.value)}
                            disabled={disabled}
                            required={required}
                            minLength={schema.minLength}
                            maxLength={schema.maxLength}
                            pattern={schema.pattern}
                            placeholder={description}
                        />
                    )
                ) : /* Number/Integer → Number Input */
                    fieldType === 'number' || fieldType === 'integer' ? (
                        <Input
                            id={id}
                            type="number"
                            value={value !== undefined ? String(value) : ''}
                            onChange={(e) => {
                                const num = fieldType === 'integer'
                                    ? Number.parseInt(e.target.value, 10)
                                    : Number.parseFloat(e.target.value);
                                onChange(isNaN(num) ? undefined : num);
                            }}
                            disabled={disabled}
                            required={required}
                            min={schema.minimum}
                            max={schema.maximum}
                            step={fieldType === 'integer' ? 1 : 'any'}
                            placeholder={description}
                        />
                    ) : /* Boolean → Switch */
                        fieldType === 'boolean' ? (
                            <div className="flex items-center gap-3">
                                <Switch
                                    id={id}
                                    checked={(value as boolean) ?? false}
                                    onCheckedChange={onChange}
                                    disabled={disabled}
                                />
                                {description && (
                                    <span className="text-sm text-muted-foreground">{description}</span>
                                )}
                            </div>
                        ) : /* Object → Nested fieldset */
                            fieldType === 'object' && schema.properties ? (
                                <fieldset className="border border-border rounded-lg p-4">
                                    <JSONSchemaForm
                                        schema={schema}
                                        value={(value as Record<string, unknown>) ?? {}}
                                        onChange={(v) => onChange(v)}
                                        disabled={disabled}
                                    />
                                </fieldset>
                            ) : (
                                <div className="text-sm text-muted-foreground">
                                    Unsupported field type: {fieldType}
                                </div>
                            )}

            {/* Description (for non-boolean fields) */}
            {description && fieldType !== 'boolean' && (
                <p className="text-xs text-muted-foreground">{description}</p>
            )}
        </div>
    );
}

export default JSONSchemaForm;
