import { z } from 'zod';

// Staff contact numbers in the admin flows are Pakistani mobile numbers. The
// app's existing doctor forms use the 03XXXXXXXXX format, while phone auth also
// accepts the equivalent +923XXXXXXXXX representation.
export const pakistanMobileSchema = z
  .string()
  .trim()
  .min(1, 'Mobile number is required.')
  .refine(value => {
    const compact = value.replace(/[\s()-]/g, '');
    return /^(?:\+92|0092|0)3\d{9}$/.test(compact);
  }, 'Enter a valid Pakistani mobile number (for example, 03001234567).');

export const staffFormSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, 'Full name must be at least 2 characters.')
    .max(100, 'Full name must be less than 100 characters.'),
  email: z
    .string()
    .trim()
    .min(1, 'Email is required.')
    .email('Enter a valid email address.'),
  phone: pakistanMobileSchema,
  center_ids: z.array(z.string().uuid()).min(1, 'Select at least one service center.'),
});

export type StaffFormData = z.infer<typeof staffFormSchema>;
