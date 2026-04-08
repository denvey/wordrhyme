import React from 'react';
import { MediaBrowser } from '../components/media/MediaBrowser';

export function MediaLibraryPage() {
    return (
        <div className="h-full p-6 flex flex-col">
            <div className="mb-6 shrink-0">
                <h1 className="text-2xl font-semibold tracking-tight">媒体库</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    管理全站的所有图片、视频、文件素材
                </p>
            </div>
            
            {/* Embed the Universal MediaBrowser Engine */}
            <div className="flex-1 min-h-0 border border-border rounded-lg shadow-sm">
                <MediaBrowser mode="manage" />
            </div>
        </div>
    );
}
