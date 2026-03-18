export const PERMISSIONS = {
    products: {
        view: 'shop.products.view',
        create: 'shop.products.create',
        update: 'shop.products.update',
        delete: 'shop.products.delete',
        publish: 'shop.products.publish',
    },
    attributes: {
        view: 'shop.attributes.view',
        create: 'shop.attributes.create',
        update: 'shop.attributes.update',
        delete: 'shop.attributes.delete',
    },
    categories: {
        view: 'shop.categories.view',
        create: 'shop.categories.create',
        update: 'shop.categories.update',
        delete: 'shop.categories.delete',
    },
    orders: {
        view: 'shop.orders.view',
        create: 'shop.orders.create',
        fulfill: 'shop.orders.fulfill',
        cancel: 'shop.orders.cancel',
        refund: 'shop.orders.refund',
    },
    settings: {
        update: 'shop.settings.update',
    },
    mappings: {
        view: 'shop.mappings.view',
        manage: 'shop.mappings.manage',
    },
    images: {
        manage: 'shop.images.manage',
    },
} as const;
