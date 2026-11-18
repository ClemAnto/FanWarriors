Metti qui i file audio SFX in formato OGG (preferito) o MP3.
I nomi devono corrispondere esattamente a quelli nell'enum SFX di AudioManager.ts:

  launch.ogg
  land.ogg
  merge_1.ogg
  merge_2.ogg
  merge_3.ogg
  merge_4.ogg
  explosion_champion.ogg
  explosion_hero.ogg
  explosion_legend.ogg
  malus.ogg
  timer_tick.ogg
  danger.ogg
  game_over.ogg
  round_up.ogg
  ui_click.ogg
  bounce.ogg         ← impatto warrior su muro o altro warrior

Se un file manca, AudioManager loga un warning e salta il suono silenziosamente.

Gettoni dei poteri (2026-11-18, scelti da audio/library, crediti completi in audio/library/*/SOURCES.txt):
  token_appear.mp3   CC0  MLaudio, Freesound #511485 "cartoon_wink_magic_sparkle"
  token_collect.mp3  CC0  Fupicat, Freesound #538146 "Plingy Coin"
  token_vanish.mp3   CC0  Kenney, "Interface Sounds" minimize_004
  power_ready.mp3    CC0  colorsCrimsonTears, Freesound #577965 "rpgPowerup"
