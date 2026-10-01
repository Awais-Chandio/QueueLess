-- Replace dead clinic image links with verified, real facility photos.
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
