/**
 * Media Library Page
 *
 * Unified media management interface, replacing Files + Assets pages.
 * Supports grid/list view, drag-and-drop upload, search/filter, batch operations,
 * variant display, and metadata editing via slide-out sheet.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import {
    ImageIcon,
    Upload,
    Search,
    MoreHorizontal,
    Trash2,
    Download,
    Link,
    Eye,
    Edit,
    ChevronLeft,
    ChevronRight,
    Image,
    FileText,
    Film,
    Music,
    Archive,
    File,
    X,
    RefreshCw,
    Cloud,
    HardDrive,
    Grid3X3,
    List,
    FolderOpen,
    Tag,
    Check,
    Minus,
} from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    Input,
    Badge,
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Label,
    Tabs,
    TabsList,
    TabsTrigger,
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    Separator,
} from '@wordrhyme/ui';
import { toast } from 'sonner';
import { trpc } from '../lib/trpc';

// ============================================================
// Types
// ============================================================

interface MediaInfo {
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    isPublic: boolean;
    storageKey: string;
    storageProvider: string;
    storageBucket: string | null;
    parentId: string | null;
    variantName: string | null;
    width: number | null;
    height: number | null;
    format: string | null;
    alt: string | null;
    title: string | null;
    tags: string[] | null;
    folderPath: string | null;
    metadata: Record<string, unknown> | null;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
}

interface VariantInfo {
    id: string;
    variantName: string;
    filename: string;
    mimeType: string;
    size: number;
    width: number | null;
    height: number | null;
    format: string | null;
}

type MimeCategory = 'all' | 'image' | 'document' | 'video' | 'audio' | 'archive' | 'other';

// ============================================================
// Constants
// ============================================================

const MIME_CATEGORIES: Record<MimeCategory, { label: string; icon: typeof File; patterns: string[] }> = {
    all: { label: 'All', icon: File, patterns: [] },
    image: { label: 'Images', icon: Image, patterns: ['image/'] },
    video: { label: 'Videos', icon: Film, patterns: ['video/'] },
    audio: { label: 'Audio', icon: Music, patterns: ['audio/'] },
    document: { label: 'Documents', icon: FileText, patterns: ['application/pdf', 'application/msword', 'application/vnd.', 'text/'] },
    archive: { label: 'Archives', icon: Archive, patterns: ['application/zip', 'application/x-rar', 'application/gzip', 'application/x-tar'] },
    other: { label: 'Other', icon: File, patterns: [] },
};

// ============================================================
// Helpers
// ============================================================

function getCategoryFromMime(mimeType: string): MimeCategory {
    for (const [category, config] of Object.entries(MIME_CATEGORIES)) {
        if (category === 'all' || category === 'other') continue;
        if (config.patterns.some(p => mimeType.startsWith(p) || mimeType === p)) {
            return category as MimeCategory;
        }
    }
    return 'other';
}

function getFileIcon(mimeType: string) {
    return MIME_CATEGORIES[getCategoryFromMime(mimeType)].icon;
}

function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatDate(date: Date | string): string {
    return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

// ============================================================
// Main Page Component
// ============================================================

export function MediaLibraryPage() {
    const [searchQuery, setSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<MimeCategory>('all');
    const [storageFilter, setStorageFilter] = useState<string>('all');
    const [folderPath, setFolderPath] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
    const [detailMedia, setDetailMedia] = useState<MediaInfo | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const pageSize = 24;

    const utils = trpc.useUtils();

    // Storage providers for display
    const { data: storageProvidersList } = trpc.storage.listProviders.useQuery();
    const providerDisplayMap = new Map(
        (storageProvidersList ?? []).map((p: { providerId: string; displayName: string }) => [p.providerId, p.displayName])
    );
    const getProviderLabel = (providerId: string): string => {
        if (providerId === 'local') return 'Local';
        return providerDisplayMap.get(providerId) || providerId;
    };

    // Build query
    const backendCategory = (categoryFilter !== 'all' && categoryFilter !== 'other') ? categoryFilter : undefined;
    const listQuery = {
        page: currentPage,
        pageSize,
        sortBy: 'createdAt' as const,
        sortOrder: 'desc' as const,
        search: searchQuery || undefined,
        category: backendCategory,
        storageProvider: storageFilter !== 'all' ? storageFilter : undefined,
        folderPath: folderPath || undefined,
    };

    const { data: mediaData, isLoading, refetch } = trpc.media.list.useQuery(listQuery);
    const items = (mediaData?.items ?? []) as MediaInfo[];
    const totalPages = mediaData?.totalPages ?? 1;
    const total = mediaData?.total ?? 0;

    // Mutations
    const deleteMedia = trpc.media.delete.useMutation({
        onSuccess: () => {
            toast.success('Media deleted');
            utils.media.list.invalidate();
        },
        onError: (error: { message?: string }) => {
            toast.error(error.message || 'Failed to delete');
        },
    });

    const bulkDeleteMedia = trpc.media.bulkDelete.useMutation({
        onSuccess: (data: { successful: number; failed: number }) => {
            toast.success(`Deleted ${data.successful} item(s)`);
            setSelectedIds(new Set());
            utils.media.list.invalidate();
        },
        onError: (error: { message?: string }) => {
            toast.error(error.message || 'Bulk delete failed');
        },
    });

    // Selection logic
    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === items.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(items.map(i => i.id)));
        }
    };

    // Signed URL helpers
    const handleCopyLink = async (item: MediaInfo) => {
        try {
            const result = await utils.media.getSignedUrl.fetch({ mediaId: item.id, expiresIn: 3600 });
            await navigator.clipboard.writeText(result.url);
            toast.success('Link copied');
        } catch {
            toast.error('Failed to copy link');
        }
    };

    const handleDownload = async (item: MediaInfo) => {
        try {
            const result = await utils.media.getSignedUrl.fetch({ mediaId: item.id, expiresIn: 60 });
            const response = await fetch(result.url);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = item.filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch {
            toast.error('Failed to download');
        }
    };

    const handleFilterChange = (type: 'search' | 'category' | 'storage' | 'folder', value: string | null) => {
        setCurrentPage(1);
        setSelectedIds(new Set());
        switch (type) {
            case 'search': setSearchQuery(value ?? ''); break;
            case 'category': setCategoryFilter((value ?? 'all') as MimeCategory); break;
            case 'storage': setStorageFilter(value ?? 'all'); break;
            case 'folder': setFolderPath(value); break;
        }
    };

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <ImageIcon className="h-8 w-8 text-primary" />
                    <h1 className="text-3xl font-bold">Media Library</h1>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={() => refetch()}>
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'grid' | 'list')}>
                        <TabsList>
                            <TabsTrigger value="grid">
                                <Grid3X3 className="h-4 w-4" />
                            </TabsTrigger>
                            <TabsTrigger value="list">
                                <List className="h-4 w-4" />
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>
                    <Button onClick={() => setUploadDialogOpen(true)}>
                        <Upload className="h-4 w-4 mr-2" />
                        Upload
                    </Button>
                </div>
            </div>

            <div className="rounded-xl border border-border bg-card">
                {/* Filters */}
                <div className="p-4 border-b border-border">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                            {/* Folder breadcrumb */}
                            {folderPath && (
                                <Button variant="outline" size="sm" onClick={() => handleFilterChange('folder', null)}>
                                    <FolderOpen className="h-4 w-4 mr-1" />
                                    {folderPath}
                                    <X className="h-3 w-3 ml-1" />
                                </Button>
                            )}
                            {/* Category filter */}
                            <Select value={categoryFilter} onValueChange={(v) => handleFilterChange('category', v)}>
                                <SelectTrigger className="w-36">
                                    <SelectValue placeholder="Category" />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.entries(MIME_CATEGORIES).map(([key, config]) => {
                                        const Icon = config.icon;
                                        return (
                                            <SelectItem key={key} value={key}>
                                                <div className="flex items-center gap-2">
                                                    <Icon className="h-4 w-4" />
                                                    {config.label}
                                                </div>
                                            </SelectItem>
                                        );
                                    })}
                                </SelectContent>
                            </Select>
                            {/* Storage filter */}
                            <Select value={storageFilter} onValueChange={(v) => handleFilterChange('storage', v)}>
                                <SelectTrigger className="w-36">
                                    <SelectValue placeholder="Storage" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">
                                        <div className="flex items-center gap-2">
                                            <HardDrive className="h-4 w-4" />
                                            All Storage
                                        </div>
                                    </SelectItem>
                                    {(storageProvidersList ?? []).map((provider: { providerId: string; displayName: string }) => (
                                        <SelectItem key={provider.providerId} value={provider.providerId}>
                                            <div className="flex items-center gap-2">
                                                {provider.providerId === 'local' ? (
                                                    <HardDrive className="h-4 w-4" />
                                                ) : (
                                                    <Cloud className="h-4 w-4" />
                                                )}
                                                {provider.displayName}
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="relative w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search media..."
                                value={searchQuery}
                                onChange={(e) => handleFilterChange('search', e.target.value)}
                                className="pl-9"
                            />
                        </div>
                    </div>

                    {/* Bulk actions bar */}
                    {selectedIds.size > 0 && (
                        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border">
                            <span className="text-sm text-muted-foreground">{selectedIds.size} selected</span>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="destructive" size="sm">
                                        <Trash2 className="h-4 w-4 mr-1" />
                                        Delete Selected
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Delete {selectedIds.size} item(s)?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            This will soft-delete the selected media and their variants.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction
                                            onClick={() => bulkDeleteMedia.mutate({ mediaIds: Array.from(selectedIds) })}
                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                        >
                                            Delete
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                                Clear Selection
                            </Button>
                        </div>
                    )}
                </div>

                {/* Content */}
                {isLoading ? (
                    <div className="p-12 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
                    </div>
                ) : items.length === 0 ? (
                    <div className="p-12 text-center text-muted-foreground">
                        <ImageIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>{searchQuery || categoryFilter !== 'all' ? 'No media found' : 'No media yet'}</p>
                        <Button variant="outline" className="mt-4" onClick={() => setUploadDialogOpen(true)}>
                            <Upload className="h-4 w-4 mr-2" />
                            Upload your first file
                        </Button>
                    </div>
                ) : viewMode === 'grid' ? (
                    <MediaGrid
                        items={items}
                        selectedIds={selectedIds}
                        onToggleSelect={toggleSelect}
                        onView={setDetailMedia}
                        onDelete={(id) => deleteMedia.mutate({ mediaId: id })}
                    />
                ) : (
                    <MediaList
                        items={items}
                        selectedIds={selectedIds}
                        onToggleSelect={toggleSelect}
                        onToggleSelectAll={toggleSelectAll}
                        onView={setDetailMedia}
                        onDownload={handleDownload}
                        onCopyLink={handleCopyLink}
                        onDelete={(id) => deleteMedia.mutate({ mediaId: id })}
                        getProviderLabel={getProviderLabel}
                    />
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="p-4 border-t border-border flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                            Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, total)} of {total}
                        </p>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                            >
                                <ChevronLeft className="h-4 w-4" />
                                Previous
                            </Button>
                            <span className="text-sm text-muted-foreground px-2">
                                Page {currentPage} of {totalPages}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                            >
                                Next
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Upload Dialog */}
            <UploadDialog
                open={uploadDialogOpen}
                onOpenChange={setUploadDialogOpen}
                onSuccess={() => {
                    utils.media.list.invalidate();
                    setUploadDialogOpen(false);
                }}
            />

            {/* Detail Sheet */}
            <MediaDetailSheet
                media={detailMedia}
                open={!!detailMedia}
                onOpenChange={(open) => !open && setDetailMedia(null)}
                onDownload={handleDownload}
                onCopyLink={handleCopyLink}
                onUpdated={() => utils.media.list.invalidate()}
            />
        </div>
    );
}

// ============================================================
// Media Thumbnail
// ============================================================

function MediaThumbnail({ item, size = 'sm' }: { item: MediaInfo; size?: 'sm' | 'lg' }) {
    const isImage = item.mimeType.startsWith('image/');
    const isVideo = item.mimeType.startsWith('video/');
    const isMedia = isImage || isVideo;
    const Icon = getFileIcon(item.mimeType);
    const [failed, setFailed] = useState(false);

    const { data } = trpc.media.getSignedUrl.useQuery(
        { mediaId: item.id, expiresIn: 300 },
        { enabled: isMedia && !failed }
    );
    const thumbUrl = data?.url;

    const sizeClass = size === 'lg' ? 'w-full h-full' : 'w-10 h-10';
    const iconSize = size === 'lg' ? 'h-12 w-12' : 'h-5 w-5';

    if (isMedia && thumbUrl && !failed) {
        return (
            <div className={`${sizeClass} rounded-lg overflow-hidden bg-muted flex-shrink-0 relative`}>
                {isImage ? (
                    <img
                        src={thumbUrl}
                        alt={item.alt || item.filename}
                        className="w-full h-full object-cover"
                        onError={() => setFailed(true)}
                    />
                ) : (
                    <>
                        <video
                            src={thumbUrl}
                            className="w-full h-full object-cover"
                            muted
                            preload="metadata"
                            onError={() => setFailed(true)}
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                            <Film className="h-4 w-4 text-white" />
                        </div>
                    </>
                )}
            </div>
        );
    }

    return (
        <div className={`${sizeClass} rounded-lg bg-primary/10 flex items-center justify-center text-primary flex-shrink-0`}>
            <Icon className={iconSize} />
        </div>
    );
}

// ============================================================
// Grid View
// ============================================================

function MediaGrid({
    items,
    selectedIds,
    onToggleSelect,
    onView,
    onDelete,
}: {
    items: MediaInfo[];
    selectedIds: Set<string>;
    onToggleSelect: (id: string) => void;
    onView: (item: MediaInfo) => void;
    onDelete: (id: string) => void;
}) {
    return (
        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {items.map((item) => {
                const isSelected = selectedIds.has(item.id);
                return (
                    <div
                        key={item.id}
                        className={`group relative aspect-square rounded-lg border overflow-hidden bg-muted cursor-pointer transition-colors ${
                            isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-primary'
                        }`}
                        onClick={() => onView(item)}
                    >
                        <MediaThumbnail item={item} size="lg" />

                        {/* Select checkbox */}
                        <div
                            className={`absolute top-2 left-2 transition-opacity ${
                                isSelected || selectedIds.size > 0 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}
                            onClick={(e) => { e.stopPropagation(); onToggleSelect(item.id); }}
                        >
                            <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                                isSelected ? 'bg-primary border-primary text-primary-foreground' : 'bg-background border-border'
                            }`}>
                                {isSelected && <Check className="h-3 w-3" />}
                            </div>
                        </div>

                        {/* Overlay on hover */}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2">
                            <div className="flex justify-end">
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-white" onClick={(e) => e.stopPropagation()}>
                                            <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onView(item); }}>
                                            <Eye className="h-4 w-4 mr-2" />
                                            View Details
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <DropdownMenuItem
                                                    onSelect={(e) => e.preventDefault()}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="text-destructive"
                                                >
                                                    <Trash2 className="h-4 w-4 mr-2" />
                                                    Delete
                                                </DropdownMenuItem>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Delete media?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        This will delete "{item.filename}" and all its variants.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction
                                                        onClick={() => onDelete(item.id)}
                                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                    >
                                                        Delete
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                            <div className="text-white text-xs">
                                <p className="font-medium truncate">{item.title || item.filename}</p>
                                {item.width && item.height && (
                                    <p className="opacity-75">{item.width}×{item.height}</p>
                                )}
                            </div>
                        </div>

                        {/* Tags badge */}
                        {item.tags && item.tags.length > 0 && (
                            <div className="absolute top-2 right-2 pointer-events-none">
                                <Badge variant="secondary" className="text-xs">
                                    <Tag className="h-3 w-3 mr-1" />
                                    {item.tags.length}
                                </Badge>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// ============================================================
// List View
// ============================================================

function MediaList({
    items,
    selectedIds,
    onToggleSelect,
    onToggleSelectAll,
    onView,
    onDownload,
    onCopyLink,
    onDelete,
    getProviderLabel,
}: {
    items: MediaInfo[];
    selectedIds: Set<string>;
    onToggleSelect: (id: string) => void;
    onToggleSelectAll: () => void;
    onView: (item: MediaInfo) => void;
    onDownload: (item: MediaInfo) => void;
    onCopyLink: (item: MediaInfo) => void;
    onDelete: (id: string) => void;
    getProviderLabel: (id: string) => string;
}) {
    const allSelected = items.length > 0 && selectedIds.size === items.length;
    const someSelected = selectedIds.size > 0 && !allSelected;

    return (
        <div className="divide-y divide-border">
            {/* Header row */}
            <div className="px-4 py-2 flex items-center gap-4 text-xs font-medium text-muted-foreground bg-muted/30">
                <div className="w-5 flex-shrink-0" onClick={onToggleSelectAll}>
                    <div className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer ${
                        allSelected ? 'bg-primary border-primary text-primary-foreground' : someSelected ? 'bg-primary/50 border-primary text-primary-foreground' : 'border-border'
                    }`}>
                        {allSelected && <Check className="h-3 w-3" />}
                        {someSelected && <Minus className="h-3 w-3" />}
                    </div>
                </div>
                <div className="w-10 flex-shrink-0" />
                <div className="flex-1">Name</div>
                <div className="w-20 text-right">Size</div>
                <div className="w-24">Type</div>
                <div className="w-24">Storage</div>
                <div className="w-32">Date</div>
                <div className="w-10" />
            </div>

            {items.map((item) => {
                const Icon = getFileIcon(item.mimeType);
                const isSelected = selectedIds.has(item.id);
                return (
                    <div
                        key={item.id}
                        className={`px-4 py-3 flex items-center gap-4 hover:bg-muted/50 cursor-pointer ${
                            isSelected ? 'bg-primary/5' : ''
                        }`}
                        onClick={() => onView(item)}
                    >
                        <div className="w-5 flex-shrink-0" onClick={(e) => { e.stopPropagation(); onToggleSelect(item.id); }}>
                            <div className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer ${
                                isSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-border'
                            }`}>
                                {isSelected && <Check className="h-3 w-3" />}
                            </div>
                        </div>
                        <MediaThumbnail item={item} />
                        <div className="flex-1 min-w-0">
                            <h3 className="font-medium truncate">{item.title || item.filename}</h3>
                            {item.tags && item.tags.length > 0 && (
                                <div className="flex items-center gap-1 mt-0.5">
                                    {item.tags.slice(0, 3).map(tag => (
                                        <Badge key={tag} variant="secondary" className="text-xs py-0">{tag}</Badge>
                                    ))}
                                    {item.tags.length > 3 && (
                                        <span className="text-xs text-muted-foreground">+{item.tags.length - 3}</span>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="w-20 text-right text-sm text-muted-foreground">
                            {formatFileSize(item.size)}
                        </div>
                        <div className="w-24">
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                <Icon className="h-3.5 w-3.5" />
                                <span className="truncate">{item.mimeType.split('/')[1]}</span>
                            </div>
                        </div>
                        <div className="w-24">
                            <Badge variant="outline" className="font-mono text-xs">
                                {item.storageProvider === 'local' ? (
                                    <><HardDrive className="h-3 w-3 mr-1" />Local</>
                                ) : (
                                    <><Cloud className="h-3 w-3 mr-1" />{getProviderLabel(item.storageProvider)}</>
                                )}
                            </Badge>
                        </div>
                        <div className="w-32 text-sm text-muted-foreground">
                            {formatDate(item.createdAt)}
                        </div>
                        <div className="w-10">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
                                        <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onView(item); }}>
                                        <Eye className="h-4 w-4 mr-2" />
                                        View Details
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDownload(item); }}>
                                        <Download className="h-4 w-4 mr-2" />
                                        Download
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onCopyLink(item); }}>
                                        <Link className="h-4 w-4 mr-2" />
                                        Copy Link
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <DropdownMenuItem
                                                onSelect={(e) => e.preventDefault()}
                                                onClick={(e) => e.stopPropagation()}
                                                className="text-destructive"
                                            >
                                                <Trash2 className="h-4 w-4 mr-2" />
                                                Delete
                                            </DropdownMenuItem>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Delete media?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    Are you sure you want to delete "{item.filename}"?
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction
                                                    onClick={() => onDelete(item.id)}
                                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                >
                                                    Delete
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ============================================================
// Upload Dialog
// ============================================================

function UploadDialog({
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
    const [selectedProviderId, setSelectedProviderId] = useState<string>(() => {
        return localStorage.getItem('lastStorageProvider') || 'local';
    });
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

                await fetch(uploadUrl, {
                    method: 'PUT',
                    body: file,
                    headers: { 'Content-Type': file.type },
                });

                await confirmUpload.mutateAsync({
                    mediaId,
                    fileSize: file.size,
                });

                setProgress(((i + 1) / files.length) * 100);
            }

            localStorage.setItem('lastStorageProvider', selectedProviderId);
            toast.success(`${files.length} file(s) uploaded`);
            setFiles([]);
            onSuccess();
        } catch {
            toast.error('Failed to upload files');
        } finally {
            setUploading(false);
            setProgress(0);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Upload Files</DialogTitle>
                    <DialogDescription>Drag and drop files or click to browse.</DialogDescription>
                </DialogHeader>

                {availableProviders.length > 1 && (
                    <div className="flex items-center gap-3">
                        <label className="text-sm font-medium whitespace-nowrap">Upload to:</label>
                        <Select value={selectedProviderId} onValueChange={setSelectedProviderId}>
                            <SelectTrigger className="flex-1">
                                <SelectValue placeholder="Select storage" />
                            </SelectTrigger>
                            <SelectContent>
                                {availableProviders.map((provider: { providerId: string; displayName: string }) => (
                                    <SelectItem key={provider.providerId} value={provider.providerId}>
                                        <div className="flex items-center gap-2">
                                            {provider.providerId === 'local' ? (
                                                <HardDrive className="h-4 w-4" />
                                            ) : (
                                                <Cloud className="h-4 w-4" />
                                            )}
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
                    <p className="text-sm text-muted-foreground">
                        Drag and drop files here, or click to select
                    </p>
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        className="hidden"
                        onChange={handleFileSelect}
                    />
                </div>

                {files.length > 0 && (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                        {files.map((file, index) => {
                            const Icon = getFileIcon(file.type);
                            return (
                                <div key={`${file.name}-${index}`} className="flex items-center justify-between p-2 rounded-lg bg-muted">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                                        <span className="text-sm truncate">{file.name}</span>
                                        <span className="text-xs text-muted-foreground shrink-0">({formatFileSize(file.size)})</span>
                                    </div>
                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeFile(index)}>
                                        <X className="h-3 w-3" />
                                    </Button>
                                </div>
                            );
                        })}
                    </div>
                )}

                {uploading && (
                    <div className="space-y-2">
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                                className="h-full bg-primary transition-all duration-300"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                        <p className="text-sm text-center text-muted-foreground">
                            Uploading... {Math.round(progress)}%
                        </p>
                    </div>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>
                        Cancel
                    </Button>
                    <Button onClick={handleUpload} disabled={files.length === 0 || uploading}>
                        {uploading ? 'Uploading...' : `Upload ${files.length} file(s)`}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ============================================================
// Media Detail Sheet (slide-out)
// ============================================================

function MediaDetailSheet({
    media: item,
    open,
    onOpenChange,
    onDownload,
    onCopyLink,
    onUpdated,
}: {
    media: MediaInfo | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onDownload: (item: MediaInfo) => void;
    onCopyLink: (item: MediaInfo) => void;
    onUpdated: () => void;
}) {
    const [editing, setEditing] = useState(false);
    const [editTitle, setEditTitle] = useState('');
    const [editAlt, setEditAlt] = useState('');
    const [editTags, setEditTags] = useState('');
    const [editFolder, setEditFolder] = useState('');

    // Reset edit state when item changes
    useEffect(() => {
        if (item) {
            setEditTitle(item.title || '');
            setEditAlt(item.alt || '');
            setEditTags((item.tags || []).join(', '));
            setEditFolder(item.folderPath || '');
            setEditing(false);
        }
    }, [item?.id]);

    const isImage = item?.mimeType.startsWith('image/');
    const isVideo = item?.mimeType.startsWith('video/');

    // Signed URL for preview
    const { data: signedData } = trpc.media.getSignedUrl.useQuery(
        { mediaId: item?.id ?? '', expiresIn: 300 },
        { enabled: open && !!item && (!!isImage || !!isVideo) }
    );

    // Variants
    const { data: variantsData } = trpc.media.getVariants.useQuery(
        { mediaId: item?.id ?? '' },
        { enabled: open && !!item && !!isImage }
    );
    const variants = (variantsData?.variants ?? []) as VariantInfo[];

    const updateMedia = trpc.media.update.useMutation({
        onSuccess: () => {
            toast.success('Media updated');
            setEditing(false);
            onUpdated();
        },
        onError: (error: { message?: string }) => {
            toast.error(error.message || 'Failed to update');
        },
    });

    const handleSave = () => {
        if (!item) return;
        updateMedia.mutate({
            mediaId: item.id,
            alt: editAlt || undefined,
            title: editTitle || undefined,
            tags: editTags ? editTags.split(',').map(t => t.trim()).filter(Boolean) : [],
            folderPath: editFolder || undefined,
        });
    };

    if (!item) return null;

    const Icon = getFileIcon(item.mimeType);
    const previewUrl = signedData?.url;

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-[450px] sm:w-[500px] overflow-y-auto">
                <SheetHeader>
                    <SheetTitle className="flex items-center gap-2 text-base">
                        <Icon className="h-5 w-5" />
                        <span className="truncate">{item.title || item.filename}</span>
                    </SheetTitle>
                </SheetHeader>

                <div className="mt-6 space-y-6">
                    {/* Preview */}
                    <div className="rounded-lg overflow-hidden bg-muted flex items-center justify-center min-h-[200px]">
                        {isImage && previewUrl ? (
                            <img src={previewUrl} alt={item.alt || item.filename} className="max-w-full max-h-[300px] object-contain" />
                        ) : isVideo && previewUrl ? (
                            <video src={previewUrl} controls className="max-w-full max-h-[300px]" />
                        ) : (
                            <div className="p-8 flex flex-col items-center">
                                <Icon className="h-16 w-16 text-muted-foreground mb-2" />
                                <p className="text-sm text-muted-foreground">Preview not available</p>
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => onDownload(item)}>
                            <Download className="h-4 w-4 mr-1" />
                            Download
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => onCopyLink(item)}>
                            <Link className="h-4 w-4 mr-1" />
                            Copy Link
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setEditing(!editing)}>
                            <Edit className="h-4 w-4 mr-1" />
                            {editing ? 'Cancel' : 'Edit'}
                        </Button>
                    </div>

                    <Separator />

                    {/* Metadata: Edit or View mode */}
                    {editing ? (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="edit-title">Title</Label>
                                <Input id="edit-title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Media title" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="edit-alt">Alt Text</Label>
                                <Input id="edit-alt" value={editAlt} onChange={(e) => setEditAlt(e.target.value)} placeholder="Describe this media for accessibility" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="edit-tags">Tags (comma separated)</Label>
                                <Input id="edit-tags" value={editTags} onChange={(e) => setEditTags(e.target.value)} placeholder="tag1, tag2, tag3" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="edit-folder">Folder Path</Label>
                                <Input id="edit-folder" value={editFolder} onChange={(e) => setEditFolder(e.target.value)} placeholder="/images/products" />
                            </div>
                            <div className="flex items-center gap-2">
                                <Button size="sm" onClick={handleSave} disabled={updateMedia.isPending}>
                                    {updateMedia.isPending ? 'Saving...' : 'Save Changes'}
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <MetadataRow label="Filename" value={item.filename} />
                            <MetadataRow label="Title" value={item.title || '-'} />
                            <MetadataRow label="Alt Text" value={item.alt || '-'} />
                            <MetadataRow label="Size" value={formatFileSize(item.size)} />
                            <MetadataRow label="Type" value={item.mimeType} />
                            {item.width && item.height && (
                                <MetadataRow label="Dimensions" value={`${item.width} × ${item.height}`} />
                            )}
                            <MetadataRow label="Folder" value={item.folderPath || '/'} />
                            <MetadataRow label="Storage" value={item.storageProvider} />
                            <MetadataRow label="Visibility" value={item.isPublic ? 'Public' : 'Private'} />
                            <MetadataRow label="Created" value={formatDate(item.createdAt)} />
                            <MetadataRow label="Updated" value={formatDate(item.updatedAt)} />

                            {/* Tags */}
                            <div>
                                <Label className="text-muted-foreground text-xs">Tags</Label>
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {item.tags && item.tags.length > 0 ? (
                                        item.tags.map(tag => (
                                            <Badge key={tag} variant="secondary">{tag}</Badge>
                                        ))
                                    ) : (
                                        <span className="text-sm text-muted-foreground">No tags</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Variants */}
                    {isImage && variants.length > 0 && (
                        <>
                            <Separator />
                            <div>
                                <Label className="text-muted-foreground text-xs">Variants</Label>
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {variants.map(v => (
                                        <Badge key={v.id} variant="outline">
                                            {v.variantName}
                                            {v.width && v.height ? ` (${v.width}×${v.height})` : ''}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}

function MetadataRow({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <Label className="text-muted-foreground text-xs">{label}</Label>
            <p className="text-sm mt-0.5">{value}</p>
        </div>
    );
}
