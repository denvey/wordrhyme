import React, { useState } from 'react';
import { type ProductImage, addImage, deleteImage, setMainImage, reorderImages } from '../hooks/useProductImages';

interface ImageGalleryProps {
    images: ProductImage[];
    spuId: string;
    onRefetch: () => void;
}

export function ImageGallery({ images, spuId, onRefetch }: ImageGalleryProps) {
    const [showAddForm, setShowAddForm] = useState(false);
    const [newUrl, setNewUrl] = useState('');
    const [newAlt, setNewAlt] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const sorted = [...images].sort((a, b) => a.sortOrder - b.sortOrder);

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newUrl.trim()) return;
        setSubmitting(true);
        try {
            const payload: Parameters<typeof addImage>[0] = {
                spuId: spuId,
                src: newUrl,
            };
            if (newAlt) {
                payload.alt = { 'zh-CN': newAlt };
            }
            await addImage(payload);
            setNewUrl('');
            setNewAlt('');
            setShowAddForm(false);
            onRefetch();
        } catch (err) {
            console.error('Failed to add image:', err);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this image?')) return;
        try {
            await deleteImage(id);
            onRefetch();
        } catch (err) {
            console.error('Failed to delete image:', err);
        }
    };

    const handleSetMain = async (imageId: string) => {
        try {
            await setMainImage(spuId, imageId);
            onRefetch();
        } catch (err) {
            console.error('Failed to set main image:', err);
        }
    };

    const handleMove = async (index: number, direction: 'up' | 'down') => {
        const newOrder = [...sorted];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= newOrder.length) return;
        const current = newOrder[index];
        const target = newOrder[targetIndex];
        if (!current || !target) return;
        [newOrder[index], newOrder[targetIndex]] = [target, current];
        try {
            await reorderImages(spuId, newOrder.map(img => img.id));
            onRefetch();
        } catch (err) {
            console.error('Failed to reorder images:', err);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Product Images ({images.length})</h4>
                <button
                    className="inline-flex items-center rounded-md bg-primary text-primary-foreground h-8 px-3 text-xs font-medium"
                    onClick={() => setShowAddForm(!showAddForm)}
                >
                    + Add Image
                </button>
            </div>

            {showAddForm && (
                <form onSubmit={handleAdd} className="rounded-lg border bg-card p-4 space-y-3">
                    <div>
                        <label className="text-sm font-medium">Image URL *</label>
                        <input
                            className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                            value={newUrl}
                            onChange={e => setNewUrl(e.target.value)}
                            placeholder="https://example.com/image.jpg"
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium">Alt Text</label>
                        <input
                            className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                            value={newAlt}
                            onChange={e => setNewAlt(e.target.value)}
                            placeholder="Image description"
                        />
                    </div>
                    <div className="flex gap-2 justify-end">
                        <button
                            type="button"
                            className="h-8 px-3 rounded-md border text-xs"
                            onClick={() => setShowAddForm(false)}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50"
                            disabled={submitting}
                        >
                            {submitting ? 'Adding...' : 'Add'}
                        </button>
                    </div>
                </form>
            )}

            {sorted.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm rounded-lg border">
                    No images yet. Add your first image.
                </div>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {sorted.map((img, index) => (
                        <div key={img.id} className="rounded-lg border overflow-hidden group relative">
                            <div className="aspect-square bg-muted relative">
                                <img
                                    src={img.src}
                                    alt={img.alt?.['zh-CN'] || img.alt?.['en-US'] || 'Product image'}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                />
                                {img.isMain && (
                                    <span className="absolute top-2 left-2 text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 font-medium">
                                        Main
                                    </span>
                                )}
                            </div>
                            <div className="p-2 flex items-center justify-between">
                                <div className="flex gap-1">
                                    <button
                                        className="text-xs px-1.5 py-1 rounded hover:bg-muted text-muted-foreground disabled:opacity-30"
                                        onClick={() => handleMove(index, 'up')}
                                        disabled={index === 0}
                                        title="Move up"
                                    >
                                        ↑
                                    </button>
                                    <button
                                        className="text-xs px-1.5 py-1 rounded hover:bg-muted text-muted-foreground disabled:opacity-30"
                                        onClick={() => handleMove(index, 'down')}
                                        disabled={index === sorted.length - 1}
                                        title="Move down"
                                    >
                                        ↓
                                    </button>
                                    {!img.isMain && (
                                        <button
                                            className="text-xs px-2 py-1 rounded hover:bg-yellow-100 dark:hover:bg-yellow-900 text-muted-foreground"
                                            onClick={() => handleSetMain(img.id)}
                                            title="Set as main"
                                        >
                                            ★
                                        </button>
                                    )}
                                </div>
                                <button
                                    className="text-xs px-2 py-1 rounded hover:bg-destructive/10 text-destructive"
                                    onClick={() => handleDelete(img.id)}
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default ImageGallery;
