import { MANAGE_ON_WEB, PLANS_WITH, planBannerText, tokenLimit, tokenLimitMessage, type PlanStatus } from '../src/features/plans/modules';
import { doctorSideNavigator, hasModeSwitch } from '../src/utils/roleMapping';

const status = (over: Partial<PlanStatus>): PlanStatus => ({
  plan_id: 'trial',
  plan_name: 'Trial',
  status: 'trialing',
  trial_ends_at: null,
  period_end: null,
  lapses: true,
  grace_ends_at: null,
  days_left: 14,
  banner: null,
  is_owner: true,
  ...over,
});

describe('plan banner (2B)', () => {
  it('trial: "Trial X din baaki" from day 10, last day said plainly', () => {
    expect(planBannerText(status({ banner: null, days_left: 14 }))).toBeNull();
    expect(planBannerText(status({ banner: 'trial', days_left: 4 }))).toBe('Trial 4 din baaki');
    expect(planBannerText(status({ banner: 'trial', days_left: 1 }))).toBe('Trial ka aakhri din');
  });

  it('renew, grace and basic', () => {
    expect(planBannerText(status({ plan_name: 'Pro', status: 'active', banner: 'renew', days_left: 5 }))).toContain('5 din');
    expect(planBannerText(status({ plan_name: 'Pro', status: 'past_due', banner: 'grace', days_left: 3 }))).toContain('Basic se pehle 3 din');
    expect(planBannerText(status({ plan_id: 'basic', status: 'active', banner: 'basic' }))).toContain('Basic');
    expect(planBannerText(null)).toBeNull();
  });

  it('the app never offers a purchase: plans are managed on the website', () => {
    expect(MANAGE_ON_WEB).toBe('Plan website par manage karein');
    expect(MANAGE_ON_WEB).not.toMatch(/https?:|www\./);
  });

  it('modules follow the 2B catalog', () => {
    expect(PLANS_WITH.fees).toEqual(['Solo', 'Pro', 'Center']);
    expect(PLANS_WITH.display).toEqual(['Solo', 'Pro', 'Center']);
    expect(PLANS_WITH.analytics).toEqual(['Pro', 'Center']);
    expect(PLANS_WITH.multi_center).toEqual(['Center']);
    expect(tokenLimitMessage(tokenLimit(30, 30))).toContain('Basic');
  });
});

describe('Clinic / Meri queue switch', () => {
  const ws = (roles: string[]) => [{ roles }];

  it('only an owner (or receptionist) who is also a doctor gets it', () => {
    expect(hasModeSwitch('doctor', ws(['doctor', 'owner']))).toBe(true);
    expect(hasModeSwitch('doctor', ws(['doctor']))).toBe(false);
    expect(hasModeSwitch('staff', ws(['owner']))).toBe(false);
  });

  it('picks the desk or the doctor app', () => {
    expect(doctorSideNavigator('doctor', ws(['doctor', 'owner']), 'clinic')).toBe('StaffNavigator');
    expect(doctorSideNavigator('doctor', ws(['doctor', 'owner']), 'doctor')).toBe('DoctorNavigator');
    expect(doctorSideNavigator('doctor', ws(['doctor']), 'clinic')).toBe('DoctorNavigator');
  });
});
