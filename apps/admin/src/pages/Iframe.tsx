/**
 * Iframe Page
 *
 * Renders external content in an iframe.
 * URL is passed via query parameter: /iframe?url=https://example.com
 */
import { useSearchParams, useNavigate } from 'react-router-dom';
import { AlertCircle, ExternalLink, RefreshCw } from 'lucide-react';
import { Button } from '@wordrhyme/ui';

export function IframePage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const url = searchParams.get('url');

    if (!url) {
        return (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] text-muted-foreground">
                <AlertCircle className="h-12 w-12 mb-4 opacity-50" />
                <h2 className="text-lg font-medium mb-2">No URL Provided</h2>
                <p className="text-sm mb-4">Please provide a URL to embed.</p>
                <Button variant="outline" onClick={() => navigate(-1)}>
                    Go Back
                </Button>
            </div>
        );
    }

    // Validate URL
    let validUrl: URL;
    try {
        validUrl = new URL(url);
        if (!['http:', 'https:'].includes(validUrl.protocol)) {
            throw new Error('Invalid protocol');
        }
    } catch {
        return (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] text-muted-foreground">
                <AlertCircle className="h-12 w-12 mb-4 opacity-50 text-destructive" />
                <h2 className="text-lg font-medium mb-2">Invalid URL</h2>
                <p className="text-sm mb-4">The provided URL is not valid.</p>
                <Button variant="outline" onClick={() => navigate(-1)}>
                    Go Back
                </Button>
            </div>
        );
    }

    return (
        <div className="h-[calc(100vh-140px)] flex flex-col">
            {/* Header bar */}
            <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b">
                <div className="flex items-center gap-2 text-sm text-muted-foreground truncate max-w-[60%]">
                    <span className="font-medium">Embedded:</span>
                    <span className="truncate">{validUrl.hostname}</span>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
                    >
                        <ExternalLink className="h-4 w-4 mr-1" />
                        Open in New Tab
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            const iframe = document.querySelector('iframe');
                            if (iframe) {
                                iframe.src = iframe.src;
                            }
                        }}
                    >
                        <RefreshCw className="h-4 w-4 mr-1" />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* iframe container */}
            <div className="flex-1 relative">
                <iframe
                    src={url}
                    className="absolute inset-0 w-full h-full border-0"
                    title="Embedded Content"
                    sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-downloads"
                    referrerPolicy="no-referrer-when-downgrade"
                />
            </div>
        </div>
    );
}
