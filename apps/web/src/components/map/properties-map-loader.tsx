'use client';

import dynamic from 'next/dynamic';

/**
 * The page imports only this, so the list view's JS carries none of the map island, its next-intl runtime or turf
 * (SPEC §7.2); the island's chunk loads when `?view=map` renders it, and MapLibre loads later still, from `MapCanvas`.
 */
export const PropertiesMapLoader = dynamic(() => import('./properties-map').then((module) => module.PropertiesMap));
