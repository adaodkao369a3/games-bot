import { InteractionUpdateOptions, MessageComponentInteraction, ModalSubmitInteraction } from 'discord.js';
import { EMOJIS } from './emoji-registry.js';

/**
 * Shared bits for the casino games: tiny formatters + one safe way to answer an interaction.
 * Keep the casino screens short: emojis do the talking, text only for the stuff that matters.
 */

export const COIN = EMOJIS.bombocoin;
export const TICK = EMOJIS.tick;
export const CROSS = EMOJIS.cross;

/** 12,500 */
export function num(n: number): string {
  return n.toLocaleString('en-US');
}

/** **12,500** <coin> */
export function coins(n: number): string {
  return `**${num(n)}** ${COIN}`;
}

/** **+12,500** <coin> / **-12,500** <coin> */
export function signedCoins(n: number): string {
  return `**${n >= 0 ? '+' : '-'}${num(Math.abs(n))}** ${COIN}`;
}

/** **500** <coin> ➜ **900** <coin>  ·  **+400**   (bet, what you got back, net) */
export function betWin(bet: number, payout: number): string {
  const net = payout - bet;
  return `${coins(bet)} ➜ ${coins(payout)}  ·  **${net >= 0 ? '+' : '-'}${num(Math.abs(net))}**`;
}

/** Multiplier without trailing zeros: 2 -> x2, 1.25 -> x1.25 */
export function mult(m: number): string {
  return `x${Number(m.toFixed(2))}`;
}

type Responder = MessageComponentInteraction | ModalSubmitInteraction;

/**
 * Answer an interaction exactly once, whatever state it is in.
 * - already deferred/replied -> edit the reply
 * - button/select           -> update the message the button lives on
 * - modal from a message    -> update that message
 * Using this instead of calling update()/editReply() directly avoids the
 * "interaction already replied" / "not replied yet" errors.
 */
export async function respond(interaction: Responder, payload: InteractionUpdateOptions): Promise<void> {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload as any);
    return;
  }
  if (interaction.isMessageComponent()) {
    await interaction.update(payload);
    return;
  }
  if (interaction.isFromMessage()) {
    await interaction.update(payload);
    return;
  }
  await interaction.reply({ ...(payload as any), ephemeral: false });
}

/** Ephemeral "nope" message that never throws (e.g. if the interaction is already answered). */
export async function nope(interaction: Responder, content: string): Promise<void> {
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content, ephemeral: true });
    } else {
      await interaction.reply({ content, ephemeral: true });
    }
  } catch (error) {
    console.error('[casino-ui] Failed to send ephemeral reply:', error);
  }
}
