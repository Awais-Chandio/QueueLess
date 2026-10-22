// Plan modules (supabase/migrations 20261021120600_plans.sql). The server
// decides what is allowed (has_module in every module RPC); the app only uses
// this to show an "Upgrade" card instead of a feature that would be refused.

export type PlanModule = 'queue' | 'qr_join' | 'online_booking' | 'sms' | 'whatsapp' | 'analytics' | 'multi_center';

export const MODULE_INFO: Record<PlanModule, { title: string; pitch: string }> = {
  queue: { title: 'Live queue', pitch: 'Walk-in tokens, call next and the TV display.' },
  qr_join: { title: 'QR join', pitch: 'Patients scan the poster and take a token from their phone.' },
  online_booking: { title: 'Online booking', pitch: 'Patients book a token before they leave home.' },
  sms: { title: 'SMS alerts', pitch: 'Token link, "3 ahead" and "your turn" by SMS, in Urdu or English.' },
  whatsapp: { title: 'WhatsApp alerts', pitch: 'The same alerts on WhatsApp.' },
  analytics: { title: 'Clinic insights', pitch: 'Patients per day, average wait and no-shows.' },
  multi_center: { title: 'More branches', pitch: 'Run several clinics from one account.' },
};

/** Plans that include a module, cheapest first (mirrors the plans table). */
export const PLANS_WITH: Record<PlanModule, string[]> = {
  queue: ['Free', 'Clinic', 'Pro', 'Center'],
  qr_join: ['Free', 'Clinic', 'Pro', 'Center'],
  online_booking: ['Clinic', 'Pro', 'Center'],
  sms: ['Clinic', 'Pro', 'Center'],
  whatsapp: ['Pro', 'Center'],
  analytics: ['Pro', 'Center'],
  multi_center: ['Center'],
};

export const hasModule = (plan: { modules: string[] } | null | undefined, module: PlanModule) =>
  !!plan?.modules.includes(module);

/** PostgREST maps the database's PT402 to HTTP 402; supabase-js keeps the code. */
export const isPlanLimitError = (error: unknown) =>
  !!error && typeof error === 'object' && (error as { code?: string }).code === 'PT402';

export type TokenLimit =
  | { level: 'unlimited' }
  | { level: 'ok' | 'near' | 'reached'; used: number; limit: number; left: number };

/** Daily token allowance: "near" from 80% used, "reached" at the limit. */
export const tokenLimit = (used: number, limit: number | null | undefined): TokenLimit => {
  if (limit == null) return { level: 'unlimited' };
  const left = Math.max(0, limit - used);
  const level = left === 0 ? 'reached' : used >= Math.ceil(limit * 0.8) ? 'near' : 'ok';
  return { level, used, limit, left };
};

export const tokenLimitMessage = (limit: TokenLimit) => {
  if (limit.level === 'reached') {
    return `Today's ${limit.limit} free tokens are used. New patients can't get a token until tomorrow unless the clinic owner upgrades the plan.`;
  }
  if (limit.level === 'near') {
    return `${limit.left} of today's ${limit.limit} free tokens left. Ask the clinic owner to upgrade for unlimited tokens.`;
  }
  return null;
};
