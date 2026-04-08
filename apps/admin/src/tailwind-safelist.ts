// This file exists solely to force Tailwind CSS v4's extraction engine to generate 
// utility classes that are dynamically used or hidden deep inside external pre-bundled 
// node_modules (such as @pixpilot/shadcn used by @wordrhyme/auto-crud).

// The classes below are the exact sliding animation utilities used by the 
// external Switch component that failed to scan due to pnpm symlink boundaries.
export const autoCrudSafelist = [
    'data-[state=checked]:bg-primary-foreground',
    'data-[state=checked]:translate-x-[calc(100%-2px)]',
    'data-[state=unchecked]:translate-x-0',
];
