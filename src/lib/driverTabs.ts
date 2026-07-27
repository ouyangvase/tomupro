export type DriverTabId = 'inbox' | 'pickups' | 'returns' | 'stock' | 'analytics';

export const DRIVER_TAB_CHANGE_EVENT = 'tomu:driver-tab-change';

export const driverTabPath = (tab: DriverTabId) =>
  tab === 'inbox' ? '/delivery' : `/delivery/${tab}`;

export const emitDriverTabChange = (tab: DriverTabId) => {
  window.dispatchEvent(new CustomEvent<DriverTabId>(DRIVER_TAB_CHANGE_EVENT, { detail: tab }));
};
