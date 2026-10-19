'use client';

import dynamic from 'next/dynamic';

// The page imports every step, and the bundler puts every client component a page imports into its first load. Loaded
// through `next/dynamic` here, each step's client code (the review panel and its schemas, the forms) arrives only when
// that step renders, so the first step stays within SPEC §7.2's 200 KB.
export const LazyPropertyForm = dynamic(() => import('@/components/properties/property-form').then((module) => module.PropertyForm));
export const LazyReviewPanel = dynamic(() => import('@/components/extraction/review-panel').then((module) => module.ReviewPanel));
export const LazyOwnershipForm = dynamic(() => import('@/components/legal/ownership-form').then((module) => module.OwnershipForm));
export const LazyAddressConfirm = dynamic(() => import('./address-confirm').then((module) => module.AddressConfirm));
export const LazyStepUse = dynamic(() => import('./step-use').then((module) => module.StepUse));
export const LazyReviewReadyNotice = dynamic(() => import('./review-ready-notice').then((module) => module.ReviewReadyNotice));
