'use client';

import dynamic from 'next/dynamic';

/** The virtualizer and the client card code load only for a household above the threshold, not with every list. */
export const LazyVirtualPropertyList = dynamic(() => import('./virtual-property-list').then((module) => module.VirtualPropertyList));
