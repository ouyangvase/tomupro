export type DriverTabId = 'inbox' | 'pickups' | 'returns' | 'stock' | 'analytics';

export const driverTabPath = (tab: DriverTabId) => `/delivery/${tab}`;
