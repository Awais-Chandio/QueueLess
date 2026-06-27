import { z } from 'zod';

export const bookingSchema = z.object({
  serviceId: z
    .string({ required_error: 'Please select a service' })
    .uuid('Please select a valid service'),
  date: z
    .date({ required_error: 'Please select a date' })
    .refine(
      d => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return d >= today;
      },
      { message: 'Date cannot be in the past' }
    ),
  slot: z
    .string({ required_error: 'Please select a time slot' })
    .regex(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/, 'Please select a valid time slot'),
});

export type BookingFormData = z.infer<typeof bookingSchema>;
