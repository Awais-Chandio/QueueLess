import { z } from 'zod';

export const profileSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(1, 'Full name is required')
    .min(2, 'Full name must be at least 2 characters')
    .max(100, 'Name must be less than 100 characters'),
  phone: z
    .string()
    .trim()
    .min(7, 'Phone number is too short')
    .max(15, 'Phone number is too long')
    .regex(/^[0-9]*$/, 'Phone can only contain numbers')
    .optional()
    .or(z.literal('')),
});

export type ProfileFormData = z.infer<typeof profileSchema>;
