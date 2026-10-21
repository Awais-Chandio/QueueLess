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
