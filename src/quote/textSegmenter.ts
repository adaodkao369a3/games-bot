import emojiRegex from 'emoji-regex';
import { Image, loadImage } from '@napi-rs/canvas';
import { Logger } from '../utils/logger.js';

export type TextSegment = { type: 'text'; content: string };
export type EmojiSegment = { type: 'emoji'; content: string };
export type CustomEmojiSegment = { type: 'customEmoji'; name: string; id: string; animated: boolean };

export type Segment = TextSegment | EmojiSegment | CustomEmojiSegment;

// Cache for custom emoji images to avoid refetching
const customEmojiCache = new Map<string, Image>();

/**
 * Tokenizes quote text into segments: text, Unicode emoji, and Discord custom emoji.
 * Custom emoji matching runs first to avoid collision with Unicode emoji patterns.
 */
export function segmentText(text: string): Segment[] {
  const segments: Segment[] = [];
  let remaining = text;

  // First pass: extract Discord custom emojis
  const customEmojiRegex = /<(a?):(\w+):(\d+)>/g;
  let lastIndex = 0;
  let match;

  while ((match = customEmojiRegex.exec(remaining)) !== null) {
    const [fullMatch, animated, name, id] = match;
    const matchStart = match.index;
    const matchEnd = matchStart + fullMatch.length;

    // Add text before the custom emoji
    if (matchStart > lastIndex) {
      const textBefore = remaining.slice(lastIndex, matchStart);
      segments.push(...segmentUnicodeEmojis(textBefore));
    }

    // Add the custom emoji segment
    segments.push({
      type: 'customEmoji',
      name,
      id,
      animated: animated === 'a',
    });

    lastIndex = matchEnd;
  }

  // Add remaining text after the last custom emoji
  if (lastIndex < remaining.length) {
    const textAfter = remaining.slice(lastIndex);
    segments.push(...segmentUnicodeEmojis(textAfter));
  }

  return segments;
}

/**
 * Segments text into text and Unicode emoji segments using emoji-regex.
 * Splits plain text into individual word tokens for proper wrapping.
 */
function segmentUnicodeEmojis(text: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  const regex = emojiRegex();

  let match;
  while ((match = regex.exec(text)) !== null) {
    const [emoji] = match;
    const matchStart = match.index;
    const matchEnd = matchStart + emoji.length;

    // Add text before the emoji, split into word tokens
    if (matchStart > lastIndex) {
      const textBefore = text.slice(lastIndex, matchStart);
      segments.push(...splitTextIntoWords(textBefore));
    }

    // Add the emoji segment
    segments.push({ type: 'emoji', content: emoji });

    lastIndex = matchEnd;
  }

  // Add remaining text after the last emoji, split into word tokens
  if (lastIndex < text.length) {
    const textAfter = text.slice(lastIndex);
    segments.push(...splitTextIntoWords(textAfter));
  }

  // If no segments were created, the whole text is plain text
  if (segments.length === 0 && text.trim()) {
    segments.push(...splitTextIntoWords(text));
  }

  return segments;
}

/**
 * Splits text into individual word tokens for proper text wrapping.
 * Preserves spaces as separate tokens to maintain proper spacing.
 */
function splitTextIntoWords(text: string): Segment[] {
  const segments: Segment[] = [];
  
  // Split on whitespace but preserve the whitespace as tokens
  const parts = text.split(/(\s+)/);
  
  for (const part of parts) {
    if (part) {
      segments.push({ type: 'text', content: part });
    }
  }
  
  return segments;
}

/**
 * Loads a custom emoji image from Discord CDN, using cache if available.
 * Falls back to rendering the literal :name: text on failure.
 */
export async function loadCustomEmoji(emoji: CustomEmojiSegment): Promise<Image | null> {
  const cacheKey = emoji.id;

  if (customEmojiCache.has(cacheKey)) {
    return customEmojiCache.get(cacheKey)!;
  }

  try {
    const url = `https://cdn.discordapp.com/emojis/${emoji.id}.png`;
    const image = await loadImage(url);
    customEmojiCache.set(cacheKey, image);
    return image;
  } catch (error) {
    Logger.error(`Failed to load custom emoji :${emoji.name}: (${emoji.id})`, error);
    return null;
  }
}

/**
 * Gets a custom emoji image from cache (synchronous).
 * Returns null if not in cache (should call preloadCustomEmojis first).
 */
export function getCustomEmojiFromCache(emoji: CustomEmojiSegment): Image | null {
  return customEmojiCache.get(emoji.id) ?? null;
}

/**
 * Pre-loads all unique custom emoji images in the text segments.
 * This must be called before text wrapping to ensure we have emoji widths.
 */
export async function preloadCustomEmojis(segments: Segment[]): Promise<void> {
  const customEmojiIds = new Set<string>();
  
  for (const segment of segments) {
    if (segment.type === 'customEmoji') {
      customEmojiIds.add(segment.id);
    }
  }

  const loadPromises = Array.from(customEmojiIds).map(async (id) => {
    const segment = segments.find(s => s.type === 'customEmoji' && s.id === id) as CustomEmojiSegment;
    if (segment) {
      await loadCustomEmoji(segment);
    }
  });

  await Promise.all(loadPromises);
}