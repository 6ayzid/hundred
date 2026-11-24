import type {
  AvatarBg,
  AvatarCharacter,
  AvatarConfig,
  AvatarOutfit,
  AvatarSkin,
} from './types';
import type { Lang } from './i18n';

export const AVATAR_STORAGE_KEY = 'hundred_avatar';
export const NICKNAME_STORAGE_KEY = 'hundred_nickname';
export const PROFILE_DONE_STORAGE_KEY = 'hundred_profile_done';
export const LOW_DATA_STORAGE_KEY = 'hundred_low_data';
export const RAIN_STORAGE_KEY = 'hundred_rain';

export const AVATAR_CHARACTERS: readonly AvatarCharacter[] = [
  'kitty',
  'glasses',
  'bearcap',
  'dapper',
  'bunny',
  'crown',
] as const;

export const AVATAR_BGS: readonly {
  id: AvatarBg;
  base: string;
  ring: string;
}[] = [
  { id: 'mint', base: '#d8f3dc', ring: '#b7e4c7' },
  { id: 'pink', base: '#ffe0ea', ring: '#ffc2d4' },
  { id: 'sky', base: '#d7ecff', ring: '#b8dcff' },
  { id: 'lavender', base: '#ede4ff', ring: '#d9c7ff' },
  { id: 'sunny', base: '#fff3c4', ring: '#ffe08a' },
  { id: 'peach', base: '#ffe5d4', ring: '#ffc9ad' },
] as const;

export const AVATAR_OUTFITS: readonly { id: AvatarOutfit; fill: string }[] = [
  { id: 'emerald', fill: '#52b788' },
  { id: 'coral', fill: '#ff7597' },
  { id: 'royal', fill: '#6c9bf5' },
  { id: 'plum', fill: '#8b7fd0' },
  { id: 'amber', fill: '#f59e0b' },
  { id: 'teal', fill: '#2a9d8f' },
] as const;

export const AVATAR_SKINS: readonly { id: AvatarSkin; fill: string }[] = [
  { id: 'fair', fill: '#ffdfc4' },
  { id: 'warm', fill: '#f7cfa9' },
  { id: 'wheat', fill: '#f0c49e' },
  { id: 'tan', fill: '#dda67b' },
] as const;

export const DEFAULT_AVATAR: AvatarConfig = {
  character: 'kitty',
  bg: 'mint',
  outfit: 'emerald',
  skin: 'warm',
};

export const RANDOM_BANGLA_NAMES = [
  'মিতু',
  'রাকিব',
  'তানভীর',
  'নুসরাত',
  'সুমাইয়া',
  'ফাহিম',
  'তুলি',
  'শাকিব',
  'জুঁই',
  'আরমান',
  'কবির',
  'রূপা',
] as const;

export const RANDOM_ENGLISH_NAMES = [
  'Mitu',
  'Rakib',
  'Tanvir',
  'Nusrat',
  'Sumaiya',
  'Fahim',
  'Tuli',
  'Shakib',
  'Jui',
  'Arman',
  'Kabir',
  'Rupa',
] as const;

const BG_SET = new Set<string>(AVATAR_BGS.map((b) => b.id));
const OUTFIT_SET = new Set<string>(AVATAR_OUTFITS.map((o) => o.id));
const SKIN_SET = new Set<string>(AVATAR_SKINS.map((s) => s.id));
const CHAR_SET = new Set<string>(AVATAR_CHARACTERS);

export function normalizeAvatarConfig(raw: unknown): AvatarConfig {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ...DEFAULT_AVATAR };
  }
  const obj = raw as Record<string, unknown>;
  const character =
    typeof obj.character === 'string' && CHAR_SET.has(obj.character)
      ? (obj.character as AvatarCharacter)
      : DEFAULT_AVATAR.character;
  const bg =
    typeof obj.bg === 'string' && BG_SET.has(obj.bg)
      ? (obj.bg as AvatarBg)
      : DEFAULT_AVATAR.bg;
  const outfit =
    typeof obj.outfit === 'string' && OUTFIT_SET.has(obj.outfit)
      ? (obj.outfit as AvatarOutfit)
      : DEFAULT_AVATAR.outfit;
  const skin =
    typeof obj.skin === 'string' && SKIN_SET.has(obj.skin)
      ? (obj.skin as AvatarSkin)
      : DEFAULT_AVATAR.skin;
  return { character, bg, outfit, skin };
}

export function pickRandomName(
  lang: Lang,
  excludeName?: string,
  rng: () => number = Math.random,
): string {
  const pool = lang === 'en' ? RANDOM_ENGLISH_NAMES : RANDOM_BANGLA_NAMES;
  const filtered = excludeName
    ? pool.filter((n) => n.toLowerCase() !== excludeName.trim().toLowerCase())
    : [...pool];
  const list = filtered.length > 0 ? filtered : [...pool];
  const idx = Math.min(list.length - 1, Math.floor(Math.max(0, rng()) * list.length));
  return list[idx] ?? list[0];
}

export function pickRandomAvatar(rng: () => number = Math.random): AvatarConfig {
  const pick = <T,>(arr: readonly T[]): T =>
    arr[Math.min(arr.length - 1, Math.floor(Math.max(0, rng()) * arr.length))];
  return {
    character: pick(AVATAR_CHARACTERS),
    bg: pick(AVATAR_BGS).id,
    outfit: pick(AVATAR_OUTFITS).id,
    skin: pick(AVATAR_SKINS).id,
  };
}

export function getPresetAvatarForSeat(seatIndex: number): AvatarConfig {
  switch (seatIndex % 4) {
    case 0:
      return { character: 'kitty', bg: 'mint', outfit: 'emerald', skin: 'fair' };
    case 1:
      return { character: 'glasses', bg: 'pink', outfit: 'coral', skin: 'warm' };
    case 2:
      return { character: 'bearcap', bg: 'sky', outfit: 'royal', skin: 'fair' };
    default:
      return { character: 'dapper', bg: 'lavender', outfit: 'plum', skin: 'wheat' };
  }
}

export function getAvatarPalette(config: AvatarConfig) {
  const bgObj = AVATAR_BGS.find((b) => b.id === config.bg) ?? AVATAR_BGS[0];
  const outfitObj =
    AVATAR_OUTFITS.find((o) => o.id === config.outfit) ?? AVATAR_OUTFITS[0];
  const skinObj =
    AVATAR_SKINS.find((s) => s.id === config.skin) ?? AVATAR_SKINS[1];
  return {
    bgBase: bgObj.base,
    bgRing: bgObj.ring,
    outfitFill: outfitObj.fill,
    skinFill: skinObj.fill,
  };
}
