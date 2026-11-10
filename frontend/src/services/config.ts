export type DataMode = 'demo' | 'api';
export const DATA_MODE: DataMode = import.meta.env.VITE_DATA_MODE === 'api' ? 'api' : 'demo';
export const isDemoMode: boolean = DATA_MODE === 'demo';
