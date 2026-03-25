import React, { useState } from 'react';
import { PLUGIN_API } from '../api';

interface Variant {
    id: string;
    spu_id: string;
    sku: string;
    name: string;
    price?: string;
    compare_at_price?: string;
    cost_price?: string;
    stock_quantity: number;
    stock_status: string;
    weight?: string;
    attributes: Record<string, string>;
    is_active: boolean;
    created_at: string;
}

interface VariantMatrixProps {
    spuId: string;
    variants: Variant[];
    onRefetch: () => void;
}

export function VariantMatrix({ spuId, variants, onRefetch }: VariantMatrixProps) {
    const [generating, setGenerating] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({ sku: '', price: '', stock_quantity: 0 });

    const handleGenerate = async () => {
        if (!confirm('Generate variants from selected variation attributes? Existing variants will not be affected.')) return;
        setGenerating(true);
        try {
            await fetch(`${PLUGIN_API}.variants.generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ spu_id: spuId }),
            });
            onRefetch();
        } catch (err) {
            console.error('Failed to generate variants:', err);
        } finally {
            setGenerating(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this variant?')) return;
        try {
            await fetch(`${PLUGIN_API}.variants.delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id }),
            });
            onRefetch();
        } catch (err) {
            console.error('Failed to delete variant:', err);
        }
    };

    const startEdit = (variant: Variant) => {
        setEditingId(variant.id);
        setEditForm({
            sku: variant.sku,
            price: variant.price || '',
            stock_quantity: variant.stock_quantity,
        });
    };

    const handleSaveEdit = async () => {
        if (!editingId) return;
        try {
            await fetch(`${PLUGIN_API}.variants.update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: editingId,
                    sku: editForm.sku,
                    price: editForm.price || undefined,
                    stock_quantity: editForm.stock_quantity,
                }),
            });
            setEditingId(null);
            onRefetch();
        } catch (err) {
            console.error('Failed to update variant:', err);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Variants ({variants.length})</h4>
                <button
                    className="inline-flex items-center rounded-md bg-primary text-primary-foreground h-8 px-3 text-xs font-medium disabled:opacity-50"
                    onClick={handleGenerate}
                    disabled={generating}
                >
                    {generating ? 'Generating...' : 'Generate Variants'}
                </button>
            </div>

            {variants.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm rounded-lg border">
                    No variants yet. Select variation attributes and generate variants.
                </div>
            ) : (
                <div className="rounded-lg border">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-muted/50">
                                <th className="text-left p-3 font-medium">SKU</th>
                                <th className="text-left p-3 font-medium">Name</th>
                                <th className="text-left p-3 font-medium">Attributes</th>
                                <th className="text-left p-3 font-medium">Price</th>
                                <th className="text-left p-3 font-medium">Stock</th>
                                <th className="text-left p-3 font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {variants.map(variant => (
                                <tr key={variant.id} className="border-b hover:bg-muted/30">
                                    {editingId === variant.id ? (
                                        <>
                                            <td className="p-3">
                                                <input
                                                    className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs"
                                                    value={editForm.sku}
                                                    onChange={e => setEditForm({ ...editForm, sku: e.target.value })}
                                                />
                                            </td>
                                            <td className="p-3 text-xs text-muted-foreground">{variant.name}</td>
                                            <td className="p-3">
                                                <div className="flex flex-wrap gap-1">
                                                    {Object.entries(variant.attributes).map(([key, val]) => (
                                                        <span key={key} className="text-xs px-1.5 py-0.5 rounded bg-muted">
                                                            {key}: {val}
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="p-3">
                                                <input
                                                    className="h-8 w-20 rounded-md border border-input bg-transparent px-2 text-xs"
                                                    value={editForm.price}
                                                    onChange={e => setEditForm({ ...editForm, price: e.target.value })}
                                                    placeholder="0.00"
                                                />
                                            </td>
                                            <td className="p-3">
                                                <input
                                                    type="number"
                                                    className="h-8 w-16 rounded-md border border-input bg-transparent px-2 text-xs"
                                                    value={editForm.stock_quantity}
                                                    onChange={e => setEditForm({ ...editForm, stock_quantity: parseInt(e.target.value) || 0 })}
                                                />
                                            </td>
                                            <td className="p-3">
                                                <div className="flex gap-1">
                                                    <button
                                                        className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground"
                                                        onClick={handleSaveEdit}
                                                    >
                                                        Save
                                                    </button>
                                                    <button
                                                        className="text-xs px-2 py-1 rounded border"
                                                        onClick={() => setEditingId(null)}
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </td>
                                        </>
                                    ) : (
                                        <>
                                            <td className="p-3 font-mono text-xs">{variant.sku}</td>
                                            <td className="p-3">{variant.name}</td>
                                            <td className="p-3">
                                                <div className="flex flex-wrap gap-1">
                                                    {Object.entries(variant.attributes).map(([key, val]) => (
                                                        <span key={key} className="text-xs px-1.5 py-0.5 rounded bg-muted">
                                                            {key}: {val}
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="p-3">{variant.price || '-'}</td>
                                            <td className="p-3">{variant.stock_quantity}</td>
                                            <td className="p-3">
                                                <div className="flex gap-1">
                                                    <button
                                                        className="text-xs px-2 py-1 rounded hover:bg-muted text-muted-foreground"
                                                        onClick={() => startEdit(variant)}
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        className="text-xs px-2 py-1 rounded hover:bg-destructive/10 text-destructive"
                                                        onClick={() => handleDelete(variant.id)}
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </td>
                                        </>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

export default VariantMatrix;
