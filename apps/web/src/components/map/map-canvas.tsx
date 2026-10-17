'use client';

import { CloudOff, RotateCw } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { Component, useState, useSyncExternalStore, type ReactNode } from 'react';
import { buttonVariants } from '@/components/ui/button-variants';
import type { MapStatus, MapSurfaceProps } from './map-surface';

function MapLoading() {
  const t = useTranslations('map');
  return (
    <div role="status" className="flex size-full items-center justify-center text-body text-ink-muted">
      {t('loading')}
    </div>
  );
}

/** SPEC §7.2: MapLibre, terra-draw and the tiles load only once the map view renders, never with the list. */
const MapSurface = dynamic(() => import('./map-surface'), { ssr: false, loading: MapLoading });

class MapErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function subscribeOnline(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

const useOnline = () =>
  useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );

export function MapCanvas(props: Omit<MapSurfaceProps, 'onStatus'>) {
  const t = useTranslations('map');
  const [status, setStatus] = useState<MapStatus>('loading');
  const online = useOnline();
  const notice = !online ? t('offline') : status === 'tiles_failed' ? t('tilesFailed') : null;

  return (
    <div className="relative size-full bg-surface-2">
      <MapErrorBoundary
        fallback={
          <div role="alert" className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="max-w-sm text-body text-ink">{t('loadFailed')}</p>
            <button type="button" onClick={() => window.location.reload()} className={buttonVariants({ variant: 'outline' })}>
              <RotateCw aria-hidden="true" />
              {t('retry')}
            </button>
          </div>
        }
      >
        <MapSurface {...props} onStatus={setStatus} />
      </MapErrorBoundary>
      {notice === null ? null : (
        <p
          role="status"
          className="absolute top-3 left-3 right-16 flex items-start gap-2 rounded-md border border-rule bg-surface px-3 py-2 text-small text-ink shadow-card"
        >
          <CloudOff className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden="true" />
          {notice}
        </p>
      )}
    </div>
  );
}
