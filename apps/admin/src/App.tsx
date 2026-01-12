import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './lib/auth';
import { OrgAdminRoute } from './components/OrgAdminRoute';
import { DashboardPage } from './pages/Dashboard';
import { PluginsPage } from './pages/Plugins';
import { SettingsPage } from './pages/Settings';
import { SystemSettingsPage } from './pages/SystemSettings';
import { FeatureFlagsPage } from './pages/FeatureFlags';
import { PluginPage } from './pages/PluginPage';
import { LoginPage } from './pages/Login';
import { MembersPage } from './pages/Members';
import { MemberDetailPage } from './pages/MemberDetail';
import { InvitationsPage } from './pages/Invitations';
import { PlatformUsersPage } from './pages/PlatformUsers';
import { RolesPage } from './pages/Roles';
import { RoleDetailPage } from './pages/RoleDetail';
import { NotificationsPage } from './pages/Notifications';
import { NotificationPreferencesPage } from './pages/NotificationPreferences';
import { NotificationTemplatesPage } from './pages/NotificationTemplates';
import { NotificationTestPage } from './pages/NotificationTest';
import { FilesPage } from './pages/Files';
import { AssetsPage } from './pages/Assets';
import { AuditLogsPage } from './pages/AuditLogs';
import CacheManagement from './pages/CacheManagement';
import PluginHealth from './pages/PluginHealth';
import { WebhooksPage } from './pages/Webhooks';
import { WebhookDetailPage } from './pages/WebhookDetail';

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
                <Route
                    path="roles"
                    element={
                        <OrgAdminRoute>
                            <RolesPage />
                        </OrgAdminRoute>
                    }
                />
                <Route
                    path="roles/:roleId"
                    element={
                        <OrgAdminRoute>
                            <RoleDetailPage />
                        </OrgAdminRoute>
                    }
                />
                <Route path="platform/users" element={<PlatformUsersPage />} />
                <Route path="platform/settings" element={<SystemSettingsPage />} />
                <Route path="platform/feature-flags" element={<FeatureFlagsPage />} />
                <Route path="notifications" element={<NotificationsPage />} />
                <Route path="notifications/preferences" element={<NotificationPreferencesPage />} />
                <Route path="notifications/templates" element={<NotificationTemplatesPage />} />
                <Route path="notifications/test" element={<NotificationTestPage />} />
                <Route path="webhooks" element={<WebhooksPage />} />
                <Route path="webhooks/:id" element={<WebhookDetailPage />} />
                <Route path="files" element={<FilesPage />} />
                <Route path="assets" element={<AssetsPage />} />
                <Route path="platform/cache" element={<CacheManagement />} />
                <Route path="platform/plugin-health" element={<PluginHealth />} />
                <Route path="platform/audit" element={<AuditLogsPage />} />
                <Route path="settings" element={<SettingsPage />} />
                {/* Dynamic plugin routes - /p/:pluginId/* */}
                <Route path="p/:pluginId/*" element={<PluginPage />} />
            </Route>
        </Routes>
    );
}
