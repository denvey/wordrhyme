/**
 * ForbiddenPage Component
 *
 * Displayed when user lacks permission to access a page.
 * Better UX than redirect - user knows why they can't access.
 */
import { useNavigate } from 'react-router-dom';
import { ShieldX, ArrowLeft, Home } from 'lucide-react';
import { Button } from '@wordrhyme/ui';

interface ForbiddenPageProps {
    /** Custom title */
    title?: string;
    /** Custom description */
    description?: string;
    /** Show back button */
    showBack?: boolean;
    /** Show home button */
    showHome?: boolean;
}

export function ForbiddenPage({
    title = '无访问权限',
    description = '您没有访问此页面的权限。如需访问，请联系管理员。',
    showBack = true,
    showHome = true,
}: ForbiddenPageProps) {
    const navigate = useNavigate();

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
            <div className="mb-6">
                <ShieldX className="h-16 w-16 text-muted-foreground" />
            </div>
            <h1 className="text-2xl font-semibold mb-2">{title}</h1>
            <p className="text-muted-foreground mb-6 max-w-md">{description}</p>
            <div className="flex gap-3">
                {showBack && (
                    <Button
                        variant="outline"
                        onClick={() => navigate(-1)}
                    >
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        返回
                    </Button>
                )}
                {showHome && (
                    <Button onClick={() => navigate('/')}>
                        <Home className="h-4 w-4 mr-2" />
                        返回首页
                    </Button>
                )}
            </div>
        </div>
    );
}
