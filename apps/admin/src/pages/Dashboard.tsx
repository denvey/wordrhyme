import { LayoutDashboard } from 'lucide-react';

export function DashboardPage() {
    return (
        <div>
            <div className="flex items-center gap-3 mb-8">
                <LayoutDashboard className="h-8 w-8 text-primary" />
                <h1 className="text-3xl font-bold">Dashboard</h1>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Stats Cards */}
                <div className="p-6 rounded-xl bg-card border border-border shadow-sm">
                    <h3 className="text-sm font-medium text-muted-foreground">Installed Plugins</h3>
                    <p className="text-3xl font-bold mt-2">0</p>
                </div>

                <div className="p-6 rounded-xl bg-card border border-border shadow-sm">
                    <h3 className="text-sm font-medium text-muted-foreground">Active Users</h3>
                    <p className="text-3xl font-bold mt-2">1</p>
                </div>

                <div className="p-6 rounded-xl bg-card border border-border shadow-sm">
                    <h3 className="text-sm font-medium text-muted-foreground">API Requests (24h)</h3>
                    <p className="text-3xl font-bold mt-2">0</p>
                </div>
            </div>

            <div className="mt-8 p-6 rounded-xl bg-card border border-border shadow-sm">
                <h2 className="text-xl font-semibold mb-4">Getting Started</h2>
                <ul className="space-y-3 text-muted-foreground">
                    <li className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm">1</span>
                        Install your first plugin from the Plugins page
                    </li>
                    <li className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm">2</span>
                        Configure your organization settings
                    </li>
                    <li className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm">3</span>
                        Invite team members to your workspace
                    </li>
                </ul>
            </div>
        </div>
    );
}
