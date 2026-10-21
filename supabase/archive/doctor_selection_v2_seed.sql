-- Seed Script: Add Mock Doctors, Services, and Schedules
-- Run this in the Supabase Dashboard SQL Editor.

-- Insert Doctors for City Care Hospital (2affd37a-d784-4f90-9760-49a9067f4554)
-- and City Lab (4f74136a-d090-4c96-bc24-37cc1013813a)
INSERT INTO public.doctors (id, center_id, name, specialty, qualification, experience_years, bio, is_active, is_on_break)
VALUES
  (
    'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
    '2affd37a-d784-4f90-9760-49a9067f4554', -- City Care Hospital
    'Dr. Sarah Ahmed',
    'General Physician',
    'MBBS, FCPS (Medicine)',
    10,
    'Dr. Sarah Ahmed is an expert general physician specializing in family medicine and chronic care.',
    true,
    false
  ),
  (
    'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e',
    '2affd37a-d784-4f90-9760-49a9067f4554', -- City Care Hospital
    'Dr. Ali Khan',
    'Pediatrician',
    'MBBS, MD (Pediatrics)',
    8,
    'Dr. Ali Khan has over 8 years of experience caring for children and newborns, specializing in immunizations and child wellness.',
    true,
    false
  ),
  (
    'c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f',
    '4f74136a-d090-4c96-bc24-37cc1013813a', -- City Lab
    'Dr. Usman Malik',
    'Pathologist',
    'MBBS, M.Phil (Pathology)',
    12,
    'Dr. Usman Malik is the chief pathologist at City Lab, overseeing blood tests and diagnostic screening.',
    true,
    false
  )
ON CONFLICT (id) DO NOTHING;

-- Map Doctors to Services
-- Dr. Sarah: General Consultation (1745ede1-3ec6-4850-ba93-6308190aebb7) & Vaccination (e9074ecf-a0d7-42f4-acdb-e8bf2065c052)
-- Dr. Ali: Vaccination (e9074ecf-a0d7-42f4-acdb-e8bf2065c052) & General Consultation (1745ede1-3ec6-4850-ba93-6308190aebb7)
-- Dr. Usman: Blood Test (bfc74240-827b-469d-ad72-94e8838c0da3) & X-Ray (bb903150-4d35-4975-8edf-21ab8c649246)
INSERT INTO public.doctor_services (doctor_id, service_id)
VALUES
  ('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', '1745ede1-3ec6-4850-ba93-6308190aebb7'),
  ('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 'e9074ecf-a0d7-42f4-acdb-e8bf2065c052'),
  ('b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e', 'e9074ecf-a0d7-42f4-acdb-e8bf2065c052'),
  ('b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e', '1745ede1-3ec6-4850-ba93-6308190aebb7'),
  ('c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f', 'bfc74240-827b-469d-ad72-94e8838c0da3'),
  ('c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f', 'bb903150-4d35-4975-8edf-21ab8c649246')
ON CONFLICT (doctor_id, service_id) DO NOTHING;

-- Set up recurring weekly schedules for all doctors (days 0-6 represent Sunday-Saturday)
-- We will seed Monday to Saturday (days 1 to 6)
INSERT INTO public.doctor_schedules (doctor_id, day_of_week, start_time, end_time, max_tokens_per_day)
VALUES
  -- Dr. Sarah (Monday to Friday, 9:00 AM - 5:00 PM)
  ('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 1, '09:00:00', '17:00:00', 40),
  ('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 2, '09:00:00', '17:00:00', 40),
  ('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 3, '09:00:00', '17:00:00', 40),
  ('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 4, '09:00:00', '17:00:00', 40),
  ('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 5, '09:00:00', '17:00:00', 40),
  
  -- Dr. Ali (Monday to Saturday, 10:00 AM - 6:00 PM)
  ('b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e', 1, '10:00:00', '18:00:00', 30),
  ('b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e', 2, '10:00:00', '18:00:00', 30),
  ('b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e', 3, '10:00:00', '18:00:00', 30),
  ('b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e', 4, '10:00:00', '18:00:00', 30),
  ('b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e', 5, '10:00:00', '18:00:00', 30),
  ('b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e', 6, '10:00:00', '18:00:00', 30),
  
  -- Dr. Usman (Monday to Friday, 8:00 AM - 4:00 PM)
  ('c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f', 1, '08:00:00', '16:00:00', 50),
  ('c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f', 2, '08:00:00', '16:00:00', 50),
  ('c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f', 3, '08:00:00', '16:00:00', 50),
  ('c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f', 4, '08:00:00', '16:00:00', 50),
  ('c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f', 5, '08:00:00', '16:00:00', 50)
ON CONFLICT (doctor_id, day_of_week) DO NOTHING;

-- Seed Doctor Queue Settings
INSERT INTO public.doctor_queue_settings (doctor_id, current_token, average_consultation_time)
VALUES
  ('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 0, 10.0),
  ('b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e', 0, 12.0),
  ('c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f', 0, 8.0)
ON CONFLICT (doctor_id) DO NOTHING;
