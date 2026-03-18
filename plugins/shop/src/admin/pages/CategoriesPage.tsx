import React, { useState } from 'react';
import { useCategories, createCategory, updateCategory, deleteCategory, moveCategory, type Category } from '../hooks/useCategories';
import { CategoryTreeView } from '../components/CategoryTreeView';

export function CategoriesPage() {
    const { items, loading, refetch } = useCategories();
    const [showDialog, setShowDialog] = useState(false);
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);

    const openCreate = () => {
        setEditingCategory(null);
        setShowDialog(true);
    };

    const handleEdit = (category: Category) => {
        setEditingCategory(category);
        setShowDialog(true);
    };

    const handleDelete = async (category: Category) => {
        const children = items.filter(c => c.parent_id === category.id);
        if (children.length > 0) {
            alert('Cannot delete a category with subcategories. Delete or move subcategories first.');
            return;
        }
        if (!confirm(`Delete category "${category.name}"?`)) return;
        try {
            await deleteCategory(category.id);
            refetch();
        } catch (err) {
            console.error('Failed to delete:', err);
        }
    };

    const handleMove = async (category: Category, direction: 'up' | 'down') => {
        const siblings = items
            .filter(c => (c.parent_id ?? null) === (category.parent_id ?? null))
            .sort((a, b) => a.sort_order - b.sort_order);
        const index = siblings.findIndex(c => c.id === category.id);
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= siblings.length) return;

        try {
            await moveCategory(category.id, category.parent_id ?? null, siblings[targetIndex].sort_order);
            refetch();
        } catch (err) {
            console.error('Failed to move:', err);
        }
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Categories</h1>
                    <p className="text-muted-foreground text-sm">Organize products into categories</p>
                </div>
                <button
                    className="inline-flex items-center rounded-md bg-primary text-primary-foreground h-9 px-4 text-sm font-medium"
                    onClick={openCreate}
                >
                    + Add Category
                </button>
            </div>

            {/* Dialog */}
            {showDialog && (
                <CategoryDialog
                    category={editingCategory}
                    categories={items}
                    onSaved={() => { setShowDialog(false); refetch(); }}
                    onCancel={() => setShowDialog(false)}
                />
            )}

            {/* Category Tree */}
            {loading ? (
                <div className="p-8 text-center text-muted-foreground">Loading...</div>
            ) : (
                <CategoryTreeView
                    categories={items}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onMove={handleMove}
                />
            )}
        </div>
    );
}

function CategoryDialog({ category, categories, onSaved, onCancel }: {
    category: Category | null;
    categories: Category[];
    onSaved: () => void;
    onCancel: () => void;
}) {
    const isEdit = !!category;
    const [form, setForm] = useState({
        name: category?.name || '',
        slug: category?.slug || '',
        description: category?.description || '',
        parent_id: category?.parent_id || '',
        is_active: category?.is_active ?? true,
        image_url: category?.image_url || '',
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    // Filter out self and descendants for parent options
    const getDescendantIds = (id: string): string[] => {
        const children = categories.filter(c => c.parent_id === id);
        return [id, ...children.flatMap(c => getDescendantIds(c.id))];
    };
    const excludeIds = isEdit ? getDescendantIds(category!.id) : [];
    const parentOptions = categories.filter(c => !excludeIds.includes(c.id));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.name) {
            setError('Name is required');
            return;
        }
        setSubmitting(true);
        setError('');
        try {
            const payload = {
                ...form,
                parent_id: form.parent_id || null,
                image_url: form.image_url || undefined,
                description: form.description || undefined,
            };
            if (isEdit) {
                await updateCategory(category!.id, payload);
            } else {
                const data = await createCategory(payload);
                if (data.error) {
                    setError(data.error.message || 'Failed to create');
                    setSubmitting(false);
                    return;
                }
            }
            onSaved();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <form onSubmit={handleSubmit} className="rounded-lg border bg-card p-6 space-y-4 w-full max-w-md shadow-lg">
                <h3 className="font-semibold text-lg">{isEdit ? 'Edit Category' : 'New Category'}</h3>
                {error && <div className="p-3 rounded bg-destructive/10 text-destructive text-sm">{error}</div>}
                <div className="space-y-4">
                    <div>
                        <label className="text-sm font-medium">Name *</label>
                        <input
                            className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                            value={form.name}
                            onChange={e => setForm({ ...form, name: e.target.value })}
                            placeholder="Category name"
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium">Slug</label>
                        <input
                            className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                            value={form.slug}
                            onChange={e => setForm({ ...form, slug: e.target.value })}
                            placeholder="Auto-generated if empty"
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium">Parent Category</label>
                        <select
                            className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                            value={form.parent_id}
                            onChange={e => setForm({ ...form, parent_id: e.target.value })}
                        >
                            <option value="">None (Top Level)</option>
                            {parentOptions.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-sm font-medium">Description</label>
                        <textarea
                            className="mt-1 flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                            value={form.description}
                            onChange={e => setForm({ ...form, description: e.target.value })}
                            rows={2}
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium">Image URL</label>
                        <input
                            className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                            value={form.image_url}
                            onChange={e => setForm({ ...form, image_url: e.target.value })}
                            placeholder="https://..."
                        />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={form.is_active}
                            onChange={e => setForm({ ...form, is_active: e.target.checked })}
                            className="rounded border-input"
                        />
                        <span className="text-sm">Active</span>
                    </label>
                </div>
                <div className="flex gap-2 justify-end">
                    <button type="button" className="h-9 px-4 rounded-md border text-sm" onClick={onCancel}>
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
                        disabled={submitting}
                    >
                        {submitting ? 'Saving...' : isEdit ? 'Update' : 'Create'}
                    </button>
                </div>
            </form>
        </div>
    );
}

export default CategoriesPage;
