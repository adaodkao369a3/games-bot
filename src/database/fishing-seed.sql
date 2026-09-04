-- Fishing Loot Seed Data
-- Insert various fish, trash, treasure, and mystery items

-- TRASH (Common, shallow depths, low rewards)
INSERT INTO fishing_loot (name, emoji, description, category, rarity, min_depth, max_depth, min_reward, max_reward, weight, reel_difficulty) VALUES
('Old Boot', '👢', 'Someone lost this years ago.', 'trash', 'common', 0, 50, 1, 5, 20, 'easy'),
('Rusty Can', '🥫', 'It rattles when you shake it.', 'trash', 'common', 0, 50, 1, 10, 20, 'easy'),
('Broken Bottle', '🍾', 'Sharp edges everywhere.', 'trash', 'common', 0, 50, 1, 15, 'easy'),
('Wet Sock', '🧦', 'Why was this in the ocean?', 'trash', 'common', 0, 50, 1, 25, 'easy'),
('Seaweed', '🌿', 'Just slimy seaweed.', 'trash', 'common', 0, 50, 5, 20, 'easy'),
('Plastic Bag', '🛍️', 'Not great for the environment.', 'trash', 'common', 0, 50, 1, 10, 'easy'),
('Fish Bone', '🦴', 'Someone''s dinner leftovers.', 'trash', 'common', 0, 50, 5, 15, 'easy'),
('Rusty Nail', '🔩', 'Watch your fingers!', 'trash', 'common', 0, 50, 1, 10, 'easy');

-- COMMON FISH (Shallow to medium depths, modest rewards)
INSERT INTO fishing_loot (name, emoji, description, category, rarity, min_depth, max_depth, min_reward, max_reward, weight, reel_difficulty) VALUES
('Small Fish', '🐟', 'A tiny fish. Not very impressive.', 'fish', 'common', 0, 100, 50, 150, 25, 'easy'),
('Bass', '🐠', 'A decent catch for dinner.', 'fish', 'common', 25, 150, 100, 300, 20, 'normal'),
('Salmon', '🍣', 'Fresh and delicious!', 'fish', 'common', 50, 200, 150, 400, 18, 'normal'),
('Trout', '🐡', 'A classic freshwater fish.', 'fish', 'common', 25, 150, 120, 350, 18, 'normal'),
('Cod', '🐟', 'Good for fish and chips.', 'fish', 'common', 0, 100, 80, 250, 22, 'easy'),
('Sardine', '🐟', 'Small but plentiful.', 'fish', 'common', 0, 75, 60, 180, 24, 'easy'),
('Mackerel', '🐟', 'A shiny fish.', 'fish', 'common', 25, 125, 90, 280, 20, 'normal'),
('Perch', '🐠', 'A colorful little fish.', 'fish', 'common', 25, 150, 100, 300, 18, 'normal');

-- UNCOMMON FISH (Medium depths, better rewards)
INSERT INTO fishing_loot (name, emoji, description, category, rarity, min_depth, max_depth, min_reward, max_reward, weight, reel_difficulty) VALUES
('Tuna', '🐟', 'A large and valuable fish.', 'fish', 'uncommon', 75, 250, 400, 800, 12, 'normal'),
('Swordfish', '🗡️', 'Watch out for that nose!', 'fish', 'uncommon', 100, 300, 500, 1000, 10, 'hard'),
('Marlin', '🐟', 'A prized sport fish.', 'fish', 'uncommon', 100, 350, 600, 1200, 8, 'hard'),
('Mahi Mahi', '🐠', 'Beautiful and delicious.', 'fish', 'uncommon', 75, 250, 450, 900, 10, 'normal'),
('Snapper', '🐟', 'A popular food fish.', 'fish', 'uncommon', 50, 200, 350, 700, 12, 'normal'),
('Grouper', '🐟', 'A heavy bottom-dweller.', 'fish', 'uncommon', 75, 250, 400, 850, 10, 'hard'),
('Halibut', '🐟', 'A large flat fish.', 'fish', 'uncommon', 100, 300, 500, 1000, 8, 'hard');

-- RARE FISH (Deep depths, valuable rewards)
INSERT INTO fishing_loot (name, emoji, description, category, rarity, min_depth, max_depth, min_reward, max_reward, weight, reel_difficulty) VALUES
('Giant Tuna', '🐟', 'This thing is massive!', 'fish', 'rare', 150, 400, 1500, 3000, 5, 'hard'),
('Golden Koi', '🐠', 'An incredibly rare catch.', 'fish', 'rare', 200, 500, 3000, 5000, 3, 'hard'),
('Electric Eel', '⚡', 'Shocking!', 'fish', 'rare', 150, 350, 2000, 4000, 4, 'extreme'),
('Anglerfish', '🔦', 'It has its own light.', 'fish', 'rare', 200, 500, 2500, 4500, 3, 'hard'),
('Lobster', '🦞', 'A delicious crustacean.', 'fish', 'rare', 100, 300, 1200, 2500, 6, 'hard'),
('Crab', '🦀', 'Click click.', 'fish', 'rare', 75, 250, 800, 1800, 8, 'normal'),
('Squid', '🦑', 'Ink everywhere!', 'fish', 'rare', 150, 400, 1500, 3500, 5, 'hard'),
('Octopus', '🐙', 'Eight arms of trouble.', 'fish', 'rare', 150, 400, 1800, 3800, 4, 'extreme');

-- VALUABLE ITEMS (Medium to deep depths, good rewards)
INSERT INTO fishing_loot (name, emoji, description, category, rarity, min_depth, max_depth, min_reward, max_reward, weight, reel_difficulty) VALUES
('Gemstone', '💎', 'A shiny gem.', 'valuable', 'uncommon', 100, 300, 800, 2000, 8, 'normal'),
('Diamond', '💎', 'A real diamond!', 'valuable', 'rare', 200, 500, 3000, 8000, 4, 'hard'),
('Large Diamond', '💎', 'This is worth a fortune.', 'valuable', 'epic', 300, 600, 8000, 20000, 2, 'hard'),
('Rare Gem', '🔮', 'Mysterious and valuable.', 'valuable', 'rare', 250, 550, 5000, 12000, 3, 'hard'),
('Pearl', '🔘', 'A perfect pearl.', 'valuable', 'uncommon', 150, 350, 1000, 3000, 6, 'normal'),
('Ruby', '❤️', 'Deep red and precious.', 'valuable', 'rare', 250, 500, 4000, 10000, 3, 'hard'),
('Sapphire', '💙', 'Blue as the ocean.', 'valuable', 'rare', 250, 500, 4000, 10000, 3, 'hard'),
('Emerald', '💚', 'Green and gleaming.', 'valuable', 'rare', 250, 500, 4500, 11000, 3, 'hard');

-- TREASURE (Deep to very deep, high rewards)
INSERT INTO fishing_loot (name, emoji, description, category, rarity, min_depth, max_depth, min_reward, max_reward, weight, reel_difficulty) VALUES
('Old Coin', '🪙', 'An ancient coin.', 'treasure', 'uncommon', 150, 400, 500, 1500, 8, 'normal'),
('Treasure Chest', '📦', 'A small chest of goodies.', 'treasure', 'rare', 250, 500, 5000, 15000, 3, 'hard'),
('Golden Chest', '🎁', 'This looks promising!', 'treasure', 'epic', 350, 600, 15000, 40000, 1, 'hard'),
('Pirate Treasure', '🏴‍☠️', 'Real pirate booty!', 'treasure', 'epic', 400, 700, 25000, 60000, 1, 'extreme'),
('Ancient Treasure', '🏺', 'You actually found this?!', 'treasure', 'legendary', 500, 1000, 50000, 150000, 0.5, 'extreme'),
('Gold Bar', '🥇', 'Pure gold!', 'treasure', 'rare', 300, 600, 10000, 30000, 2, 'hard'),
('Silver Bar', '🥈', 'Solid silver.', 'treasure', 'uncommon', 200, 500, 3000, 8000, 4, 'normal'),
('Crown', '👑', 'Fit for royalty.', 'treasure', 'legendary', 450, 800, 40000, 100000, 0.5, 'extreme');

-- MYSTERY ITEMS (Various depths, special encounters)
INSERT INTO fishing_loot (name, emoji, description, category, rarity, min_depth, max_depth, min_reward, max_reward, weight, reel_difficulty) VALUES
('Message in a Bottle', '📜', 'A mysterious message...', 'mystery', 'uncommon', 50, 300, 2000, 5000, 5, 'normal'),
('Bob''s Lost Wallet', '👛', 'Bob has been looking for this!', 'mystery', 'rare', 100, 500, 10000, 25000, 2, 'hard'),
('Mysterious Box', '📦', 'What could be inside?', 'mystery', 'rare', 200, 600, 8000, 20000, 2, 'hard'),
('Something Moving...', '👁️', 'You don''t want to know.', 'mystery', 'epic', 300, 700, 20000, 50000, 1, 'extreme'),
('Ancient Artifact', '🏺', 'From a lost civilization.', 'mystery', 'epic', 400, 800, 30000, 70000, 1, 'extreme'),
('Cursed Idol', '🗿', 'Maybe you shouldn''t touch this.', 'mystery', 'legendary', 500, 1000, 60000, 120000, 0.5, 'extreme'),
('Alien Device', '🛸', 'This shouldn''t be here...', 'mystery', 'legendary', 600, 1000, 80000, 200000, 0.3, 'extreme'),
('???', '❓', 'You found something unexplainable.', 'mystery', 'legendary', 700, 1000, 100000, 300000, 0.2, 'extreme');
