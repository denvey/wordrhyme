import React from 'react';
import type { Attribute } from '../hooks/useAttributes';

export interface SelectedAttribute {
    attribute_id: string;
    is_variation: boolean;
    values: string[];
}

interface AttributeSelectorProps {
    attributes: Attribute[];
    selected: SelectedAttribute[];
    onChange: (selected: SelectedAttribute[]) => void;
}

export function AttributeSelector({ attributes, selected, onChange }: AttributeSelectorProps) {
    const isSelected = (attrId: string) => selected.some(s => s.attribute_id === attrId);

    const getSelected = (attrId: string) => selected.find(s => s.attribute_id === attrId);

    const toggleAttribute = (attrId: string) => {
        if (isSelected(attrId)) {
            onChange(selected.filter(s => s.attribute_id !== attrId));
        } else {
            onChange([...selected, { attribute_id: attrId, is_variation: false, values: [] }]);
        }
    };

    const toggleVariation = (attrId: string) => {
        onChange(
            selected.map(s =>
                s.attribute_id === attrId ? { ...s, is_variation: !s.is_variation } : s
            )
        );
    };

    const toggleValue = (attrId: string, value: string) => {
        onChange(
            selected.map(s => {
                if (s.attribute_id !== attrId) return s;
                const values = s.values.includes(value)
                    ? s.values.filter(v => v !== value)
                    : [...s.values, value];
                return { ...s, values };
            })
        );
    };

    if (attributes.length === 0) {
        return (
            <div className="p-4 text-center text-muted-foreground text-sm">
                No attributes defined. Go to Attributes page to create some.
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {attributes.map(attr => {
                const sel = getSelected(attr.id);
                const checked = !!sel;
                return (
                    <div key={attr.id} className="rounded-lg border p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleAttribute(attr.id)}
                                    className="rounded border-input"
                                />
                                <span className="text-sm font-medium">{attr.name}</span>
                                <span className="text-xs text-muted-foreground">({attr.type})</span>
                            </label>
                            {checked && (
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <span className="text-xs text-muted-foreground">Use for variations</span>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={sel?.is_variation}
                                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                                            sel?.is_variation ? 'bg-primary' : 'bg-muted'
                                        }`}
                                        onClick={() => toggleVariation(attr.id)}
                                    >
                                        <span
                                            className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                                                sel?.is_variation ? 'translate-x-4' : 'translate-x-0.5'
                                            }`}
                                        />
                                    </button>
                                </label>
                            )}
                        </div>
                        {checked && attr.values && attr.values.length > 0 && (
                            <div className="flex flex-wrap gap-2 pl-6">
                                {attr.values.map(v => {
                                    const isChecked = sel?.values.includes(v.value);
                                    return (
                                        <label
                                            key={v.id}
                                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs cursor-pointer border transition-colors ${
                                                isChecked
                                                    ? 'bg-primary/10 border-primary text-primary'
                                                    : 'bg-muted/50 border-transparent text-muted-foreground hover:bg-muted'
                                            }`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isChecked}
                                                onChange={() => toggleValue(attr.id, v.value)}
                                                className="sr-only"
                                            />
                                            {v.label || v.value}
                                        </label>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

export default AttributeSelector;
