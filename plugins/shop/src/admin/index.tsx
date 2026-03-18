import { navExtension, settingsExtension } from '@wordrhyme/plugin';
import { ProductsPage } from './pages/ProductsPage';
import { OrdersPage } from './pages/OrdersPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { AttributesPage } from './pages/AttributesPage';
import { ShopSettings } from './pages/ShopSettings';

export const extensions = [
    navExtension({
        id: 'shop.products',
        label: 'Products',
        icon: 'Package',
        path: '/p/shop/products',
        order: 40,
        component: ProductsPage,
    }),
    navExtension({
        id: 'shop.orders',
        label: 'Orders',
        icon: 'ClipboardList',
        path: '/p/shop/orders',
        order: 41,
        component: OrdersPage,
    }),
    navExtension({
        id: 'shop.categories',
        label: 'Categories',
        icon: 'FolderTree',
        path: '/p/shop/categories',
        order: 42,
        component: CategoriesPage,
    }),
    navExtension({
        id: 'shop.attributes',
        label: 'Attributes',
        icon: 'Tags',
        path: '/p/shop/attributes',
        order: 43,
        component: AttributesPage,
    }),
    settingsExtension({
        id: 'shop.settings',
        label: 'Shop',
        order: 40,
        component: ShopSettings,
    }),
];

export async function init(): Promise<void> {
    console.log('[Shop Plugin] Admin UI initialized');
}

export default { extensions, init };
