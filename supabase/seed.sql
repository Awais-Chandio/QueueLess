-- Local development seed, loaded by `supabase db reset` after migrations.
-- Never run against production. Contains public reference data only (no users,
-- no patient data). Source: archive/migrations/20260724175500_hyderabad_hospitals_map_seed.sql
-- and archive/migrations/20260929162000_repair_clinic_image_urls.sql.

-- Hyderabad, Sindh hospitals for the map experience.
INSERT INTO public.service_centers (
  id,
  name,
  description,
  city,
  address,
  category,
  latitude,
  longitude,
  open_time,
  close_time,
  image_url
)
VALUES
  (
    '521f1349-05c4-4417-9fa5-5289963af7db',
    'Liaquat University Hospital',
    'A government tertiary-care and teaching hospital providing medical, surgical, diagnostic, and emergency services in Hyderabad.',
    'Hyderabad',
    'Hospital Road, Civil Hospital, Hyderabad, Sindh',
    'Government Hospital',
    25.4002584,
    68.3676745,
    '00:00:00'::time,
    '23:59:59'::time,
    'https://www.luh.gos.pk/assets_2/header.jpg'
  ),
  (
    'd2c1a3df-bb89-4fde-b73d-5bb9ec763481',
    'Aga Khan Maternal and Child Care Centre',
    'A women and children hospital providing maternity, paediatric, family-medicine, diagnostic, ambulance, and 24/7 urgent-care services.',
    'Hyderabad',
    'Plot 4/2, Main Jamshoro Road, Hyderabad, Sindh',
    'Women & Children Hospital',
    25.4125302,
    68.3544606,
    '00:00:00'::time,
    '23:59:59'::time,
    'https://hospitals.aku.edu/Pakistan/Hyderabad/hyd/Hyderabad.jpg'
  ),
  (
    '07d39e17-af18-45c1-9574-28d59d6a3c65',
    'Red Crescent General Hospital',
    'A general hospital operated by Pakistan Red Crescent, offering emergency, outpatient, maternity, paediatric, diagnostic, and surgical services.',
    'Hyderabad',
    'Opposite Nursery Park, Unit 6, Latifabad, Hyderabad, Sindh',
    'General Hospital',
    25.3682693,
    68.3523961,
    '00:00:00'::time,
    '23:59:59'::time,
    'https://www.prcshyd.org.pk/assets/images/slider-1.webp'
  ),
  (
    '89ec7fde-e4d8-4b99-993f-f47525cd3a68',
    'St. Elizabeth Hospital',
    'A charitable general hospital with a special focus on mother and child care, emergency care, nursing, midwifery, and community outreach.',
    'Hyderabad',
    'Unit 7, Latifabad, Hyderabad, Sindh 71000',
    'Charitable Hospital',
    25.3725535,
    68.3559859,
    '00:00:00'::time,
    '23:59:59'::time,
    'https://st-elizabethhyderabad.com/wp-content/uploads/2026/03/Group-8-e1773126019305.png'
  )
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  city = EXCLUDED.city,
  address = EXCLUDED.address,
  category = EXCLUDED.category,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  open_time = EXCLUDED.open_time,
  close_time = EXCLUDED.close_time,
  image_url = EXCLUDED.image_url;

-- Replace dead clinic image links with verified facility photos.
UPDATE public.service_centers
SET image_url = CASE id
  WHEN '521f1349-05c4-4417-9fa5-5289963af7db'::uuid THEN
    'https://www.thenews.com.pk/assets/uploads/akhbar/2024-05-27/1193657_3628890_kfj_akhbar.jpg'
  WHEN 'd2c1a3df-bb89-4fde-b73d-5bb9ec763481'::uuid THEN
    'https://a.storyblok.com/f/286308248262721/1750937/d1ad698925/52f28790-7e5e-4edc-b5fa-13a0292fabbc.jpg'
  ELSE image_url
END
WHERE id IN (
  '521f1349-05c4-4417-9fa5-5289963af7db'::uuid,
  'd2c1a3df-bb89-4fde-b73d-5bb9ec763481'::uuid
);

-- ---------------------------------------------------------------------------
-- Local test accounts and today's appointments (used by supabase/tests/*.sql).
-- Every account's password is: password123
--
--   role     email                    center
--   admin    admin@mediq.test         -
--   staff    staff.a@mediq.test       A = Liaquat University Hospital
--   staff    staff.b@mediq.test       B = Aga Khan Maternal and Child Care Centre
--   doctor   doctor.a@mediq.test      A
--   doctor   doctor.b@mediq.test      B
--   client   patient.1@mediq.test     -
--   client   patient.2@mediq.test     -
--   client   owner.a@mediq.test       owner of center A's organization (Phase 1A)
-- ---------------------------------------------------------------------------

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
SELECT
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt('password123', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', u.full_name),
  now(), now(), '', '', '', ''
FROM (VALUES
  ('a0000000-0000-4000-8000-000000000001'::uuid, 'admin@mediq.test',     'Test Admin'),
  ('a0000000-0000-4000-8000-000000000002'::uuid, 'staff.a@mediq.test',   'Staff A'),
  ('a0000000-0000-4000-8000-000000000003'::uuid, 'staff.b@mediq.test',   'Staff B'),
  ('a0000000-0000-4000-8000-000000000004'::uuid, 'doctor.a@mediq.test',  'Dr. A'),
  ('a0000000-0000-4000-8000-000000000005'::uuid, 'doctor.b@mediq.test',  'Dr. B'),
  ('a0000000-0000-4000-8000-000000000006'::uuid, 'patient.1@mediq.test', 'Patient One'),
  ('a0000000-0000-4000-8000-000000000007'::uuid, 'patient.2@mediq.test', 'Patient Two'),
  ('a0000000-0000-4000-8000-000000000009'::uuid, 'owner.a@mediq.test',   'Owner A')
) AS u (id, email, full_name);

INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
SELECT gen_random_uuid(), u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now(), now()
FROM auth.users u
WHERE u.email LIKE '%@mediq.test';

-- handle_new_user() created 'client' profiles; promote the non-patients.
UPDATE public.profiles p
SET role = v.role, center_id = v.center_id
FROM (VALUES
  ('a0000000-0000-4000-8000-000000000001'::uuid, 'admin',  NULL::uuid),
  ('a0000000-0000-4000-8000-000000000002'::uuid, 'staff',  '521f1349-05c4-4417-9fa5-5289963af7db'::uuid),
  ('a0000000-0000-4000-8000-000000000003'::uuid, 'staff',  'd2c1a3df-bb89-4fde-b73d-5bb9ec763481'::uuid),
  ('a0000000-0000-4000-8000-000000000004'::uuid, 'doctor', '521f1349-05c4-4417-9fa5-5289963af7db'::uuid),
  ('a0000000-0000-4000-8000-000000000005'::uuid, 'doctor', 'd2c1a3df-bb89-4fde-b73d-5bb9ec763481'::uuid)
) AS v (id, role, center_id)
WHERE p.id = v.id;

INSERT INTO public.staff_centers (profile_id, center_id) VALUES
  ('a0000000-0000-4000-8000-000000000002', '521f1349-05c4-4417-9fa5-5289963af7db'),
  ('a0000000-0000-4000-8000-000000000003', 'd2c1a3df-bb89-4fde-b73d-5bb9ec763481');

-- Phase 1A: centers got a default organization each (service_centers trigger).
-- Owner A owns center A's organization; staff/doctor memberships come from the
-- staff_centers / doctors sync triggers.
INSERT INTO public.org_members (organization_id, user_id, role)
SELECT organization_id, 'a0000000-0000-4000-8000-000000000009', 'owner'
FROM public.service_centers WHERE id = '521f1349-05c4-4417-9fa5-5289963af7db'
ON CONFLICT DO NOTHING;

INSERT INTO public.services (id, center_id, name, duration_minutes, price) VALUES
  ('50000000-0000-4000-8000-00000000000a', '521f1349-05c4-4417-9fa5-5289963af7db', 'General OPD', 15, 500),
  ('50000000-0000-4000-8000-00000000000b', 'd2c1a3df-bb89-4fde-b73d-5bb9ec763481', 'Paediatrics', 15, 800);

INSERT INTO public.doctors (id, center_id, profile_id, name, specialty, experience_years, fee) VALUES
  ('d0000000-0000-4000-8000-00000000000a', '521f1349-05c4-4417-9fa5-5289963af7db', 'a0000000-0000-4000-8000-000000000004', 'Dr. A', 'General Physician', 8, 1000),
  ('d0000000-0000-4000-8000-00000000000b', 'd2c1a3df-bb89-4fde-b73d-5bb9ec763481', 'a0000000-0000-4000-8000-000000000005', 'Dr. B', 'Paediatrician', 5, 1500);

INSERT INTO public.doctor_services (doctor_id, service_id) VALUES
  ('d0000000-0000-4000-8000-00000000000a', '50000000-0000-4000-8000-00000000000a'),
  ('d0000000-0000-4000-8000-00000000000b', '50000000-0000-4000-8000-00000000000b');

-- Open all day, every day, so booking works whenever the stack is used.
INSERT INTO public.doctor_schedules (doctor_id, day_of_week, start_time, end_time)
SELECT d.id, dow, '00:00', '23:59'
FROM (VALUES ('d0000000-0000-4000-8000-00000000000a'::uuid), ('d0000000-0000-4000-8000-00000000000b'::uuid)) AS d (id)
CROSS JOIN generate_series(0, 6) AS dow;

-- Today's appointments (token numbers come from the token trigger).
INSERT INTO public.appointments (id, user_id, center_id, service_id, doctor_id, appointment_date, appointment_time, scheduled_at, status)
SELECT a.id, a.user_id, a.center_id, a.service_id, a.doctor_id, CURRENT_DATE, a.t,
       (CURRENT_DATE + a.t) AT TIME ZONE 'Asia/Karachi', a.status
FROM (VALUES
  -- center A / Dr. A
  ('e0000000-0000-4000-8000-000000000001'::uuid, 'a0000000-0000-4000-8000-000000000006'::uuid, '521f1349-05c4-4417-9fa5-5289963af7db'::uuid, '50000000-0000-4000-8000-00000000000a'::uuid, 'd0000000-0000-4000-8000-00000000000a'::uuid, '09:00'::time, 'confirmed'),
  ('e0000000-0000-4000-8000-000000000002'::uuid, 'a0000000-0000-4000-8000-000000000007'::uuid, '521f1349-05c4-4417-9fa5-5289963af7db'::uuid, '50000000-0000-4000-8000-00000000000a'::uuid, 'd0000000-0000-4000-8000-00000000000a'::uuid, '09:15'::time, 'pending'),
  -- center B / Dr. B
  ('e0000000-0000-4000-8000-000000000003'::uuid, 'a0000000-0000-4000-8000-000000000007'::uuid, 'd2c1a3df-bb89-4fde-b73d-5bb9ec763481'::uuid, '50000000-0000-4000-8000-00000000000b'::uuid, 'd0000000-0000-4000-8000-00000000000b'::uuid, '10:00'::time, 'confirmed'),
  ('e0000000-0000-4000-8000-000000000004'::uuid, 'a0000000-0000-4000-8000-000000000006'::uuid, 'd2c1a3df-bb89-4fde-b73d-5bb9ec763481'::uuid, '50000000-0000-4000-8000-00000000000b'::uuid, 'd0000000-0000-4000-8000-00000000000b'::uuid, '10:15'::time, 'checked_in')
) AS a (id, user_id, center_id, service_id, doctor_id, t, status);
