-- Bob Kun Talent Agency seed. Safe to re-run (upserts). Runs on every startup.

-- NOTE: because this re-runs on startup, edit values HERE (or change the seed) to rename/retune;
-- manual DB edits to seeded rows are overwritten on next boot.

INSERT INTO pa_tiers (tier_key, label, sort_order, scout_weight, recruit_price, base_payout, care_price) VALUES
  ('intern', 'Intern', 1, 30, 5000, 150, 400),
  ('trainee', 'Trainee', 2, 25, 13000, 250, 650),
  ('rookie', 'Rookie', 3, 20, 33000, 400, 1000),
  ('pro', 'Pro', 4, 15, 85000, 600, 1500),
  ('star', 'Star', 5, 8, 200000, 850, 2100),
  ('legend', 'Legend', 6, 2, 500000, 1200, 3000)
ON CONFLICT (tier_key) DO UPDATE SET
  label = EXCLUDED.label, sort_order = EXCLUDED.sort_order, scout_weight = EXCLUDED.scout_weight,
  recruit_price = EXCLUDED.recruit_price, base_payout = EXCLUDED.base_payout, care_price = EXCLUDED.care_price;

INSERT INTO pa_characters (slug, name, tier_key, kind, blurb, image_file, recruit_price, base_payout, stamina_cost) VALUES
  ('saitama', 'Saitama', 'intern', 'male',
   'The One-Punch Man. Somehow still looking for a good sale at the supermarket.',
   'saitama.png', 3500, 75, 15),

  ('makima', 'Makima', 'intern', 'female',
   'A mysterious and commanding devil hunter who always seems to have a plan.',
   'makima.png', 3500, 75, 5),

  ('mariah', 'Mariah', 'intern', 'female',
   'A Stand user whose magnetism can make even the strangest situations hilarious.',
   'mariah.png', 3500, 75, 5),

  ('mei-mei', 'Mei Mei', 'intern', 'female',
   'A Grade 1 sorcerer with a sharp eye for money and an even sharper technique.',
   'mei-mei.png', 5000, 150, 10),

  ('revy', 'Revy', 'intern', 'female',
   'A sharp-shooting pirate with a reputation for getting results.',
   'revy.png', 5000, 150, 10),

  ('balalaika', 'Balalaika', 'intern', 'female',
   'A formidable underworld leader with a commanding presence.',
   'balalaika.png', 5000, 150, 10),

  ('nico-robin', 'Nico Robin', 'trainee', 'female',
   'An archaeologist with an extraordinary ability to uncover secrets.',
   'nico-robin.png', 13000, 250, 10),

  ('boa-hancock', 'Boa Hancock', 'trainee', 'female',
   'A powerful pirate empress who commands attention wherever she goes.',
   'boa-hancock.png', 13000, 250, 10),

  ('freya', 'Freya', 'trainee', 'female',
   'A goddess whose presence and influence are difficult to ignore.',
   'freya.png', 13000, 250, 10),

  ('yuki', 'Yuki', 'trainee', 'female',
   'A mysterious fighter with an unexpected edge.',
   'yuki.png', 13000, 250, 10),

  ('rossweisse', 'Rossweisse', 'rookie', 'female',
   'A valkyrie who balances serious responsibility with magical talent.',
   'rossweisse.png', 33000, 400, 10),

  ('yumeko-jabami', 'Yumeko Jabami', 'rookie', 'female',
   'A fearless gambler who thrives when the stakes are highest.',
   'yumeko-jabami.png', 33000, 400, 10),

  ('darkness', 'Darkness', 'rookie', 'female',
   'A crusader with unwavering courage, questionable judgment, and an unusual enthusiasm for punishment.',
   'darkness.png', 33000, 400, 10),

  ('mio-naruse', 'Mio Naruse', 'rookie', 'female',
   'A powerful demon with a strong personality and plenty of ambition.',
   'mio-naruse.png', 33000, 400, 10),

  ('meiko-shiraki', 'Meiko Shiraki', 'pro', 'female',
   'A strict and intimidating presence who keeps everyone in line.',
   'meiko-shiraki.png', 85000, 600, 10),

  ('esdeath', 'Esdeath', 'pro', 'female',
   'A formidable commander with overwhelming confidence and power.',
   'esdeath.png', 85000, 600, 10),

  ('albedo', 'Albedo', 'pro', 'female',
   'A fiercely devoted guardian with an imposing presence.',
   'albedo.png', 85000, 600, 10),

  ('rias-gremory', 'Rias Gremory', 'star', 'female',
   'A powerful heiress with leadership, charisma, and supernatural talent.',
   'rias-gremory.png', 200000, 850, 10),

  ('nami', 'Nami', 'star', 'female',
   'A brilliant navigator with a talent for maps, money, and getting her way.',
   'nami.png', 200000, 850, 10),

  ('rangiku', 'Rangiku', 'legend', 'female',
   'A charismatic Soul Reaper with years of experience and an effortless presence.',
   'rangiku.png', 500000, 1200, 10)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, tier_key = EXCLUDED.tier_key, kind = EXCLUDED.kind, blurb = EXCLUDED.blurb,
  image_file = EXCLUDED.image_file, recruit_price = EXCLUDED.recruit_price, base_payout = EXCLUDED.base_payout,
  stamina_cost = EXCLUDED.stamina_cost;
