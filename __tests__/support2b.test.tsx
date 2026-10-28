/**
 * 2B changes: the Help button (MediQ support on WhatsApp), Basic = 10 tokens a
 * day, and no purchase links anywhere in the app (Google Play).
 */
import React from 'react';
import { Linking } from 'react-native';
import ReactTestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../src/lib/supabase', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));
// moti's skeleton resolves its own React copy under Jest (see skeletonResolution.test.ts).
jest.mock('../src/components/ui/Skeleton', () => ({ Skeleton: () => null }));

import { supabase } from '../src/lib/supabase';
import { HelpButton } from '../src/features/support/HelpButton';
import { SUPPORT_GREETING, formatMobile, whatsappLink } from '../src/features/support/support';
import { BASIC_TOKENS_PER_DAY, planBannerText } from '../src/features/plans/modules';

declare const __dirname: string;
const rpc = supabase.rpc as unknown as jest.Mock;
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

// No retries, no garbage-collection timers (they keep Jest from exiting).
const testClient = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });

const byId = (root: ReactTestInstance, id: string) => root.findAll(node => node.props.testID === id)[0];
const has = (root: ReactTestInstance, id: string) => root.findAll(node => node.props.testID === id).length > 0;
const texts = (root: ReactTestInstance) =>
  root
    .findAll(node => (node.type as unknown) === 'Text')
    .map(node => [node.props.children].flat().join(''))
    .join(' | ');

const renderHelp = async () => {
  const client = testClient();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(
      <QueryClientProvider client={client}>
        <SafeAreaProvider initialMetrics={metrics}>
          <HelpButton />
        </SafeAreaProvider>
      </QueryClientProvider>,
    );
  });
  const root = renderer.root;
  await act(async () => {
    byId(root, 'help-button').props.onPress();
  });
  // let the query settle
  await act(async () => {
    await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
  });
  return { root, renderer };
};

describe('WhatsApp support link', () => {
  it('turns a Pakistani mobile into wa.me with the greeting', () => {
    expect(whatsappLink('03009998877')).toBe(`https://wa.me/923009998877?text=${encodeURIComponent(SUPPORT_GREETING)}`);
    expect(formatMobile('03009998877')).toBe('0300 9998877');
  });

  it('the greeting asks for help, nothing about buying', () => {
    expect(SUPPORT_GREETING).not.toMatch(/plan|buy|pay|price|kharid/i);
  });
});

describe('Help button', () => {
  beforeEach(() => rpc.mockReset());

  it('shows MediQ support and opens WhatsApp', async () => {
    rpc.mockResolvedValue({ data: { whatsapp: '03009998877' }, error: null });
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const { root, renderer } = await renderHelp();
    expect(rpc).toHaveBeenCalledWith('get_support_contact');
    expect(texts(root)).toContain('0300 9998877');
    await act(async () => {
      await byId(root, 'help-whatsapp').props.onPress();
    });
    expect(open).toHaveBeenCalledWith(whatsappLink('03009998877'));
    expect(texts(root)).not.toMatch(/upgrade|buy|choose a plan|pay now|\/settings\/plan/i);
    act(() => renderer.unmount());
  });

  it('no number yet: says so, no button', async () => {
    rpc.mockResolvedValue({ data: {}, error: null });
    const { root, renderer } = await renderHelp();
    expect(has(root, 'help-unavailable')).toBe(true);
    expect(has(root, 'help-whatsapp')).toBe(false);
    act(() => renderer.unmount());
  });

  it('only asks the server when opened', async () => {
    rpc.mockResolvedValue({ data: {}, error: null });
    const client = testClient();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <QueryClientProvider client={client}>
          <SafeAreaProvider initialMetrics={metrics}>
            <HelpButton />
          </SafeAreaProvider>
        </QueryClientProvider>,
      );
    });
    expect(rpc).not.toHaveBeenCalled();
    act(() => renderer.unmount());
  });
});

describe('Basic plan', () => {
  it('is 10 tokens a day, as in the plans table', () => {
    expect(BASIC_TOKENS_PER_DAY).toBe(10);
    const fs = require('fs') as { readFileSync(p: string, e: string): string };
    const path = require('path') as { join(...p: string[]): string };
    const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20261028100000_plans_v2.sql'), 'utf8');
    expect(sql).toContain(`('basic', 'Basic', 0, ARRAY['queue', 'qr_join'], ${BASIC_TOKENS_PER_DAY}, 1, 1, true, 1)`);
    expect(
      planBannerText({
        plan_id: 'basic',
        plan_name: 'Basic',
        status: 'active',
        trial_ends_at: null,
        period_end: null,
        lapses: false,
        grace_ends_at: null,
        days_left: null,
        banner: 'basic',
        is_owner: true,
      }),
    ).toContain('10 tokens');
  });
});

describe('no purchase links in the app (Google Play)', () => {
  const fs = require('fs') as {
    readFileSync(p: string, e: string): string;
    readdirSync(p: string, o: { withFileTypes: true }): { name: string; isDirectory(): boolean }[];
  };
  const path = require('path') as { join(...p: string[]): string };
  const files = (dir: string): string[] =>
    fs
      .readdirSync(dir, { withFileTypes: true })
      .flatMap(e => (e.isDirectory() ? files(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : []));

  it('no file links to the plan page, plan claims or a payment page', () => {
    const offending = files(path.join(__dirname, '..', 'src'))
      .filter(f => !f.endsWith('database.types.ts'))
      .filter(f => /settings\/plan|plan-claim|pay-claim|submit_billing_claim|get_plan_page/.test(fs.readFileSync(f, 'utf8')));
    expect(offending).toEqual([]);
  });
});
