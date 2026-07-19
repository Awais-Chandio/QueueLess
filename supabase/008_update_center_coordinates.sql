-- 008_update_center_coordinates.sql
-- Run this in the Supabase Dashboard SQL Editor (https://supabase.com/dashboard/project/latdblyyakjrwzgxdean/sql/new)

UPDATE public.service_centers
SET
  latitude = CASE
    WHEN name = 'City Lab' THEN 24.9180
    WHEN name = 'MediCare Center' THEN 24.8162
    WHEN name = 'FastTrack NADRA Center' THEN 24.9372
    ELSE 24.8607 + (random() - 0.5) * 0.1
  END,
  longitude = CASE
    WHEN name = 'City Lab' THEN 67.0971
    WHEN name = 'MediCare Center' THEN 67.0645
    WHEN name = 'FastTrack NADRA Center' THEN 67.0371
    ELSE 67.0011 + (random() - 0.5) * 0.1
  END,
  image_url = CASE
    WHEN name = 'City Lab' THEN 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&q=80&w=500'
    WHEN name = 'MediCare Center' THEN 'https://images.unsplash.com/photo-1586773860418-d37222d8fce3?auto=format&fit=crop&q=80&w=500'
    WHEN name = 'FastTrack NADRA Center' THEN 'https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&q=80&w=500'
    ELSE 'https://images.unsplash.com/photo-1586773860418-d37222d8fce3?auto=format&fit=crop&q=80&w=500'
  END;

-- Grant UPDATE privilege on service_centers to authenticated user role for flexibility
GRANT UPDATE ON public.service_centers TO authenticated;
