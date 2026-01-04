/**
 * Impersonation Banner
 *
 * Shows a warning banner when admin is impersonating another user.
 * Provides a button to stop impersonation and return to admin session.
 */
import { AlertTriangle, UserX } from 'lucide-react';
import { Button } from '@wordrhyme/ui';
import { useSession, admin } from '../lib/auth-client';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

interface ImpersonationSession {
    impersonatedBy?: string | null;
}

export function ImpersonationBanner() {
    const { data: session } = useSession();

    // Check if current session is impersonated
    const sessionData = session?.session as ImpersonationSession | undefined;
    const isImpersonating = !!sessionData?.impersonatedBy;

    const stopImpersonation = useMutation({
        mutationFn: async () => {
            return admin.stopImpersonating();
        },
        onSuccess: () => {
            toast.success('Stopped impersonating user');
            window.location.reload();
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Failed to stop impersonation');
        },
    });

    if (!isImpersonating) {
        return null;
    }

    return (
        <div className="flex items-center justify-between gap-4 px-4 py-2 bg-destructive text-destructive-foreground">
            <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                <span className="font-medium text-sm">
                    You are currently impersonating this user. All actions will be performed as this user.
                </span>
            </div>
            <Button
                variant="outline"
                size="sm"
                onClick={() => stopImpersonation.mutate()}
                disabled={stopImpersonation.isPending}
                className="bg-background text-foreground hover:bg-background/80"
            >
                <UserX className="h-4 w-4 mr-2" />
                {stopImpersonation.isPending ? 'Stopping...' : 'Stop Impersonating'}
            </Button>
        </div>
    );
}
