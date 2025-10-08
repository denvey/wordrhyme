import { TBreadcrumbs } from '@components/breadcrumbs';
import { PageStickyHeader } from '@components/entity/entityEdit/components/EntityHeader';
import { LoadingStatus } from '@components/loadBox/LoadingStatus';
import { SideNavMobileButton } from '@components/sideNav/ResponsiveSideNav';
import { EDBEntity } from '@cromwell/core';
import { Box } from '@mui/material';
import React from 'react';
import { Route, Routes } from 'react-router-dom';

import { AdminSettingsContextProvider, useAdminSettings, useAdminSettingsContext } from './hooks/useAdminSettings';
import { SettingsIndexPage } from './pages';
import { ACLSettingsPage } from './pages/acl';
import { CodeSettingsPage } from './pages/code';
import { CustomEntitySettingsPage } from './pages/custom/CustomEntity';
import { CustomRoleSettingsPage } from './pages/custom/CustomRole';
import { DefaultEntitySettingsPage } from './pages/custom/DefaultEntity';
import { CustomDataPage } from './pages/customData';
import { GeneralSettingsPage } from './pages/general';
import { MigrationSettingsPage } from './pages/migration';
import { SEOSettingsPage } from './pages/seo';
import { StoreSettingsPage } from './pages/store';
import { ThemeListing } from './pages/Themes';

// import SettingsOld from "./SettingsOld"

export const SettingsPage = () => {
  const settings = useAdminSettingsContext();

  return (
    <div className="w-[100%] mx-auto max-w-[940px] p-3">
      <PageStickyHeader
        hideSaveButton={!settings.saveVisible}
        disableSaveButton={settings.saveDisabled}
        onSave={settings.onSave}
        sx={{
          maxWidth: '940px',
          width: '100%',
          padding: '10px 20px',
        }}
        leftContent={
          <Box className="flex">
            <SideNavMobileButton />
            <h1 className="flex items-center font-500 text-gray-700 h-8 text-base whitespace-nowrap md:h-9 md:text-xl lg:max-w-fit lg:h-10 lg:text-2xl">
              {!!settings.breadcrumbs?.length && <TBreadcrumbs path={settings.breadcrumbs} maxVisible={4} />}
            </h1>
          </Box>
        }
      />
      <div className="p-4 md:p-5 ">
        <Routes>
          <Route path={`general`} element={<GeneralSettingsPage />} />
          <Route path={`store`} element={<StoreSettingsPage />} />
          <Route path={`code`} element={<CodeSettingsPage />} />
          <Route path={`seo`} element={<SEOSettingsPage />} />
          <Route path={`acl`} element={<ACLSettingsPage />} />
          <Route path={`acl/:roleId`} element={<CustomRoleSettingsPage />} />
          <Route path={`custom-data`} element={<CustomDataPage />} />
          <Route path={`custom-data/product`} element={<DefaultEntitySettingsPage entityType={EDBEntity.Product} />} />
          <Route
            path={`custom-data/category`}
            element={<DefaultEntitySettingsPage entityType={EDBEntity.ProductCategory} />}
          />
          <Route path={`custom-data/post`} element={<DefaultEntitySettingsPage entityType={EDBEntity.Post} />} />
          <Route path={`custom-data/tag`} element={<DefaultEntitySettingsPage entityType={EDBEntity.Tag} />} />
          <Route path={`custom-data/user`} element={<DefaultEntitySettingsPage entityType={EDBEntity.User} />} />
          <Route path={`custom-data/general`} element={<DefaultEntitySettingsPage entityType={EDBEntity.CMS} />} />
          <Route path={`custom-data/:entityType`} element={<CustomEntitySettingsPage />} />
          <Route path={`migration`} element={<MigrationSettingsPage />} />
          <Route path={`themes`} element={<ThemeListing />} />
          <Route index element={<SettingsIndexPage />} />
        </Routes>
      </div>
      <LoadingStatus isActive={settings.saving} />
    </div>
  );
};

const SettingsPageLoader = ({ children }: { children?: any }) => {
  const { adminSettings } = useAdminSettings({});

  if (!adminSettings) {
    return (
      <>
        <h1 className="font-bold my-3 text-3xl inline-block">...</h1>
      </>
    );
  }

  return <>{children}</>;
};

export const SettingsPageWithProvider = () => {
  return (
    <AdminSettingsContextProvider>
      <SettingsPageLoader>
        <SettingsPage />
      </SettingsPageLoader>
    </AdminSettingsContextProvider>
  );
};

export default SettingsPageWithProvider;
// export default SettingsOld
