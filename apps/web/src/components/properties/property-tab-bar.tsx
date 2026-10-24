import { SectionTabs } from '@/components/shell/section-tabs';
import { PROPERTY_TABS, propertyTabHref, type PropertyTabId } from './property-tabs';

export function PropertyTabBar({ propertyId, active, label, labels }: { propertyId: string; active: PropertyTabId; label: string; labels: Record<PropertyTabId, string> }) {
  return <SectionTabs label={label} tabs={PROPERTY_TABS.map((tab) => ({ href: propertyTabHref(propertyId, tab), label: labels[tab.id], current: tab.id === active }))} />;
}
