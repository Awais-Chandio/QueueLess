import { z } from 'zod';

// Fields a doctor may edit on their own record. Everything else on `doctors`
// (name, fee, license, center, status, ...) is admin-only and enforced by a DB trigger.
export const doctorSelfProfileSchema = z.object({
  specialty: z
    .string()
    .trim()
    .min(2, 'Specialty must be at least 2 characters.')
    .max(100, 'Specialty must be less than 100 characters.'),
  qualification: z
    .string()
    .trim()
    .min(2, 'Qualification must be at least 2 characters.')
    .max(150, 'Qualification must be less than 150 characters.'),
  bio: z.string().trim().max(1000, 'Bio must be less than 1000 characters.'),
});

export type DoctorSelfProfileData = z.infer<typeof doctorSelfProfileSchema>;
