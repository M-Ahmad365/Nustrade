-- 014_seed_categories.sql
-- Seed the 9 fixed categories defined in SPECS.md section 3.4.
-- ON CONFLICT DO NOTHING makes this idempotent — safe to run on a populated DB.

INSERT INTO categories (slug, name, description, display_order) VALUES
  ('books',             'Books & Notes',       'Textbooks, reference books, lecture notes', 1),
  ('electronics',       'Electronics',         'Laptops, phones, accessories, tablets',     2),
  ('furniture',         'Furniture',           'Desks, chairs, beds, storage',              3),
  ('bikes',             'Bikes & Cycles',      'Bicycles, motorcycles, scooters',           4),
  ('clothing',          'Clothing',            'Hoodies, formal wear, shoes',               5),
  ('stationery',        'Stationery',          'Drawing kits, calculators, lab equipment',  6),
  ('hostel_essentials', 'Hostel Essentials',   'Heaters, kettles, bedding, cookware',       7),
  ('sports',            'Sports',              'Equipment, gear, jerseys',                  8),
  ('other',             'Other',               'Anything that doesn''t fit',                9)
ON CONFLICT (slug) DO NOTHING;
