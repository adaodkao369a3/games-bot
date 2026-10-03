# Talent Agency character images

Put one PNG per character in this folder. The file name must match the slug exactly: `<slug>.png`.

- **Format:** PNG (transparent or solid background both work)
- **Size:** square, 512 to 1024 px (they are shown large on scout cards and profiles)
- **Missing files are fine:** the bot sends the card without an image instead of crashing, so you can add art gradually.
- All characters are original adults; don't use real people or copyrighted characters.

The image file name each character expects is stored in the `pa_characters.image_file` column (seeded from `src/database/agency-seed.sql`).

| # | File name | Character | Tier |
|---|---|---|---|
| 1 | `saitama.png` | Saitama | Intern |
| 2 | `makima.png` | Makima | Intern |
| 3 | `mariah.png` | Mariah | Intern |
| 4 | `mei-mei.png` | Mei Mei | Intern |
| 5 | `revy.png` | Revy | Intern |
| 6 | `balalaika.png` | Balalaika | Intern |
| 7 | `nico-robin.png` | Nico Robin | Trainee |
| 8 | `boa-hancock.png` | Boa Hancock | Trainee |
| 9 | `freya.png` | Freya | Trainee |
| 10 | `yuki.png` | Yuki | Trainee |
| 11 | `rossweisse.png` | Rossweisse | Rookie |
| 12 | `yumeko-jabami.png` | Yumeko Jabami | Rookie |
| 13 | `darkness.png` | Darkness | Rookie |
| 14 | `mio-naruse.png` | Mio Naruse | Rookie |
| 15 | `meiko-shiraki.png` | Meiko Shiraki | Pro |
| 16 | `esdeath.png` | Esdeath | Pro |
| 17 | `albedo.png` | Albedo | Pro |
| 18 | `rias-gremory.png` | Rias Gremory | Star |
| 19 | `nami.png` | Nami | Star |
| 20 | `rangiku.png` | Rangiku | Legend |

When you run `npm run build`, this folder is copied to `dist/assets/characters/` automatically (`copy-assets`). The bot loads images from `<project root>/assets/characters/`, so run it from the project root.
