import { z } from 'zod';

/**
 * Character configuration. Persisted per company membership and rendered identically by the
 * 3D office, profile popups, directory and Character Studio. Clothing is chosen by the person —
 * it is never derived from department, role or any other attribute.
 */

export const SKIN_TONES = ['#f8dcc8', '#f1cbb0', '#e6b48f', '#d49c74', '#b97d57', '#94603f', '#704630', '#4f3123'] as const;
export const HAIR_COLORS = ['#1f1a1a', '#3b2a22', '#5a3a28', '#8a5a3c', '#b98a5e', '#d8b98a', '#9a4b3a', '#d77f93', '#7a8fc9'] as const;
export const ABAYA_COLORS = ['#1c1b20', '#2a2830', '#24304f', '#2e4a3f', '#d6c3a8', '#8c7a6b', '#5b4a63', '#3f3a36'] as const;
export const THOBE_COLORS = ['#f7f5f0', '#eae6dc', '#9097a3', '#2f3a55', '#c8bba3'] as const;
export const HIJAB_COLORS = ['#1c1b20', '#e7dccb', '#8d8f99', '#2b3556', '#c9a9a6', '#5d4a63'] as const;
export const CASUAL_COLORS = ['#e9e3d8', '#cfd9e8', '#f1d0d6', '#d6e4d0', '#2c2c33', '#c7b8a4', '#b8c4dd'] as const;

export const BODY_FRAMES = ['feminine', 'masculine'] as const;
export const HAIR_STYLES = ['long_wavy', 'medium', 'straight', 'curly', 'bun', 'short', 'short_curly', 'none'] as const;
export const EYE_STYLES = ['round', 'soft', 'sparkle'] as const;
export const MOUTH_STYLES = ['smile', 'neutral', 'grin'] as const;
export const OUTFIT_KINDS = ['abaya', 'thobe', 'casual', 'formal'] as const;
export const ABAYA_VARIANTS = ['classic', 'modern', 'open', 'embroidered'] as const;
export const HEADWEAR = ['none', 'hijab', 'shemagh', 'ghutra'] as const;
export const HIJAB_STYLES = ['wrap', 'draped'] as const;
export const GLASSES = ['none', 'round', 'square', 'sun'] as const;
export const BAGS = ['none', 'tote', 'handbag', 'briefcase', 'backpack'] as const;
export const HELD_ITEMS = ['none', 'laptop', 'tablet', 'coffee'] as const;
export const SHOES = ['sneakers', 'loafers', 'heels', 'sandals'] as const;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const avatarConfigSchema = z.object({
  version: z.literal(1).default(1),
  body: z.enum(BODY_FRAMES),
  skinTone: hex,
  eyes: z.enum(EYE_STYLES),
  mouth: z.enum(MOUTH_STYLES),
  blush: z.boolean(),
  hairStyle: z.enum(HAIR_STYLES),
  hairColor: hex,
  outfit: z.enum(OUTFIT_KINDS),
  abayaVariant: z.enum(ABAYA_VARIANTS),
  outfitColor: hex,
  innerColor: hex,
  embroidery: z.boolean(),
  headwear: z.enum(HEADWEAR),
  hijabStyle: z.enum(HIJAB_STYLES),
  headwearColor: hex,
  agal: z.boolean(),
  bisht: z.boolean(),
  glasses: z.enum(GLASSES),
  headphones: z.boolean(),
  bag: z.enum(BAGS),
  held: z.enum(HELD_ITEMS),
  watch: z.boolean(),
  shoes: z.enum(SHOES),
});
export type AvatarConfig = z.infer<typeof avatarConfigSchema>;

export const DEFAULT_AVATAR: AvatarConfig = {
  version: 1,
  body: 'feminine',
  skinTone: SKIN_TONES[1],
  eyes: 'round',
  mouth: 'smile',
  blush: true,
  hairStyle: 'long_wavy',
  hairColor: HAIR_COLORS[1],
  outfit: 'abaya',
  abayaVariant: 'classic',
  outfitColor: ABAYA_COLORS[0],
  innerColor: '#e9e3d8',
  embroidery: false,
  headwear: 'hijab',
  hijabStyle: 'wrap',
  headwearColor: HIJAB_COLORS[0],
  agal: true,
  bisht: false,
  glasses: 'none',
  headphones: false,
  bag: 'none',
  held: 'laptop',
  watch: false,
  shoes: 'loafers',
};

/** Normalises a possibly-partial stored config to a full valid config. */
export function normalizeAvatar(input: unknown): AvatarConfig {
  const merged = { ...DEFAULT_AVATAR, ...(typeof input === 'object' && input ? input : {}) };
  const parsed = avatarConfigSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_AVATAR;
}

/* ---------------- AI robots ---------------- */

export const ROBOT_THEMES = ['sky', 'blush', 'mint', 'peach', 'lilac', 'butter', 'graphite', 'cloud'] as const;
export const ROBOT_THEME_COLORS: Record<(typeof ROBOT_THEMES)[number], string> = {
  sky: '#8fb6f0',
  blush: '#f2a7c3',
  mint: '#88d1b4',
  peach: '#f6b07f',
  lilac: '#b8a2ea',
  butter: '#f2d27a',
  graphite: '#7d8597',
  cloud: '#c9d2e3',
};
export const ROBOT_EARS = ['headphones', 'antenna', 'cat', 'round'] as const;
export const ROBOT_FACES = ['happy', 'focused', 'curious', 'wink'] as const;

export const robotConfigSchema = z.object({
  theme: z.enum(ROBOT_THEMES),
  ears: z.enum(ROBOT_EARS),
  face: z.enum(ROBOT_FACES),
  badge: z.string().max(2).default(''),
});
export type RobotConfig = z.infer<typeof robotConfigSchema>;

export const DEFAULT_ROBOT: RobotConfig = { theme: 'sky', ears: 'headphones', face: 'happy', badge: '' };

export function normalizeRobot(input: unknown): RobotConfig {
  const merged = { ...DEFAULT_ROBOT, ...(typeof input === 'object' && input ? input : {}) };
  const parsed = robotConfigSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_ROBOT;
}
