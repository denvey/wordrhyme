import type React from 'react';
import { useState, useEffect } from 'react';
import { Camera, X, ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { type ProductImage, addImage, deleteImage, setMainImage, reorderImages } from '../hooks/useProductImages';
import { useMediaPicker } from '@wordrhyme/plugin/react';
import type { PluginMediaInfo } from '@wordrhyme/plugin';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@wordrhyme/ui';

interface ImageGalleryProps {
    images: string[];
    onChange: (images: string[]) => void;
}

export function SmartImage({ src, alt, className, onError }: any) {
    const [signedUrl, setSignedUrl] = useState<string | null>(null);
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        setHasError(false); // Reset error state on src change
        const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(src || '');
        const isPotentialId = src && !src.includes('/') && !src.startsWith('http') && !src.startsWith('data:');

        if (isUUID || isPotentialId) {
            let active = true;
            fetch(`/trpc/media.getSignedUrl?input=${encodeURIComponent(JSON.stringify({ mediaId: src, expiresIn: 86400 }))}`)
                .then(res => res.json())
                .then((data: any) => {
                    if (active && data?.result?.data?.url) {
                        setSignedUrl(data.result.data.url);
                    } else if (active) {
                        setSignedUrl(src);
                    }
                })
                .catch(() => { if (active) setSignedUrl(src) });
            return () => { active = false; };
        } else {
            setSignedUrl(src);
        }
    }, [src]);

    if (!signedUrl) return <div className={`animate-pulse bg-muted ${className}`} />;

    if (hasError) {
        return (
            <div className={`flex items-center justify-center bg-secondary flex-col ${className}`}>
                <span className="text-[10px] text-muted-foreground p-2 text-center opacity-70">
                    Image Unavailable
                </span>
            </div>
        );
    }

    return (
        <img
            src={signedUrl}
            alt={alt}
            className={className}
            onError={(e) => {
                if (onError) onError(e);
                setHasError(true);
            }}
        />
    );
}
export function ImageGallery({ images, onChange }: ImageGalleryProps) {
    const [submitting, setSubmitting] = useState(false);
    const [imageToDelete, setImageToDelete] = useState<number | null>(null);

    // Global Media Picker API (provided by the host app)
    const mediaPicker = useMediaPicker();

    const handleAddMedias = async (selectedMedia: PluginMediaInfo[]) => {
        if (!selectedMedia || selectedMedia.length === 0) return;
        setSubmitting(true);
        const newUrls = selectedMedia.map(m => m.id);
        onChange([...images, ...newUrls]);
        setSubmitting(false);
    };

    const handleOpenPicker = () => {
        mediaPicker.openDialog({
            presentation: 'drawer',
            mode: 'multi',
            onSelect: handleAddMedias
        });
    };

    const executeDelete = (index: number) => {
        onChange(images.filter((_, idx) => idx !== index));
    };

    const handleSetMain = (index: number) => {
        if (index === 0) return;
        const arr = [...images];
        const item = arr.splice(index, 1)[0];
        if (!item) return;
        arr.unshift(item);
        onChange(arr);
    };

    const handleMove = (index: number, direction: 'up' | 'down') => {
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        const arr = [...images];
        if (targetIndex < 0 || targetIndex >= arr.length) return;
        const current = arr[index];
        const target = arr[targetIndex];
        if (!current || !target) return;
        [arr[index], arr[targetIndex]] = [target, current];
        onChange(arr);
    };

    return (
        <div className="space-y-3">

            <div className="flex flex-wrap gap-4">
                {images.map((src, index) => (
                    <div
                        key={index}
                        className={`group relative flex-shrink-0 w-28 h-28 rounded-lg border overflow-hidden border-border bg-muted ${index === 0 ? 'ring-2 ring-primary border-transparent' : ''}`}
                    >
                        <SmartImage
                            src={src}
                            alt="Product Media"
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />

                        {/* Main Image Badge */}
                        {index === 0 && (
                            <div className="absolute bottom-0 left-0 right-0 bg-primary/90 text-primary-foreground text-[10px] text-center font-medium py-0.5">
                                Main Image
                            </div>
                        )}

                        {/* Hover Overlay Controls */}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-1.5">
                            {/* Top row actions */}
                            <div className="flex justify-end">
                                <button
                                    type="button"
                                    className="bg-black/60 text-white hover:bg-destructive hover:text-white p-1 rounded-full transition-colors"
                                    onClick={() => setImageToDelete(index)}
                                    title="Remove"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>

                            {/* Bottom row actions (Reorder & Set Main) */}
                            <div className="flex justify-between items-center px-1 pb-1">
                                <div className="flex gap-1.5">
                                    <button
                                        type="button"
                                        className="text-white hover:text-primary transition-colors disabled:opacity-30 disabled:hover:text-white"
                                        onClick={() => handleMove(index, 'up')}
                                        disabled={index === 0}
                                        title="Move Left"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>
                                    <button
                                        type="button"
                                        className="text-white hover:text-primary transition-colors disabled:opacity-30 disabled:hover:text-white"
                                        onClick={() => handleMove(index, 'down')}
                                        disabled={index === images.length - 1}
                                        title="Move Right"
                                    >
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                                {index !== 0 && (
                                    <button
                                        type="button"
                                        className="text-white hover:text-yellow-400 transition-colors"
                                        onClick={() => handleSetMain(index)}
                                        title="Set as main"
                                    >
                                        <Star className="w-4 h-4 fill-current opacity-70 hover:opacity-100" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ))}

                {/* Add Image Button Block */}
                <button
                    type="button"
                    onClick={handleOpenPicker}
                    disabled={submitting}
                    className="flex-shrink-0 w-28 h-28 border-2 border-dashed border-muted-foreground/30 rounded-lg flex flex-col items-center justify-center text-muted-foreground hover:bg-muted/50 hover:border-muted-foreground/60 hover:text-primary transition-all disabled:opacity-50 cursor-pointer"
                >
                    {submitting ? (
                        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    ) : (
                        <>
                            <Camera className="w-6 h-6 mb-2 opacity-70" />
                            <span className="text-[11px] font-medium opacity-80">Add Image</span>
                        </>
                    )}
                </button>
            </div>
            <p className="text-xs text-muted-foreground">
                已上传 {images.length} 张，点击 ⭐ 设为主图 · 主图将作为封面在商品列表和搜索中展示
            </p>
            <AlertDialog open={imageToDelete !== null} onOpenChange={(open: boolean) => !open && setImageToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>删除此图片？</AlertDialogTitle>
                        <AlertDialogDescription>
                            此操作无法撤销，将永久删除选中的图片。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => {
                                if (imageToDelete !== null) {
                                    executeDelete(imageToDelete);
                                    setImageToDelete(null);
                                }
                            }}
                        >
                            删除
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

export default ImageGallery;
