/**
 * Files Page
 *
 * File management interface for uploading, viewing, and managing files.
 */
import { useState, useCallback, useRef } from 'react';
import {
    FileIcon,
    Upload,
    Search,
    MoreHorizontal,
    Trash2,
    Download,
    Link,
    Eye,
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
} from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
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
} from '@wordrhyme/ui';
import { toast } from 'sonner';
import { trpc } from '../lib/trpc';

interface FileInfo {
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    isPublic: boolean;
    storageKey: string;
    storageProvider: string;
    storageBucket: string | null;
    uploadedBy: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
}

type MimeCategory = 'all' | 'image' | 'document' | 'video' | 'audio' | 'archive' | 'other';

const MIME_CATEGORIES: Record<MimeCategory, { label: string; icon: typeof FileIcon; patterns: string[] }> = {
    all: { label: 'All Files', icon: File, patterns: [] },
    image: { label: 'Images', icon: Image, patterns: ['image/'] },
    document: { label: 'Documents', icon: FileText, patterns: ['application/pdf', 'application/msword', 'application/vnd.', 'text/'] },
    video: { label: 'Videos', icon: Film, patterns: ['video/'] },
    audio: { label: 'Audio', icon: Music, patterns: ['audio/'] },
    archive: { label: 'Archives', icon: Archive, patterns: ['application/zip', 'application/x-rar', 'application/gzip', 'application/x-tar'] },
    other: { label: 'Other', icon: File, patterns: [] },
};

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
    const category = getCategoryFromMime(mimeType);
    return MIME_CATEGORIES[category].icon;
}

function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
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

/**
 * File Thumbnail Component
 * Shows image/video preview for media files, icon for others
 */
function FileThumbnail({ file }: { file: FileInfo }) {
    const isImage = file.mimeType.startsWith('image/');
    const isVideo = file.mimeType.startsWith('video/');
    const isMedia = isImage || isVideo;
    const Icon = getFileIcon(file.mimeType);
    const [failed, setFailed] = useState(false);

    const { data } = trpc.files.getSignedUrl.useQuery(
        { fileId: file.id, expiresIn: 300 },
        { enabled: isMedia && !failed }
    );
    const thumbUrl = data?.url;

    if (isMedia && thumbUrl && !failed) {
        return (
            <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted flex-shrink-0 relative">
                {isImage ? (
                    <img
                        src={thumbUrl}
                        alt={file.filename}
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
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
            <Icon className="h-5 w-5" />
        </div>
    );
}

export function FilesPage() {
    const [searchQuery, setSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<MimeCategory>('all');
    const [storageFilter, setStorageFilter] = useState<string>('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
    const [previewFile, setPreviewFile] = useState<FileInfo | null>(null);
    const pageSize = 20;

    const utils = trpc.useUtils();

    // Fetch storage providers for display name mapping
    const { data: storageProvidersList } = trpc.storage.listProviders.useQuery();
    const providerDisplayMap = new Map(
        (storageProvidersList ?? []).map((p: { providerId: string; displayName: string }) => [p.providerId, p.displayName])
    );
    const getProviderLabel = (providerId: string): string => {
        if (providerId === 'local') return 'Local';
        return providerDisplayMap.get(providerId) || providerId;
    };

    // Fetch files
    const { data: filesData, isLoading, refetch } = trpc.files.list.useQuery({
        page: currentPage,
        pageSize,
        search: searchQuery || undefined,
        mimeType: categoryFilter !== 'all' ? MIME_CATEGORIES[categoryFilter].patterns[0] : undefined,
        storageProvider: storageFilter !== 'all' ? storageFilter : undefined,
    });

    const files = (filesData?.items ?? []) as FileInfo[];
    const totalPages = filesData?.totalPages ?? 1;
    const total = filesData?.total ?? 0;

    // Delete mutation
    const deleteFile = trpc.files.delete.useMutation({
        onSuccess: () => {
            toast.success('File deleted successfully');
            utils.files.list.invalidate();
        },
        onError: (error: { message?: string }) => {
            toast.error(error.message || 'Failed to delete file');
        },
    });

    // Get signed URL via query fetch
    const handleCopyLink = async (file: FileInfo) => {
        try {
            const result = await utils.files.getSignedUrl.fetch({ fileId: file.id, expiresIn: 3600 });
            await navigator.clipboard.writeText(result.url);
            toast.success('Link copied to clipboard');
        } catch (error) {
            toast.error('Failed to copy link');
        }
    };

    const handleDownload = async (file: FileInfo) => {
        try {
            const result = await utils.files.getSignedUrl.fetch({ fileId: file.id, expiresIn: 60 });
            // Fetch the file as blob and trigger download
            const response = await fetch(result.url);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = file.filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            toast.error('Failed to download file');
        }
    };

    const handleSearchChange = (value: string) => {
        setSearchQuery(value);
        setCurrentPage(1);
    };

    const handleCategoryChange = (value: MimeCategory) => {
        setCategoryFilter(value);
        setCurrentPage(1);
    };

    const handleStorageChange = (value: string) => {
        setStorageFilter(value);
        setCurrentPage(1);
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <FileIcon className="h-8 w-8 text-primary" />
                    <h1 className="text-3xl font-bold">Files</h1>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={() => refetch()}>
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button onClick={() => setUploadDialogOpen(true)}>
                        <Upload className="h-4 w-4 mr-2" />
                        Upload Files
                    </Button>
                </div>
            </div>

            <div className="rounded-xl border border-border bg-card">
                <div className="p-6 border-b border-border">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="font-semibold">File Management</h2>
                            <p className="text-sm text-muted-foreground mt-1">
                                Upload and manage files for your organization
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Select value={categoryFilter} onValueChange={handleCategoryChange}>
                                <SelectTrigger className="w-40">
                                    <SelectValue placeholder="Filter type" />
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
                            <Select value={storageFilter} onValueChange={handleStorageChange}>
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
                            <div className="relative w-64">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search files..."
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
                ) : files.length === 0 ? (
                    <div className="p-12 text-center text-muted-foreground">
                        <FileIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>{searchQuery ? 'No files found' : 'No files uploaded yet'}</p>
                        <Button variant="outline" className="mt-4" onClick={() => setUploadDialogOpen(true)}>
                            <Upload className="h-4 w-4 mr-2" />
                            Upload your first file
                        </Button>
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {files.map((file) => {
                            const Icon = getFileIcon(file.mimeType);
                            return (
                                <div
                                    key={file.id}
                                    className="p-4 flex items-center justify-between hover:bg-muted/50 cursor-pointer"
                                    onClick={() => setPreviewFile(file)}
                                >
                                    <div className="flex items-center gap-4">
                                        <FileThumbnail file={file} />
                                        <div>
                                            <h3 className="font-medium">{file.filename}</h3>
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <span>{formatFileSize(file.size)}</span>
                                                <span>·</span>
                                                <span className="inline-flex items-center gap-1">
                                                    <Icon className="h-3.5 w-3.5" />
                                                    {file.mimeType}
                                                </span>
                                                <span>·</span>
                                                <span>{formatDate(file.createdAt)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Badge variant="outline" className="font-mono text-xs">
                                            {file.storageProvider === 'local' ? (
                                                <><HardDrive className="h-3 w-3 mr-1" />Local</>
                                            ) : (
                                                <><Cloud className="h-3 w-3 mr-1" />{getProviderLabel(file.storageProvider)}</>
                                            )}
                                        </Badge>
                                        <Badge variant={file.isPublic ? 'default' : 'secondary'}>
                                            {file.isPublic ? 'Public' : 'Private'}
                                        </Badge>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}>
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={(e) => {
                                                    e.stopPropagation();
                                                    setPreviewFile(file);
                                                }}>
                                                    <Eye className="h-4 w-4 mr-2" />
                                                    Preview
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDownload(file);
                                                }}>
                                                    <Download className="h-4 w-4 mr-2" />
                                                    Download
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleCopyLink(file);
                                                }}>
                                                    <Link className="h-4 w-4 mr-2" />
                                                    Copy Link
                                                </DropdownMenuItem>
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
                                                            <AlertDialogTitle>Delete File</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                Are you sure you want to delete "{file.filename}"?
                                                                This action cannot be undone.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                            <AlertDialogAction
                                                                onClick={() => deleteFile.mutate({ fileId: file.id })}
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
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="p-4 border-t border-border flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                            Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, total)} of {total} files
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

            {/* Upload Dialog */}
            <UploadDialog
                open={uploadDialogOpen}
                onOpenChange={setUploadDialogOpen}
                onSuccess={() => {
                    utils.files.list.invalidate();
                    setUploadDialogOpen(false);
                }}
            />

            {/* Preview Dialog */}
            <FilePreviewDialog
                file={previewFile}
                open={!!previewFile}
                onOpenChange={(open) => !open && setPreviewFile(null)}
                onDownload={handleDownload}
                onCopyLink={handleCopyLink}
            />
        </div>
    );
}

/**
 * Upload Dialog Component
 */
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
    const [storageProvider, setStorageProvider] = useState<string>(() => {
        return localStorage.getItem('lastStorageProvider') || 'local';
    });
    const fileInputRef = useRef<HTMLInputElement>(null);

    const getUploadUrl = trpc.files.getUploadUrl.useMutation();

    // Fetch available storage providers
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

                // Get presigned upload URL with storage provider
                const { uploadUrl } = await getUploadUrl.mutateAsync({
                    filename: file.name,
                    contentType: file.type,
                    storageProvider,
                });

                // Upload to presigned URL
                await fetch(uploadUrl, {
                    method: 'PUT',
                    body: file,
                    headers: {
                        'Content-Type': file.type,
                    },
                });

                setProgress(((i + 1) / files.length) * 100);
            }

            // Save last used storage provider
            localStorage.setItem('lastStorageProvider', storageProvider);

            toast.success(`${files.length} file(s) uploaded successfully`);
            setFiles([]);
            onSuccess();
        } catch (error) {
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
                    <DialogDescription>
                        Drag and drop files or click to browse.
                    </DialogDescription>
                </DialogHeader>

                {/* Storage Provider Selection */}
                {availableProviders.length > 1 && (
                    <div className="flex items-center gap-3">
                        <label className="text-sm font-medium whitespace-nowrap">Upload to:</label>
                        <Select value={storageProvider} onValueChange={setStorageProvider}>
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
                                <div
                                    key={`${file.name}-${index}`}
                                    className="flex items-center justify-between p-2 rounded-lg bg-muted"
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                                        <span className="text-sm truncate">{file.name}</span>
                                        <span className="text-xs text-muted-foreground shrink-0">
                                            ({formatFileSize(file.size)})
                                        </span>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={() => removeFile(index)}
                                    >
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

/**
 * File Preview Dialog Component
 */
function FilePreviewDialog({
    file,
    open,
    onOpenChange,
    onDownload,
    onCopyLink,
}: {
    file: FileInfo | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onDownload: (file: FileInfo) => void;
    onCopyLink: (file: FileInfo) => void;
}) {
    const isMedia = file?.mimeType.startsWith('image/') || file?.mimeType.startsWith('video/');

    const { data: signedData } = trpc.files.getSignedUrl.useQuery(
        { fileId: file?.id ?? '', expiresIn: 300 },
        { enabled: open && !!file && !!isMedia }
    );
    const previewUrl = signedData?.url ?? null;

    if (!file) return null;

    const Icon = getFileIcon(file.mimeType);
    const isImage = file.mimeType.startsWith('image/');
    const isVideo = file.mimeType.startsWith('video/');

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Icon className="h-5 w-5" />
                        {file.filename}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Preview Area */}
                    {isImage && previewUrl ? (
                        <div className="rounded-lg overflow-hidden bg-muted flex items-center justify-center min-h-[200px]">
                            <img
                                src={previewUrl}
                                alt={file.filename}
                                className="max-w-full max-h-[400px] object-contain"
                            />
                        </div>
                    ) : isVideo && previewUrl ? (
                        <div className="rounded-lg overflow-hidden bg-muted flex items-center justify-center min-h-[200px]">
                            <video
                                src={previewUrl}
                                controls
                                className="max-w-full max-h-[400px]"
                            />
                        </div>
                    ) : (
                        <div className="rounded-lg bg-muted p-8 flex flex-col items-center justify-center min-h-[200px]">
                            <Icon className="h-16 w-16 text-muted-foreground mb-4" />
                            <p className="text-muted-foreground">Preview not available</p>
                        </div>
                    )}

                    {/* File Details */}
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <p className="text-muted-foreground">Size</p>
                            <p className="font-medium">{formatFileSize(file.size)}</p>
                        </div>
                        <div>
                            <p className="text-muted-foreground">Type</p>
                            <p className="font-medium">{file.mimeType}</p>
                        </div>
                        <div>
                            <p className="text-muted-foreground">Created</p>
                            <p className="font-medium">{formatDate(file.createdAt)}</p>
                        </div>
                        <div>
                            <p className="text-muted-foreground">Visibility</p>
                            <Badge variant={file.isPublic ? 'default' : 'secondary'}>
                                {file.isPublic ? 'Public' : 'Private'}
                            </Badge>
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onCopyLink(file)}>
                        <Link className="h-4 w-4 mr-2" />
                        Copy Link
                    </Button>
                    <Button onClick={() => onDownload(file)}>
                        <Download className="h-4 w-4 mr-2" />
                        Download
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
