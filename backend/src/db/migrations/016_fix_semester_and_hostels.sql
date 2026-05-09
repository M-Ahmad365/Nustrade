-- Fix semester constraint: max 8 (not 10)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_semester_check;
ALTER TABLE users ADD CONSTRAINT users_semester_check CHECK (semester BETWEEN 1 AND 8);

-- Clamp any existing semester 9-10 down to 8
UPDATE users SET semester = 8 WHERE semester > 8;

-- Map old H1-H13 / G1-G8 codes to real hostel names before adding constraint
UPDATE users SET hostel_name = CASE hostel_name
  WHEN 'H1'  THEN 'Ghazali'
  WHEN 'H2'  THEN 'Razi'
  WHEN 'H3'  THEN 'Rahmat'
  WHEN 'H4'  THEN 'Attar'
  WHEN 'H5'  THEN 'Liaquat'
  WHEN 'H6'  THEN 'Hajveri'
  WHEN 'H7'  THEN 'Zakria'
  WHEN 'H8'  THEN 'Johar'
  WHEN 'H9'  THEN 'Berouni'
  WHEN 'H10' THEN 'Rumi'
  WHEN 'H11' THEN 'Ghazali'
  WHEN 'H12' THEN 'Razi'
  WHEN 'H13' THEN 'Rahmat'
  WHEN 'G1'  THEN 'Fatima'
  WHEN 'G2'  THEN 'Amna'
  WHEN 'G3'  THEN 'Khadija'
  WHEN 'G4'  THEN 'Fatima'
  WHEN 'G5'  THEN 'Amna'
  WHEN 'G6'  THEN 'Khadija'
  WHEN 'G7'  THEN 'Fatima'
  WHEN 'G8'  THEN 'Amna'
  ELSE hostel_name
END
WHERE hostel_name IS NOT NULL;

-- Also map H-1 style (hyphenated) used in seed data
UPDATE users SET hostel_name = CASE hostel_name
  WHEN 'H-1' THEN 'Ghazali'
  WHEN 'H-2' THEN 'Razi'
  WHEN 'H-3' THEN 'Rahmat'
  WHEN 'H-4' THEN 'Attar'
  WHEN 'H-5' THEN 'Liaquat'
  WHEN 'H-6' THEN 'Hajveri'
  WHEN 'H-7' THEN 'Zakria'
  WHEN 'H-8' THEN 'Johar'
  WHEN 'G-1' THEN 'Fatima'
  WHEN 'G-2' THEN 'Amna'
  WHEN 'G-3' THEN 'Khadija'
  WHEN 'G-4' THEN 'Fatima'
  ELSE hostel_name
END
WHERE hostel_name IS NOT NULL;

-- Add hostel constraint after data is clean
ALTER TABLE users DROP CONSTRAINT IF EXISTS hostel_required;
ALTER TABLE users ADD CONSTRAINT hostel_required CHECK (
  (residence_type = 'hostellite' AND hostel_name IN (
    'Ghazali','Razi','Rahmat','Attar','Liaquat',
    'Hajveri','Zakria','Johar','Berouni','Rumi',
    'Fatima','Amna','Khadija'
  )) OR
  (residence_type = 'day_scholar' AND hostel_name IS NULL)
);
