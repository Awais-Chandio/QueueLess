// Plan modules (supabase/migrations 20261021120600_plans.sql, 2B catalog in
// 20261028100000_plans_v2.sql). The server decides what is allowed
// (has_module in every module RPC); the app only uses this to show an
// "Upgrade" card instead of a feature that would be refused.
//
// Google Play: the app is consumption-only. Plans are chosen and paid on the
// website; the app shows the plan and says so, with no link and no buy button.

export type PlanModule =
  | 'queue'
  | 'qr_join'
  | 'display'
  | 'fees'
  | 'online_booking'
  | 'sms'
  | 'whatsapp'
  | 'analytics'
  | 'multi_center';

/** Shown wherever the app would otherwise offer an upgrade. Plain text, never a link. */
export const MANAGE_ON_WEB = 'Plan website par manage karein';

export const MODULE_INFO: Record<PlanModule, { title: string; pitch: string }> = {
  queue: { title: 'Live queue', pitch: 'Walk-in tokens, call next and the TV display.' },
  qr_join: { title: 'QR join', pitch: 'Patients scan the poster and take a token from their phone.' },
  display: { title: 'TV display', pitch: 'Token numbers on the waiting-room TV, with sound.' },
  fees: { title: 'Fees + Hisaab', pitch: 'Fee before joining the line, online payments and daily records.' },
  online_booking: { title: 'Online booking', pitch: 'Patients book a token before they leave home.' },
  sms: { title: 'SMS alerts', pitch: 'Token link, "3 ahead" and "your turn" by SMS, in Urdu or English.' },
  whatsapp: { title: 'WhatsApp alerts', pitch: 'The same alerts on WhatsApp.' },
  analytics: { title: 'Clinic insights', pitch: 'Patients per day, average wait and no-shows.' },
  multi_center: { title: 'More branches', pitch: 'Run several clinics from one account.' },
};

/** Plans for sale that include a module, cheapest first (mirrors the plans table). */
export const PLANS_WITH: Record<PlanModule, string[]> = {
  queue: ['Basic', 'Solo', 'Pro', 'Center'],
  qr_join: ['Basic', 'Solo', 'Pro', 'Center'],
  display: ['Solo', 'Pro', 'Center'],
  fees: ['Solo', 'Pro', 'Center'],
  sms: ['Solo', 'Pro', 'Center'],
  online_booking: ['Pro', 'Center'],
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
    return `Today's ${limit.limit} tokens on the Basic plan are used. New patients can't get a token until tomorrow unless the clinic owner changes the plan.`;
  }
  if (limit.level === 'near') {
    return `${limit.left} of today's ${limit.limit} Basic plan tokens left. The clinic owner can choose a plan with unlimited tokens.`;
  }
  return null;
};

/** get_plan_status (2B): the plan and its banner. */
export type PlanStatus = {
  plan_id: string;
  plan_name: string;
  status: 'trialing' | 'active' | 'past_due' | null;
  trial_ends_at: string | null;
  period_end: string | null;
  lapses: boolean;
  grace_ends_at: string | null;
  days_left: number | null;
  banner: 'trial' | 'renew' | 'grace' | 'basic' | null;
  is_owner: boolean;
};

/**
 * The banner line, as on the web (trial from day 10, renew 5 days before a
 * paid plan ends, grace after it, Basic after a lapse). null = no banner.
 */
export const planBannerText = (status: PlanStatus | null | undefined): string | null => {
  if (!status?.banner) return null;
  const n = status.days_left ?? 0;
  switch (status.banner) {
    case 'trial':
      return n <= 1 ? 'Trial ka aakhri din' : `Trial ${n} din baaki`;
    case 'renew':
      return `${status.plan_name} plan ${n} din mein khatam`;
    case 'grace':
      return `${status.plan_name} plan khatam · Basic se pehle ${n} din`;
    case 'basic':
      return 'Basic plan: 1 doctor, 30 tokens roz';
  }
};
