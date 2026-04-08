import React, { useState, useCallback, useRef } from 'react';
import { 
    Search, ChevronRight, ChevronLeft, MoreHorizontal, Upload, X, Trash2,
    ImageIcon, FileText, Music, Film, File, Archive, HardDrive, Cloud, File as FileIcon 
} from 'lucide-react';
import {
    Button, Input, Checkbox, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@wordrhyme/ui';
import { toast } from 'sonner';
import { trpc } from '../../lib/trpc';
import type { PluginMediaInfo } from '@wordrhyme/plugin';

export type MimeCategory = 'all' | 'image' | 'document' | 'video' | 'audio' | 'archive' | 'other';

export const MIME_CATEGORIES: Record<MimeCategory, { label: string; icon: any; patterns: string[] }> = {
    all: { label: 'All', icon: FileIcon, patterns: [] },
    image: { label: 'Images', icon: ImageIcon, patterns: ['image/'] },
    video: { label: 'Videos', icon: Film, patterns: ['video/'] },
    audio: { label: 'Audio', icon: Music, patterns: ['audio/'] },
    document: { label: 'Documents', icon: FileText, patterns: ['application/pdf', 'application/msword', 'application/vnd.', 'text/'] },
    archive: { label: 'Archives', icon: Archive, patterns: ['application/zip', 'application/x-rar', 'application/gzip', 'application/x-tar'] },
    other: { label: 'Other', icon: FileIcon, patterns: [] },
};

export function getCategoryFromMime(mimeType: string): MimeCategory {
    for (const [category, config] of Object.entries(MIME_CATEGORIES)) {
        if (category === 'all' || category === 'other') continue;
        if (config.patterns.some(p => mimeType.startsWith(p) || mimeType === p)) {
            return category as MimeCategory;
        }
    }
    return 'other';
}

export function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export interface MediaBrowserProps {
    mode: 'manage' | 'picker';
    options?: {
        mode?: 'single' | 'multi';
        onSelect?: (media: PluginMediaInfo[]) => void;
    };
    onClose?: () => void;
}

export function MediaBrowser({ mode, options, onClose }: MediaBrowserProps) {
    const isMulti = options?.mode === 'multi';
    const isPicker = mode === 'picker';
    
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [selectedMedia, setSelectedMedia] = useState<Map<string, PluginMediaInfo>>(new Map());
    const [activeFolder, setActiveFolder] = useState<MimeCategory>('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [uploadDialogOpen, setUploadDialogOpen] = useState(false);

    const utils = trpc.useUtils();

    // Query mapping `activeFolder` as a categoryFilter to match the exact trpc expectation
    const backendCategory = (activeFolder !== 'all' && activeFolder !== 'other') ? activeFolder : undefined;
    
    const listQuery = {
        page: currentPage,
        pageSize: 15,
        sortBy: 'createdAt' as const,
        sortOrder: 'desc' as const,
        search: searchQuery || undefined,
        category: backendCategory, 
    };

    const { data: mediaData, isLoading } = trpc.media.list.useQuery(listQuery, {
        keepPreviousData: true,
    });
    
    const items = (mediaData?.items ?? []) as unknown as PluginMediaInfo[];
    const totalPages = mediaData?.totalPages ?? 1;

    // Mutations
    const bulkDeleteMedia = trpc.media.bulkDelete.useMutation({
        onSuccess: (data: { successful: number; failed: number }) => {
            toast.success(`Deleted ${data.successful} item(s)`);
            setSelectedIds(new Set());
            setSelectedMedia(new Map());
            utils.media.list.invalidate();
        },
        onError: (error: { message?: string }) => {
            toast.error(error.message || 'Bulk delete failed');
        },
    });

    const toggleSelect = (item: PluginMediaInfo) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            const nextMedia = new Map(selectedMedia);
            
            if (next.has(item.id)) {
                next.delete(item.id);
                nextMedia.delete(item.id);
            } else {
                if (isPicker && !isMulti) {
                    next.clear();
                    nextMedia.clear();
                }
                next.add(item.id);
                nextMedia.set(item.id, item);
            }
            setSelectedMedia(nextMedia);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === items.length && items.length > 0) {
            setSelectedIds(new Set());
            setSelectedMedia(new Map());
        } else {
            const next = new Set<string>();
            const nextMedia = new Map<string, PluginMediaInfo>();
            items.forEach(item => {
                next.add(item.id);
                nextMedia.set(item.id, item);
            });
            setSelectedIds(next);
            setSelectedMedia(nextMedia);
        }
    };

    const handleConfirm = () => {
        if (!options?.onSelect) return;
        const result = Array.from(selectedMedia.values());
        if (result.length === 0) {
            toast.error('请选择图片');
            return;
        }

        options.onSelect(result);
        if (onClose) onClose();
        
        setSelectedIds(new Set());
        setSelectedMedia(new Map());
    };

    const handleDelete = () => {
        if (selectedIds.size === 0) return;
        if (!confirm(`Are you sure you want to delete ${selectedIds.size} item(s)?`)) return;
        bulkDeleteMedia.mutate(Array.from(selectedIds));
    };

    // Dummy Folders corresponding to the screenshot layout mapped to MimeCategories
    const folders = [
        { id: 'all', name: '全部图片', level: 0, category: 'all' as MimeCategory },
        { id: 'image', name: '图片素材', level: 1, hasChildren: false, category: 'image' as MimeCategory },
        { id: 'video', name: '视频素材', level: 0, category: 'video' as MimeCategory },
        { id: 'document', name: '文档下载', level: 0, category: 'document' as MimeCategory },
    ];

    return (
        <div className="flex flex-col h-full bg-background rounded-lg overflow-hidden">
            {/* Conditional Header for Picker Dialog/Drawer */}
            {(isPicker && onClose) && (
                <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
                    <h2 className="text-lg font-medium text-foreground">选择素材</h2>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                        <X className="w-5 h-5" />
                    </button>
                </div>
            )}

            <div className="flex flex-1 min-h-0 bg-background">
                {/* Left Sidebar */}
                <div className="w-56 border-r border-border flex flex-col pt-2 shrink-0 overflow-y-auto bg-muted/10">
                    <div className="px-4 py-2 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider mb-1">
                        归档
                    </div>
                    {folders.map(folder => {
                        const isActive = activeFolder === folder.category;
                        const isAll = folder.category === 'all';
                        const Icon = MIME_CATEGORIES[folder.category].icon;
                        return (
                            <div 
                                key={folder.id} 
                                className={`flex items-center justify-between px-4 py-2.5 mx-2 mb-0.5 rounded-md cursor-pointer text-sm transition-colors ${
                                    isActive ? 'bg-background shadow-sm border border-border text-foreground font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent'
                                }`}
                                style={{ paddingLeft: folder.level > 0 ? '2rem' : '1rem' }}
                                onClick={() => {
                                    setActiveFolder(folder.category);
                                    setCurrentPage(1);
                                    setSelectedIds(new Set());
                                    setSelectedMedia(new Map());
                                }}
                            >
                                <div className="flex items-center gap-2.5">
                                    <Icon className={`w-4 h-4 ${isActive && !isAll ? 'text-primary' : 'opacity-70'}`} />
                                    <span>{folder.name}</span>
                                </div>
                                <span className="text-xs opacity-50">{isActive ? '' : folder.level > 0 ? '' : '...'}</span>
                            </div>
                        );
                    })}
                </div>

                {/* Right Main Content */}
                <div className="flex-1 flex flex-col min-w-0">
                    {/* Action Bar */}
                    <div className="p-4 flex items-center justify-between gap-4 border-b border-border bg-background">
                        {/* Left: Search (User prioritized) */}
                        <div className="relative shrink-0 flex-1 max-w-[280px]">
                            <Input
                                placeholder="请输入名称搜索"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 h-9 w-full rounded shadow-none border-border bg-muted/30 focus-visible:bg-background transition-colors"
                            />
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        </div>

                        {/* Right: Contextual Buttons */}
                        <div className="flex items-center gap-2">
                            {selectedIds.size > 0 ? (
                                <div className="flex items-center gap-3 animate-in fade-in slide-in-from-right-4 duration-200">
                                    <span className="text-sm font-medium text-muted-foreground pr-2">
                                        已选中 <span className="text-foreground">{selectedIds.size}</span> 项
                                    </span>
                                    <Select>
                                        <SelectTrigger className="w-32 h-9 bg-background text-foreground border-border rounded shadow-none">
                                            <SelectValue placeholder="移动至..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">暂无分类</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <Button 
                                        variant="destructive"
                                        className="h-9 px-4 rounded font-normal shadow-sm gap-1.5"
                                        onClick={handleDelete}
                                        disabled={bulkDeleteMedia.isLoading}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                        {bulkDeleteMedia.isLoading ? '删除中...' : '删除'}
                                    </Button>
                                </div>
                            ) : (
                                <Button variant="default" className="h-9 px-4 rounded font-medium shadow-sm gap-1.5 animate-in fade-in ease-out" onClick={() => setUploadDialogOpen(true)}>
                                    <Upload className="w-4 h-4" />
                                    上传素材
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Grid */}
                    <div className="flex-1 overflow-y-auto px-6 py-4">
                        {isLoading ? (
                            <div className="flex justify-center items-center h-48">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                            </div>
                        ) : items.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm">
                                <ImageIcon className="h-10 w-10 mb-2 opacity-30" />
                                <p>没有找到相关素材</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-4 gap-y-6">
                                {items.map((item) => {
                                    const isSelected = selectedIds.has(item.id);
                                    return (
                                        <div
                                            key={item.id}
                                            className="group cursor-pointer flex flex-col border border-transparent hover:border-border rounded overflow-hidden hover:shadow-sm transition-all duration-200"
                                            onClick={() => toggleSelect(item)}
                                            title={item.title || item.filename}
                                        >
                                            <div className="relative aspect-square bg-muted/20 overflow-hidden border border-border/80 group-hover:border-primary/50 transition-colors rounded-sm">
                                                <ThumbnailPreview item={item} />
                                                
                                                {/* Checkbox Overlay Top Left */}
                                                <div 
                                                    className={`absolute top-2 left-2 z-10 transition-opacity duration-200 shadow-sm ${
                                                        isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                                                    }`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleSelect(item);
                                                    }}
                                                >
                                                    <div className={`w-4 h-4 rounded-[3px] border bg-background flex items-center justify-center ${isSelected ? 'border-primary bg-primary' : 'border-input hover:border-primary/50'}`}>
                                                        {isSelected && <svg className="w-2.5 h-2.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                                    </div>
                                                </div>
                                            </div>
                                            {/* Filename underneath */}
                                            <div className="mt-2 text-center text-xs text-muted-foreground group-hover:text-foreground truncate px-1 transition-colors">
                                                {item.title || item.filename}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Pagination Footer */}
                    <div className="p-4 flex items-center justify-between border-t border-border text-sm text-foreground shrink-0 gap-4 bg-muted/10">
                        {/* 1. Left (Select All) */}
                        <div className="flex items-center gap-3 shrink-0 min-w-[100px]">
                            <label className="flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground transition-colors group">
                                <Checkbox 
                                    className="h-4 w-4 rounded-[3px] border-input data-[state=checked]:bg-primary data-[state=checked]:border-primary" 
                                    checked={selectedIds.size === items.length && items.length > 0} 
                                    onCheckedChange={toggleSelectAll} 
                                />
                                <span className="group-hover:underline underline-offset-2">本页全选</span>
                            </label>
                        </div>
                        
                        {/* 2. Center (Pagination - Absolute positioning on larger screens or flex-1) */}
                        <div className="flex-1 flex justify-center items-center gap-1.5 overflow-x-auto hide-scrollbar">
                            <Button 
                                variant="outline" 
                                className="h-8 w-8 p-0 border-border bg-background text-muted-foreground disabled:opacity-50 font-normal rounded-md shadow-sm"
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            
                            <div className="flex items-center gap-1.5 px-2">
                                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => i + 1).map(num => (
                                    <Button 
                                        key={num}
                                        variant={currentPage === num ? 'default' : 'outline'}
                                        className={`h-8 w-8 p-0 font-normal rounded-md shadow-sm ${
                                            currentPage !== num ? 'border-border bg-background text-foreground hover:bg-muted' : ''
                                        }`}
                                        onClick={() => setCurrentPage(num)}
                                    >
                                        {num}
                                    </Button>
                                ))}
                                {totalPages > 5 && (
                                    <>
                                        <div className="flex items-center justify-center w-6 h-8 text-muted-foreground">...</div>
                                        <Button 
                                            variant="outline" 
                                            className="h-8 w-8 p-0 border-border bg-background text-foreground font-normal rounded-md shadow-sm hover:bg-muted"
                                            onClick={() => setCurrentPage(totalPages)}
                                        >
                                            {totalPages}
                                        </Button>
                                    </>
                                )}
                            </div>

                            <Button 
                                variant="outline" 
                                className="h-8 w-8 p-0 border-border bg-background text-muted-foreground disabled:opacity-50 font-normal rounded-md shadow-sm"
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>

                        {/* 3. Right (Confirm Actions) */}
                        <div className="flex items-center justify-end shrink-0 min-w-[100px]">
                            {isPicker && (
                                <div className="flex items-center gap-3">
                                    <Button 
                                        variant="outline" 
                                        className="h-9 px-4 font-normal shadow-none bg-background rounded-md"
                                        onClick={onClose}
                                    >
                                        取消
                                    </Button>
                                    <Button 
                                        variant="default"
                                        className="h-9 px-6 font-medium shadow-sm rounded-md transition-all active:scale-95"
                                        onClick={handleConfirm}
                                        disabled={selectedIds.size === 0}
                                    >
                                        确认使用 {selectedIds.size > 0 && `(${selectedIds.size})`}
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <InlineUploadDialog 
                open={uploadDialogOpen} 
                onOpenChange={setUploadDialogOpen} 
                onSuccess={() => utils.media.list.invalidate()} 
            />
        </div>
    );
}

function ThumbnailPreview({ item }: { item: PluginMediaInfo }) {
    // If it's not an image, show a generic icon 
    const isImage = item.mimeType?.startsWith('image/');

    const { data } = trpc.media.getSignedUrl.useQuery(
        { mediaId: item.id, expiresIn: 300 },
        { enabled: isImage }
    );
    
    if (!isImage) {
        const Icon = MIME_CATEGORIES[getCategoryFromMime(item.mimeType || 'other')].icon;
        return <div className="w-full h-full flex flex-col items-center justify-center bg-muted text-muted-foreground p-4">
            <Icon className="w-12 h-12 mb-2 opacity-50" />
            <span className="text-[10px] break-all text-center">{item.mimeType?.split('/')[1] || 'FILE'}</span>
        </div>;
    }

    if (!data?.url) return null;
    return (
        <img
            src={data.url}
            alt={item.title || item.filename}
            className="w-full h-full object-contain"
        />
    );
}

// Minimal port of the explicit InlineUploadDialog internally
function InlineUploadDialog({
    open,
    onOpenChange,
    onSuccess,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}) {
    const [files, setFiles] = useState<File[]>([]);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [selectedProviderId, setSelectedProviderId] = useState<string>('local');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const getUploadUrl = trpc.media.getUploadUrl.useMutation();
    const confirmUpload = trpc.media.confirmUpload.useMutation();
    const { data: providers } = trpc.storage.listProviders.useQuery();
    const availableProviders = providers?.filter(
        (p: { status: string }) => p.status === 'ready' || p.status === 'healthy'
    ) ?? [];

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const droppedFiles = Array.from(e.dataTransfer.files);
        setFiles(prev => [...prev, ...droppedFiles]);
    }, []);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = Array.from(e.target.files || []);
        setFiles(prev => [...prev, ...selectedFiles]);
    };

    const removeFile = (index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleUpload = async () => {
        if (files.length === 0) return;
        setUploading(true);
        setProgress(0);

        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                if (!file) continue;

                const { uploadUrl, mediaId } = await getUploadUrl.mutateAsync({
                    filename: file.name,
                    contentType: file.type,
                    providerId: selectedProviderId,
                });

                await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
                await confirmUpload.mutateAsync({ mediaId, fileSize: file.size });
                setProgress(((i + 1) / files.length) * 100);
            }
            toast.success(`${files.length} 个文件上传成功`);
            setFiles([]);
            onSuccess();
            onOpenChange(false);
        } catch {
            toast.error('文件上传失败');
        } finally {
            setUploading(false);
            setProgress(0);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>上传图片/文件</DialogTitle>
                    <DialogDescription>将文件拖拽到下方或点击选择</DialogDescription>
                </DialogHeader>

                {availableProviders.length > 1 && (
                    <div className="flex items-center gap-3">
                        <label className="text-sm font-medium whitespace-nowrap">存储介质:</label>
                        <Select value={selectedProviderId} onValueChange={setSelectedProviderId}>
                            <SelectTrigger className="flex-1">
                                <SelectValue placeholder="Select storage" />
                            </SelectTrigger>
                            <SelectContent>
                                {availableProviders.map((provider: { providerId: string; displayName: string }) => (
                                    <SelectItem key={provider.providerId} value={provider.providerId}>
                                        <div className="flex items-center gap-2">
                                            {provider.providerId === 'local' ? <HardDrive className="h-4 w-4" /> : <Cloud className="h-4 w-4" />}
                                            {provider.displayName}
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}

                <div
                    className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary transition-colors cursor-pointer"
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <Upload className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">点此或拖拽文件到这里上传</p>
                    <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
                </div>

                {files.length > 0 && (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                        {files.map((file, index) => {
                            const Icon = MIME_CATEGORIES[getCategoryFromMime(file.type)].icon;
                            return (
                                <div key={index} className="flex items-center gap-3 p-2 bg-muted/50 rounded-md border border-border">
                                    <Icon className="h-8 w-8 text-primary shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{file.name}</p>
                                        <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                                    </div>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeFile(index)} disabled={uploading}>
                                        <X className="h-4 w-4 text-muted-foreground" />
                                    </Button>
                                </div>
                            );
                        })}
                    </div>
                )}

                {uploading && (
                    <div className="space-y-2">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                            <div className="h-full bg-primary transition-all duration-300 ease-in-out" style={{ width: `${progress}%` }} />
                        </div>
                        <p className="text-xs text-center text-muted-foreground">上传中 {Math.round(progress)}%</p>
                    </div>
                )}

                <div className="flex justify-end gap-2 pt-4">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>取消</Button>
                    <Button onClick={handleUpload} disabled={files.length === 0 || uploading}>{uploading ? '处理中...' : '开始上传'}</Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
