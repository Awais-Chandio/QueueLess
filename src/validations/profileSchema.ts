import { z } from 'zod';

export const profileSchema = z.object({
  full_name: z
    .string()
    .min(1, 'Full name is required')
    .max(100, 'Name must be less than 100 characters'),
  phone: z
    .string()
    .max(15, 'Phone number is too long')
    .regex(/^[0-9+-]*$/, 'Phone can only contain numbers, + and -')
    .optional()
    .or(z.literal('')),
});

export type ProfileFormData = z.infer<typeof profileSchema>;
