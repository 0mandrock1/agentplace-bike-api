export const SERVICES = ['diagnostics','basic_maintenance', 'puncture_repair', 'brake_adjustment', 'gear_adjustment'] as const;
export type Service = (typeof SERVICES)[number]

