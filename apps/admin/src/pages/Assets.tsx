/**
 * Assets Page
 *
 * CMS asset management interface with image variants, tags, and folder organization.
 */
import { useState, useCallback } from 'react';
import {
    ImageIcon,
    Search,
    MoreHorizontal,
    Trash2,
    Edit,
    Eye,
    ChevronLeft,
    ChevronRight,
    FolderOpen,
    Tag,
    Grid3X3,
    List,
    RefreshCw,
    FileVideo,
    FileText,
    File,
    Plus,
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
} from '@wordrhyme/ui';
import { toast } from 'sonner';
import { trpc } from '../lib/trpc';

type AssetType = 'image' | 'video' | 'document' | 'other';

interface AssetInfo {
    id: string;
    fileId: string;
    type: AssetType;
    alt: string | null;
    title: string | null;
    tags: string[];
    folderPath: string | null;
    width: number | null;
    height: number | null;
    format: string | null;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
    file?: {
        id: string;
        filename: string;
        mimeType: string;
        size: number;
    };
}

interface AssetVariant {
    name: string;
    fileId: string;
    width: number;
    height: number;
    format: string;
}

const ASSET_TYPE_ICONS: Record<AssetType, typeof ImageIcon> = {
    image: ImageIcon,
    video: FileVideo,
    document: FileText,
    other: File,
};

function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatDate(date: Date | string): string {
    return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

export function AssetsPage() {
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<AssetType | 'all'>('all');
    const [folderPath, setFolderPath] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [selectedAsset, setSelectedAsset] = useState<AssetInfo | null>(null);
    const [editAsset, setEditAsset] = useState<AssetInfo | null>(null);
    const pageSize = 24;

    const utils = trpc.useUtils();

    // Fetch assets
    const { data: assetsData, isLoading, refetch } = trpc.assets.list.useQuery({
        page: currentPage,
        pageSize,
        search: searchQuery || undefined,
        type: typeFilter !== 'all' ? typeFilter : undefined,
        folderPath: folderPath || undefined,
    });

    const assets = (assetsData?.items ?? []) as AssetInfo[];
    const totalPages = assetsData?.totalPages ?? 1;
    const total = assetsData?.total ?? 0;

    // Delete mutation
    const deleteAsset = trpc.assets.delete.useMutation({
        onSuccess: () => {
            toast.success('Asset deleted successfully');
            utils.assets.list.invalidate();
        },
        onError: (error: { message?: string }) => {
            toast.error(error.message || 'Failed to delete asset');
        },
    });

    // Update mutation
    const updateAsset = trpc.assets.update.useMutation({
        onSuccess: () => {
            toast.success('Asset updated successfully');
            utils.assets.list.invalidate();
            setEditAsset(null);
        },
        onError: (error: { message?: string }) => {
            toast.error(error.message || 'Failed to update asset');
        },
    });

    const handleSearchChange = (value: string) => {
        setSearchQuery(value);
        setCurrentPage(1);
    };

    const handleTypeChange = (value: AssetType | 'all') => {
        setTypeFilter(value);
        setCurrentPage(1);
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <ImageIcon className="h-8 w-8 text-primary" />
                    <h1 className="text-3xl font-bold">Assets</h1>
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
                </div>
            </div>

            <div className="rounded-xl border border-border bg-card">
                <div className="p-6 border-b border-border">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="font-semibold">Asset Library</h2>
                            <p className="text-sm text-muted-foreground mt-1">
                                Manage media assets with variants, tags, and folders
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            {folderPath && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setFolderPath(null)}
                                >
                                    <FolderOpen className="h-4 w-4 mr-2" />
                                    {folderPath}
                                    <span className="ml-2">×</span>
                                </Button>
                            )}
                            <Select value={typeFilter} onValueChange={handleTypeChange}>
                                <SelectTrigger className="w-40">
                                    <SelectValue placeholder="Filter type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Types</SelectItem>
                                    <SelectItem value="image">Images</SelectItem>
                                    <SelectItem value="video">Videos</SelectItem>
                                    <SelectItem value="document">Documents</SelectItem>
                                    <SelectItem value="other">Other</SelectItem>
                                </SelectContent>
                            </Select>
                            <div className="relative w-64">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search assets..."
                                    value={searchQuery}
                                    onChange={(e) => handleSearchChange(e.target.value)}
                                    className="pl-9"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {isLoading ? (
                    <div className="p-12 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
                    </div>
                ) : assets.length === 0 ? (
                    <div className="p-12 text-center text-muted-foreground">
                        <ImageIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>{searchQuery ? 'No assets found' : 'No assets yet'}</p>
                        <p className="text-sm mt-2">
                            Upload files from the Files page to create assets
                        </p>
                    </div>
                ) : viewMode === 'grid' ? (
                    <AssetGrid
                        assets={assets}
                        onView={setSelectedAsset}
                        onEdit={setEditAsset}
                        onDelete={(id) => deleteAsset.mutate({ assetId: id })}
                        onFolderClick={setFolderPath}
                    />
                ) : (
                    <AssetList
                        assets={assets}
                        onView={setSelectedAsset}
                        onEdit={setEditAsset}
                        onDelete={(id) => deleteAsset.mutate({ assetId: id })}
                        onFolderClick={setFolderPath}
                    />
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="p-4 border-t border-border flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                            Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, total)} of {total} assets
                        </p>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
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
                                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                            >
                                Next
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Asset Detail Dialog */}
            <AssetDetailDialog
                asset={selectedAsset}
                open={!!selectedAsset}
                onOpenChange={(open) => !open && setSelectedAsset(null)}
            />

            {/* Edit Asset Dialog */}
            <EditAssetDialog
                asset={editAsset}
                open={!!editAsset}
                onOpenChange={(open) => !open && setEditAsset(null)}
                onSave={(data) => {
                    if (editAsset) {
                        updateAsset.mutate({
                            assetId: editAsset.id,
                            ...data,
                        });
                    }
                }}
            />
        </div>
    );
}

/**
 * Asset Grid View
 */
function AssetGrid({
    assets,
    onView,
    onEdit,
    onDelete,
    onFolderClick,
}: {
    assets: AssetInfo[];
    onView: (asset: AssetInfo) => void;
    onEdit: (asset: AssetInfo) => void;
    onDelete: (id: string) => void;
    onFolderClick: (path: string) => void;
}) {
    const getVariantUrl = trpc.assets.getVariantUrl.useMutation();

    return (
        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {assets.map((asset) => {
                const Icon = ASSET_TYPE_ICONS[asset.type];
                return (
                    <div
                        key={asset.id}
                        className="group relative aspect-square rounded-lg border border-border overflow-hidden bg-muted hover:border-primary transition-colors cursor-pointer"
                        onClick={() => onView(asset)}
                    >
                        {asset.type === 'image' ? (
                            <AssetThumbnail asset={asset} />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center">
                                <Icon className="h-12 w-12 text-muted-foreground" />
                            </div>
                        )}

                        {/* Overlay */}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2">
                            <div className="flex justify-end">
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-white" onClick={(e) => e.stopPropagation()}>
                                            <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={(e) => {
                                            e.stopPropagation();
                                            onView(asset);
                                        }}>
                                            <Eye className="h-4 w-4 mr-2" />
                                            View Details
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={(e) => {
                                            e.stopPropagation();
                                            onEdit(asset);
                                        }}>
                                            <Edit className="h-4 w-4 mr-2" />
                                            Edit
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
                                                    <AlertDialogTitle>Delete Asset</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        Are you sure you want to delete this asset?
                                                        This action cannot be undone.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction
                                                        onClick={() => onDelete(asset.id)}
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
                                <p className="font-medium truncate">{asset.title || asset.file?.filename || 'Untitled'}</p>
                                {asset.width && asset.height && (
                                    <p className="opacity-75">{asset.width}×{asset.height}</p>
                                )}
                            </div>
                        </div>

                        {/* Tags badge */}
                        {asset.tags.length > 0 && (
                            <div className="absolute top-2 left-2">
                                <Badge variant="secondary" className="text-xs">
                                    <Tag className="h-3 w-3 mr-1" />
                                    {asset.tags.length}
                                </Badge>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

/**
 * Asset Thumbnail Component
 */
function AssetThumbnail({ asset }: { asset: AssetInfo }) {
    const getVariantUrl = trpc.assets.getVariantUrl.useMutation();
    const [url, setUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const loadThumbnail = useCallback(async () => {
        try {
            const result = await getVariantUrl.mutateAsync({
                assetId: asset.id,
                variant: 'thumbnail',
            });
            setUrl(result);
        } catch {
            setUrl(null);
        } finally {
            setLoading(false);
        }
    }, [asset.id, getVariantUrl]);

    // Load thumbnail on mount
    if (loading && !getVariantUrl.isPending && !url) {
        loadThumbnail();
    }

    if (loading) {
        return (
            <div className="w-full h-full flex items-center justify-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
        );
    }

    if (!url) {
        return (
            <div className="w-full h-full flex items-center justify-center">
                <ImageIcon className="h-12 w-12 text-muted-foreground" />
            </div>
        );
    }

    return (
        <img
            src={url}
            alt={asset.alt || asset.title || ''}
            className="w-full h-full object-cover"
        />
    );
}

/**
 * Asset List View
 */
function AssetList({
    assets,
    onView,
    onEdit,
    onDelete,
    onFolderClick,
}: {
    assets: AssetInfo[];
    onView: (asset: AssetInfo) => void;
    onEdit: (asset: AssetInfo) => void;
    onDelete: (id: string) => void;
    onFolderClick: (path: string) => void;
}) {
    return (
        <div className="divide-y divide-border">
            {assets.map((asset) => {
                const Icon = ASSET_TYPE_ICONS[asset.type];
                return (
                    <div
                        key={asset.id}
                        className="p-4 flex items-center justify-between hover:bg-muted/50 cursor-pointer"
                        onClick={() => onView(asset)}
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 rounded-lg border border-border overflow-hidden bg-muted flex items-center justify-center">
                                {asset.type === 'image' ? (
                                    <AssetThumbnail asset={asset} />
                                ) : (
                                    <Icon className="h-8 w-8 text-muted-foreground" />
                                )}
                            </div>
                            <div>
                                <h3 className="font-medium">{asset.title || asset.file?.filename || 'Untitled'}</h3>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Badge variant="outline" className="text-xs">{asset.type}</Badge>
                                    {asset.width && asset.height && (
                                        <span>{asset.width}×{asset.height}</span>
                                    )}
                                    {asset.file && (
                                        <span>{formatFileSize(asset.file.size)}</span>
                                    )}
                                    <span>{formatDate(asset.createdAt)}</span>
                                </div>
                                {asset.tags.length > 0 && (
                                    <div className="flex items-center gap-1 mt-1">
                                        {asset.tags.slice(0, 3).map((tag) => (
                                            <Badge key={tag} variant="secondary" className="text-xs">
                                                {tag}
                                            </Badge>
                                        ))}
                                        {asset.tags.length > 3 && (
                                            <span className="text-xs text-muted-foreground">
                                                +{asset.tags.length - 3} more
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {asset.folderPath && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onFolderClick(asset.folderPath!);
                                    }}
                                >
                                    <FolderOpen className="h-4 w-4 mr-1" />
                                    {asset.folderPath}
                                </Button>
                            )}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}>
                                        <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={(e) => {
                                        e.stopPropagation();
                                        onEdit(asset);
                                    }}>
                                        <Edit className="h-4 w-4 mr-2" />
                                        Edit
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
                                                <AlertDialogTitle>Delete Asset</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    Are you sure you want to delete this asset?
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction
                                                    onClick={() => onDelete(asset.id)}
                                                    className="bg-destructive text-destructive-foreground"
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

/**
 * Asset Detail Dialog
 */
function AssetDetailDialog({
    asset,
    open,
    onOpenChange,
}: {
    asset: AssetInfo | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const { data: variants } = trpc.assets.getVariants.useQuery(
        { assetId: asset?.id ?? '' },
        { enabled: !!asset && asset.type === 'image' }
    );

    if (!asset) return null;

    const Icon = ASSET_TYPE_ICONS[asset.type];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Icon className="h-5 w-5" />
                        {asset.title || asset.file?.filename || 'Untitled'}
                    </DialogTitle>
                </DialogHeader>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Preview */}
                    <div className="aspect-video rounded-lg overflow-hidden bg-muted flex items-center justify-center">
                        {asset.type === 'image' ? (
                            <AssetPreview asset={asset} />
                        ) : (
                            <Icon className="h-16 w-16 text-muted-foreground" />
                        )}
                    </div>

                    {/* Details */}
                    <div className="space-y-4">
                        <div>
                            <Label className="text-muted-foreground">Alt Text</Label>
                            <p className="mt-1">{asset.alt || '-'}</p>
                        </div>

                        <div>
                            <Label className="text-muted-foreground">Dimensions</Label>
                            <p className="mt-1">
                                {asset.width && asset.height ? `${asset.width} × ${asset.height}` : '-'}
                            </p>
                        </div>

                        <div>
                            <Label className="text-muted-foreground">Format</Label>
                            <p className="mt-1">{asset.format || asset.file?.mimeType || '-'}</p>
                        </div>

                        <div>
                            <Label className="text-muted-foreground">Folder</Label>
                            <p className="mt-1">{asset.folderPath || '/'}</p>
                        </div>

                        <div>
                            <Label className="text-muted-foreground">Tags</Label>
                            <div className="flex flex-wrap gap-1 mt-1">
                                {asset.tags.length > 0 ? (
                                    asset.tags.map((tag) => (
                                        <Badge key={tag} variant="secondary">{tag}</Badge>
                                    ))
                                ) : (
                                    <span className="text-muted-foreground">No tags</span>
                                )}
                            </div>
                        </div>

                        <div>
                            <Label className="text-muted-foreground">Created</Label>
                            <p className="mt-1">{formatDate(asset.createdAt)}</p>
                        </div>
                    </div>
                </div>

                {/* Variants */}
                {asset.type === 'image' && variants && variants.length > 0 && (
                    <div className="mt-4">
                        <Label className="text-muted-foreground">Available Variants</Label>
                        <div className="flex flex-wrap gap-2 mt-2">
                            {(variants as AssetVariant[]).map((variant) => (
                                <Badge key={variant.name} variant="outline">
                                    {variant.name} ({variant.width}×{variant.height})
                                </Badge>
                            ))}
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

/**
 * Asset Preview Component
 */
function AssetPreview({ asset }: { asset: AssetInfo }) {
    const getVariantUrl = trpc.assets.getVariantUrl.useMutation();
    const [url, setUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const loadPreview = useCallback(async () => {
        try {
            const result = await getVariantUrl.mutateAsync({
                assetId: asset.id,
                variant: 'medium',
            });
            setUrl(result);
        } catch {
            setUrl(null);
        } finally {
            setLoading(false);
        }
    }, [asset.id, getVariantUrl]);

    if (loading && !getVariantUrl.isPending && !url) {
        loadPreview();
    }

    if (loading) {
        return <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />;
    }

    if (!url) {
        return <ImageIcon className="h-16 w-16 text-muted-foreground" />;
    }

    return (
        <img
            src={url}
            alt={asset.alt || asset.title || ''}
            className="max-w-full max-h-full object-contain"
        />
    );
}

/**
 * Edit Asset Dialog
 */
function EditAssetDialog({
    asset,
    open,
    onOpenChange,
    onSave,
}: {
    asset: AssetInfo | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSave: (data: { alt?: string | undefined; title?: string | undefined; tags?: string[] | undefined; folderPath?: string | undefined }) => void;
}) {
    const [title, setTitle] = useState('');
    const [alt, setAlt] = useState('');
    const [tags, setTags] = useState('');
    const [folderPath, setFolderPath] = useState('');
    const [newTag, setNewTag] = useState('');

    // Reset form when asset changes
    if (asset && title === '' && alt === '' && tags === '' && folderPath === '') {
        setTitle(asset.title || '');
        setAlt(asset.alt || '');
        setTags(asset.tags.join(', '));
        setFolderPath(asset.folderPath || '');
    }

    const handleSave = () => {
        onSave({
            title: title || undefined,
            alt: alt || undefined,
            tags: tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
            folderPath: folderPath || undefined,
        });
    };

    const handleClose = () => {
        setTitle('');
        setAlt('');
        setTags('');
        setFolderPath('');
        onOpenChange(false);
    };

    if (!asset) return null;

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit Asset</DialogTitle>
                    <DialogDescription>
                        Update asset metadata
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="title">Title</Label>
                        <Input
                            id="title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Asset title"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="alt">Alt Text</Label>
                        <Input
                            id="alt"
                            value={alt}
                            onChange={(e) => setAlt(e.target.value)}
                            placeholder="Describe this asset for accessibility"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="tags">Tags (comma separated)</Label>
                        <Input
                            id="tags"
                            value={tags}
                            onChange={(e) => setTags(e.target.value)}
                            placeholder="tag1, tag2, tag3"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="folder">Folder Path</Label>
                        <Input
                            id="folder"
                            value={folderPath}
                            onChange={(e) => setFolderPath(e.target.value)}
                            placeholder="/images/products"
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={handleClose}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave}>
                        Save Changes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
