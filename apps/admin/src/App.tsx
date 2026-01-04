import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './lib/auth';
import { OrgAdminRoute } from './components/OrgAdminRoute';
import { DashboardPage } from './pages/Dashboard';
import { PluginsPage } from './pages/Plugins';
import { SettingsPage } from './pages/Settings';
import { PluginPage } from './pages/PluginPage';
import { LoginPage } from './pages/Login';
import { MembersPage } from './pages/Members';
import { MemberDetailPage } from './pages/MemberDetail';
import { InvitationsPage } from './pages/Invitations';
import { PlatformUsersPage } from './pages/PlatformUsers';

export function App() {
    return (
        <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
                path="/"
                element={
                    <ProtectedRoute>
                        <Layout />
                    </ProtectedRoute>
                }
            >
                <Route index element={<DashboardPage />} />
                <Route path="plugins" element={<PluginsPage />} />
                <Route
                    path="members"
                    element={
                        <OrgAdminRoute>
                            <MembersPage />
                        </OrgAdminRoute>
                    }
                />
                <Route
                    path="members/:memberId"
                    element={
                        <OrgAdminRoute>
                            <MemberDetailPage />
                        </OrgAdminRoute>
                    }
                />
                <Route path="invitations" element={<InvitationsPage />} />
                <Route path="platform/users" element={<PlatformUsersPage />} />
                <Route path="settings" element={<SettingsPage />} />
                {/* Dynamic plugin routes - /p/:pluginId/* */}
                <Route path="p/:pluginId/*" element={<PluginPage />} />
            </Route>
        </Routes>
    );
}
