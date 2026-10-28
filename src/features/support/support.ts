import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

// MediQ's own WhatsApp support (platform_settings.support_whatsapp, set by the
// platform admin on the web /admin page; get_support_contact in
// 20261028100200_billing_claims.sql). Help only: never a plan or payment link.

export type SupportContact = { whatsapp?: string };

/** The opening line of the chat: who is asking, nothing about buying. */
export const SUPPORT_GREETING = 'Assalam o Alaikum, mujhe MediQ app mein madad chahiye.';

/** 03001234567 -> "0300 1234567" for reading out. */
export const formatMobile = (number: string) => number.replace(/^(\d{4})(\d{7})$/, '$1 $2');

/** wa.me link for a Pakistani mobile (03XXXXXXXXX -> 923XXXXXXXXX), with the greeting. */
export const whatsappLink = (number: string, text: string = SUPPORT_GREETING) => {
  const digits = number.replace(/\D/g, '').replace(/^0(3\d{9})$/, '92$1');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
};

export const useSupportContact = (enabled: boolean) =>
  useQuery({
    queryKey: ['support-contact'],
    enabled,
    staleTime: 60 * 60_000,
    queryFn: async (): Promise<SupportContact> => {
      const { data, error } = await (supabase.rpc as unknown as (fn: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>)(
        'get_support_contact',
      );
      if (error) throw new Error(error.message);
      return (data as SupportContact | null) ?? {};
    },
  });
