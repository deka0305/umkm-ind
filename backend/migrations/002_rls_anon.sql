-- Beri akses penuh ke role anon untuk semua tabel aplikasi.
-- Alasan: app memakai anon key tanpa login (single-tenant, satu warung),
-- jadi tanpa policy ini semua INSERT/UPDATE ditolak "42501 row-level security".
--
-- ⚠️ KEAMANAN: anon key ada di source & di bundle web, artinya siapa pun yang
-- punya key ini bisa baca/tulis seluruh data. Aman hanya kalau instance Supabase
-- ini memang dipakai satu warung dan key-nya tidak disebar.
-- Kalau nanti perlu multi-tenant/multi-user: ganti policy ini dengan cek
-- auth.uid() dan aktifkan login sungguhan di authStore.

DO $$
DECLARE t text;
BEGIN
  -- Ambil dari pg_tables, bukan daftar hardcode: 001_init.sql tidak sinkron
  -- dengan DB asli (mis. hpp_ingredients tidak pernah dibuat di Supabase).
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS anon_all ON %I', t);
    EXECUTE format(
      'CREATE POLICY anon_all ON %I FOR ALL TO anon USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

-- Bucket Storage 'menu-images' — upload foto menu juga kena RLS.
DROP POLICY IF EXISTS anon_menu_images ON storage.objects;
CREATE POLICY anon_menu_images ON storage.objects
  FOR ALL TO anon
  USING (bucket_id = 'menu-images')
  WITH CHECK (bucket_id = 'menu-images');
