import { useDashboard } from '@hooks/useDashboard';
import React from 'react';

import { WidgetPanel } from './widgetPanel';

export const SalesValueWidget = ({ isEditing = false, id = 'salesValue' }) => {
  const { stats, isLoadingStats, cstore } = useDashboard();

  return (
    <WidgetPanel isEditing={isEditing} id={id}>
      <div className="grid grid-cols-3 md:grid-cols-3">
        <div
          className="bg-cover mx-auto h-12 w-12 self-center"
          style={{ backgroundImage: 'url(/admin/static/dashboard-sales.png)' }}
        ></div>
        <div className={'col-span-2' + ' draggableCancel'}>
          <h3 className="block text-xl">Sales value</h3>
          <p
            className={`${isLoadingStats ? 'animate-pulse w-full rounded-md h-6 bg-gray-200' : 'font-bold text-xl'}`}
            id="pageViews"
          >
            {cstore.getActiveCurrencySymbol()}
            {isLoadingStats ? '' : stats?.salesValue}
          </p>
          <p
            className={`${
              isLoadingStats ? 'animate-pulse w-full rounded-md h-6 bg-gray-200' : ''
            } text-xs text-gray-500 m-0`}
          >
            {!isLoadingStats && <span>from {stats?.orders ?? 0} orders</span>}
          </p>
        </div>
      </div>
    </WidgetPanel>
  );
};
