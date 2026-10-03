/**
 * Bob Kun Talent Agency: commands, buttons and select menus.
 *
 * Commands: .pscout .precruit <name> .pwork <name> .pcollect .plist
 * Components use customIds shaped like `pa_<action>_<ownerUserId>_<arg>`; every handler rejects
 * anyone who isn't the owner. Game-floor channel only.
 */
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Message,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import * as fs from 'fs';
import * as path from 'path';
import { config, isGameFloorChannel } from '../config/index.js';
import { ErrorHandler } from '../utils/error-handler.js';
import { getCoinBalanceInfo } from '../services/coins.js';
import {
  CollectLine,
  RosterEntry,
  collectTransaction,
  careTransaction,
  findDiscoveredByName,
  failed,
  findRosterByName,
  getCharacters,
  getDiscovered,
  getRoster,
  getRosterEntry,
  getTiers,
  isExactNameMatch,
  recruitTransaction,
  scoutTransaction,
  sendToWork,
  trainTransaction,
} from '../database/agency-client.js';
import {
  BLOCK_MS,
  CharacterDef,
  MAX_LEVEL,
  MAX_ROSTER,
  MAX_WORKING,
  TierDef,
  careCost,
  currentStamina,
  formatDuration,
  levelMultiplier,
  payoutPerBlock,
  staminaBar,
  trainCost,
  weightedPick,
  workEarnings,
} from '../agency/agency-logic.js';

const COIN = '<:bombocoin:1545139736312815840>';
const GOLD = 0xf5b800;
const fmt = (n: number) => n.toLocaleString('en-US');
const coins = (n: number) => `${fmt(n)} ${COIN}`;
const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

const LINES = {
  scout: [
    'Bob Kun\'s scouts dragged this one out from behind a vending machine.',
    'Found loitering outside the agency. Looks employable. Barely.',
    'The scouts swear this one has "main character energy". The scouts are paid in snacks.',
    'Walked in off the street holding a résumé written in crayon.',
  ],
  recruit: [
    'Contract signed. Nobody read it.',
    'Welcome to the agency. The coffee is imaginary.',
    'Hired on the spot. HR is a banana and he approved.',
    'Another one for the payroll. Bob Kun is so proud.',
  ],
  work: [
    'Out the door with a briefcase full of nothing and a dream.',
    'Off to hustle. Bob Kun wants his cut.',
    'Dispatched. Tell them to check back in half an hour.',
  ],
  collect: ['Cha-ching.', 'The bag has arrived.', 'Counted twice. Bob Kun counted three times.', 'Money talks. Yours says "thanks".'],
};

// ---------------------------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------------------------

function wrongChannel(message: Message): boolean {
  return !isGameFloorChannel(message.channel.id);
}

const WRONG_CHANNEL_TEXT = () => `This command can only be used in <#${config.gameFloorChannelIds[0]}>.`;

/** Character art from assets/characters/<image_file>. Missing file => null (embed just has no image). */
function imageFor(character: CharacterDef): AttachmentBuilder | null {
  try {
    const file = path.join(process.cwd(), 'assets', 'characters', character.image_file);
    if (!fs.existsSync(file)) return null;
    return new AttachmentBuilder(file, { name: character.image_file });
  } catch {
    return null;
  }
}

function tierMap(tiers: TierDef[]): Map<string, TierDef> {
  return new Map(tiers.map((t) => [t.tier_key, t]));
}

interface View {
  content?: string;
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<any>[];
  files: AttachmentBuilder[];
}

function ids(action: string, owner: string, arg: string | number): string {
  return `pa_${action}_${owner}_${arg}`;
}

/** Pick one result from fuzzy matches: a single hit or an exact name wins, otherwise it's ambiguous. */
function resolveOne<T extends { name: string; slug: string }>(
  matches: T[],
  query: string
): { one?: T; ambiguous?: T[] } {
  if (matches.length === 1) return { one: matches[0] };
  const exact = matches.filter((m) => isExactNameMatch(query, m.name, m.slug));
  if (exact.length === 1) return { one: exact[0] };
  return { ambiguous: matches };
}

function ambiguousText(list: { name: string }[]): string {
  const shown = list.slice(0, 5).map((m) => `**${m.name}**`).join(', ');
  return `Bob Kun is confused, that matches a few: ${shown}${list.length > 5 ? ', ...' : ''}. Be more specific.`;
}

// ---------------------------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------------------------

function statusLine(e: RosterEntry, now: Date): string {
  if (e.status === 'working') {
    const started = new Date(e.work_started_at!);
    const elapsed = now.getTime() - started.getTime();
    if (elapsed < BLOCK_MS) return `working, first pay in ${formatDuration(BLOCK_MS - elapsed)}`;
    const w = workEarnings(e.character, e.level, e.stamina, started, now);
    return `ready: ${w.blocks} block${w.blocks === 1 ? '' : 's'}, +${fmt(w.coins)}`;
  }
  return `resting ${staminaBar(currentStamina(e, now))}`;
}

async function buildHub(userId: string, note?: string): Promise<View> {
  const now = new Date();
  const [roster, discovered] = await Promise.all([getRoster(userId), getDiscovered(userId)]);

  const embed = new EmbedBuilder().setColor(GOLD).setTitle('🕴️ Your Talent Agency');

  if (roster.length === 0) {
    const unsigned = discovered;
    let text = "Your roster is emptier than Bob Kun's fridge.\nUse `.pscout` to find talent, then recruit someone.";
    if (unsigned.length > 0) {
      text += `\n\n**Scouted, not signed yet**\n${unsigned.map((c) => `• ${c.name}: ${coins(c.recruit_price)}`).join('\n')}\nUse \`.precruit <name>\` to sign them.`;
    }
    embed.setDescription(`${note ? note + '\n\n' : ''}${text}`);
    return { embeds: [embed], components: [], files: [] };
  }

  const working = roster.filter((e) => e.status === 'working');
  const ready: RosterEntry[] = [];
  const out: RosterEntry[] = [];
  let waiting = 0;
  for (const e of working) {
    const started = new Date(e.work_started_at!);
    if (now.getTime() - started.getTime() >= BLOCK_MS) {
      ready.push(e);
      waiting += workEarnings(e.character, e.level, e.stamina, started, now).coins;
    } else out.push(e);
  }
  const resting = roster.filter((e) => e.status === 'resting');

  const lines: string[] = [];
  if (note) lines.push(note, '');
  lines.push(`Roster **${roster.length}/${MAX_ROSTER}**  ·  Out working **${working.length}/${MAX_WORKING}**`);
  lines.push(`Waiting to collect: **${coins(waiting)}**${waiting > 0 ? '  (`.pcollect`)' : ''}`);
  const fmtEntry = (e: RosterEntry) => `• **${e.character.name}** (${e.tier.label} Lv${e.level}): ${statusLine(e, now)}`;
  if (ready.length) lines.push('', '**Ready to collect**', ...ready.map(fmtEntry));
  if (out.length) lines.push('', '**Out working**', ...out.map(fmtEntry));
  if (resting.length) lines.push('', '**Resting**', ...resting.map(fmtEntry));

  const owned = new Set(roster.map((e) => e.character_slug));
  const unsigned = discovered.filter((c) => !owned.has(c.slug));
  if (unsigned.length) {
    lines.push('', '**Scouted, not signed**', ...unsigned.map((c) => `• ${c.name}: ${coins(c.recruit_price)}  (\`.precruit ${c.name}\`)`));
  }
  embed.setDescription(lines.join('\n').slice(0, 4000));

  const menu = new StringSelectMenuBuilder()
    .setCustomId(ids('select', userId, 'hub'))
    .setPlaceholder('Open a profile...')
    .addOptions(
      roster.slice(0, 25).map((e) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(e.character.name.slice(0, 100))
          .setDescription(`${e.tier.label} · Lv${e.level} · ${e.status === 'working' ? 'Working' : `Resting ${currentStamina(e, now)}/100`}`.slice(0, 100))
          .setValue(String(e.id))
      )
    );
  return { embeds: [embed], components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)], files: [] };
}

function buildProfile(e: RosterEntry, userId: string, note?: string): View {
  const now = new Date();
  const stamina = currentStamina(e, now);
  const working = e.status === 'working';
  const care = careCost(e.tier, stamina);
  const train = trainCost(e.character, e.level);
  const income = payoutPerBlock(e.character, e.level);

  const embed = new EmbedBuilder()
    .setColor(GOLD)
    .setTitle(e.character.name)
    .setDescription(`*${e.character.blurb}*${note ? `\n\n${note}` : ''}`)
    .addFields(
      { name: 'Rank', value: e.tier.label, inline: true },
      { name: 'Level', value: `${e.level}/${MAX_LEVEL} (x${levelMultiplier(e.level).toFixed(2)})`, inline: true },
      { name: 'Status', value: working ? `Out working: ${statusLine(e, now)}` : 'Resting', inline: true },
      { name: 'Stamina', value: staminaBar(stamina), inline: false },
      { name: 'Income', value: `${coins(income)} per 30 min  ·  costs ${e.character.stamina_cost} stamina per block`, inline: false }
    );

  const files: AttachmentBuilder[] = [];
  const img = imageFor(e.character);
  if (img) {
    files.push(img);
    embed.setImage(`attachment://${e.character.image_file}`);
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(ids('care', userId, e.id))
      .setLabel(care > 0 ? `Care (${fmt(care)})` : 'Care')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(working || care === 0),
    new ButtonBuilder()
      .setCustomId(ids('train', userId, e.id))
      .setLabel(train !== null ? `Train (${fmt(train)})` : 'Max level')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(working || train === null),
    new ButtonBuilder()
      .setCustomId(ids('work', userId, e.id))
      .setLabel('Send to work')
      .setStyle(ButtonStyle.Success)
      .setDisabled(working || stamina <= 0),
    new ButtonBuilder().setCustomId(ids('back', userId, 'list')).setLabel('Back to list').setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [embed], components: [row], files };
}

function scoutCard(
  character: CharacterDef,
  tier: TierDef,
  userId: string,
  intro: string,
  footer: string,
  opts: { disabled?: boolean; label?: string } = {}
): View {
  const embed = new EmbedBuilder()
    .setColor(GOLD)
    .setAuthor({ name: "Bob Kun's Scouts" })
    .setTitle(`${character.name}`)
    .setDescription(`${intro}\n\n*${character.blurb}*`)
    .addFields(
      { name: 'Rank', value: tier.label, inline: true },
      { name: 'Recruit price', value: coins(character.recruit_price), inline: true },
      { name: 'Earns', value: `${coins(character.base_payout)} / 30 min`, inline: true }
    )
    .setFooter({ text: footer });
  const files: AttachmentBuilder[] = [];
  const img = imageFor(character);
  if (img) {
    files.push(img);
    embed.setImage(`attachment://${character.image_file}`);
  }
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(ids('recruit', userId, character.slug))
      .setLabel(opts.label ?? `Recruit (${fmt(character.recruit_price)})`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(opts.disabled ?? false)
  );
  return { embeds: [embed], components: [row], files };
}

function confirmView(title: string, text: string, yesId: string, noId: string): View {
  const embed = new EmbedBuilder().setColor(GOLD).setTitle(title).setDescription(text);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(yesId).setLabel('✅ YES').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(noId).setLabel('❌ NO').setStyle(ButtonStyle.Danger)
  );
  return { embeds: [embed], components: [row], files: [] };
}

function collectEmbed(lines: CollectLine[], stillWorking: CollectLine[], total: number, newBalance: number | null, alreadyPaid: boolean): EmbedBuilder {
  const body = lines.map(
    (l) =>
      `**${l.name}** (${l.tierLabel} Lv${l.level}): ${l.blocks} block${l.blocks === 1 ? '' : 's'}  →  **+${fmt(l.coins)}**  ·  stamina ${l.staminaAfter}/100`
  );
  const embed = new EmbedBuilder()
    .setColor(GOLD)
    .setTitle('💰 Payday')
    .setDescription(`${pick(LINES.collect)}\n\n${body.join('\n')}`.slice(0, 4000));
  if (alreadyPaid) {
    embed.addFields({ name: 'Heads up', value: 'This shift was already paid out earlier (a hiccup interrupted it). Nobody was charged or paid twice.' });
  } else {
    embed.addFields({ name: 'Total', value: `**${coins(total)}**${newBalance !== null ? `\nBalance: ${coins(newBalance)}` : ''}` });
  }
  if (stillWorking.length) {
    embed.addFields({
      name: 'Still on shift',
      value: stillWorking.map((s) => `${s.name}: first pay in ${formatDuration(s.msUntilFirstBlock ?? 0)}`).join('\n'),
    });
  }
  return embed;
}

// ---------------------------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------------------------

export async function handlePscoutCommand(message: Message): Promise<void> {
  if (wrongChannel(message)) {
    await message.reply(WRONG_CHANNEL_TEXT());
    return;
  }
  try {
    const userId = message.author.id;
    const result = await scoutTransaction(userId, (cands, tiers) => weightedPick(cands, tiers));
    if (failed(result)) {
      if (result.code === 'cooldown') {
        await message.reply(`🔎 The scouts are still out. Back in **${formatDuration(result.remainingMs ?? 0)}**.`);
      } else {
        await message.reply(result.reason);
      }
      return;
    }
    const left = result.remainingUndiscovered;
    const view = scoutCard(
      result.character,
      result.tier,
      userId,
      pick(LINES.scout),
      left > 0 ? `${left} more talent${left === 1 ? '' : 's'} still out there` : 'That was the last one. You found everyone.'
    );
    await message.reply({ embeds: view.embeds, components: view.components, files: view.files });
  } catch (error) {
    await ErrorHandler.handleMessageError(message, error, 'pscout command');
  }
}

export async function handlePrecruitCommand(message: Message, args: string[]): Promise<void> {
  if (wrongChannel(message)) {
    await message.reply(WRONG_CHANNEL_TEXT());
    return;
  }
  try {
    const userId = message.author.id;
    const query = args.join(' ').trim();
    if (!query) {
      const [discovered, roster] = await Promise.all([getDiscovered(userId), getRoster(userId)]);
      const owned = new Set(roster.map((e) => e.character_slug));
      const open = discovered.filter((c) => !owned.has(c.slug));
      await message.reply(
        open.length
          ? `Who are we signing? Use \`.precruit <name>\`.\n${open.map((c) => `• **${c.name}**: ${coins(c.recruit_price)}`).join('\n')}`
          : 'Nobody scouted is waiting to be signed. Use `.pscout` to find talent.'
      );
      return;
    }

    const matches = await findDiscoveredByName(userId, query);
    if (matches.length === 0) {
      await message.reply("Bob Kun doesn't know that name. You can only recruit talent you've scouted, so try `.pscout`.");
      return;
    }
    const { one, ambiguous } = resolveOne(matches, query);
    if (!one) {
      await message.reply(ambiguousText(ambiguous!));
      return;
    }

    const result = await recruitTransaction(userId, one.slug);
    if (failed(result)) {
      await message.reply(result.reason);
      return;
    }
    await message.reply(
      `🤝 **${result.entry.character.name}** signed for ${coins(result.price)}. ${pick(LINES.recruit)}` +
        (result.newBalance !== null ? `\nBalance: ${coins(result.newBalance)}` : '')
    );
  } catch (error) {
    await ErrorHandler.handleMessageError(message, error, 'precruit command');
  }
}

export async function handlePworkCommand(message: Message, args: string[]): Promise<void> {
  if (wrongChannel(message)) {
    await message.reply(WRONG_CHANNEL_TEXT());
    return;
  }
  try {
    const userId = message.author.id;
    const query = args.join(' ').trim();
    const roster = await getRoster(userId);

    if (!query) {
      const now = new Date();
      const available = roster.filter((e) => e.status === 'resting' && currentStamina(e, now) > 0);
      const out = roster.filter((e) => e.status === 'working').length;
      if (roster.length === 0) {
        await message.reply('You have no talent yet. Use `.pscout` first.');
        return;
      }
      await message.reply(
        `Who's clocking in? Use \`.pwork <name>\`. (${out}/${MAX_WORKING} out)\n` +
          (available.length
            ? available.map((e) => `• **${e.character.name}** (${e.tier.label} Lv${e.level}): stamina ${currentStamina(e, now)}/100`).join('\n')
            : 'Nobody is free right now.')
      );
      return;
    }

    const matches = await findRosterByName(userId, query);
    if (matches.length === 0) {
      await message.reply("Nobody on your roster goes by that name. Check `.plist`.");
      return;
    }
    const { one, ambiguous } = resolveOne(
      matches.map((m) => ({ name: m.character.name, slug: m.character.slug, entry: m })),
      query
    );
    if (!one) {
      await message.reply(ambiguousText(ambiguous!));
      return;
    }

    const result = await sendToWork(userId, one.entry.id);
    if (failed(result)) {
      await message.reply(result.reason);
      return;
    }
    const e = result.entry;
    await message.reply(
      `💼 **${e.character.name}** is out working (${result.workingNow}/${MAX_WORKING} out). ${pick(LINES.work)}\n` +
        `Earns ${coins(payoutPerBlock(e.character, e.level))} per 30 min, up to 2 hours. Use \`.pcollect\` to cash in.`
    );
  } catch (error) {
    await ErrorHandler.handleMessageError(message, error, 'pwork command');
  }
}

export async function handlePcollectCommand(message: Message): Promise<void> {
  if (wrongChannel(message)) {
    await message.reply(WRONG_CHANNEL_TEXT());
    return;
  }
  try {
    const result = await collectTransaction(message.author.id);
    if (failed(result)) {
      if (result.code === 'nothing_ready' && result.stillWorking?.length) {
        await message.reply(
          '⏳ Nobody has finished a full 30-minute block yet.\n' +
            result.stillWorking.map((s) => `• **${s.name}**: first pay in ${formatDuration(s.msUntilFirstBlock ?? 0)}`).join('\n')
        );
      } else {
        await message.reply(result.reason);
      }
      return;
    }
    await message.reply({ embeds: [collectEmbed(result.lines, result.stillWorking, result.total, result.newBalance, result.alreadyPaid)] });
  } catch (error) {
    await ErrorHandler.handleMessageError(message, error, 'pcollect command');
  }
}

export async function handlePlistCommand(message: Message): Promise<void> {
  if (wrongChannel(message)) {
    await message.reply(WRONG_CHANNEL_TEXT());
    return;
  }
  try {
    const view = await buildHub(message.author.id);
    await message.reply({ embeds: view.embeds, components: view.components });
  } catch (error) {
    await ErrorHandler.handleMessageError(message, error, 'plist command');
  }
}

// ---------------------------------------------------------------------------------------------
// Buttons and select menus
// ---------------------------------------------------------------------------------------------

async function render(interaction: any, view: View): Promise<void> {
  // `attachments: []` drops whatever the old message carried, `files` adds the new image (if any).
  await interaction.editReply({
    content: view.content ?? '',
    embeds: view.embeds,
    components: view.components,
    files: view.files,
    attachments: [],
  });
}

async function tell(interaction: any, content: string): Promise<void> {
  await interaction.followUp({ content, ephemeral: true });
}

async function showProfile(interaction: any, userId: string, rosterId: number, note?: string): Promise<void> {
  const entry = await getRosterEntry(userId, rosterId);
  if (!entry) {
    await tell(interaction, "That talent isn't on your roster.");
    await render(interaction, await buildHub(userId));
    return;
  }
  await render(interaction, buildProfile(entry, userId, note));
}

export async function handleAgencyInteraction(interaction: any): Promise<void> {
  // customId = pa_<action>_<ownerUserId>_<arg>. Parse by matching the clicker's id so ids can't confuse the split.
  const customId = String(interaction.customId);
  const head = /^pa_([a-z]+)_(.*)$/.exec(customId);
  if (!head) return;
  const action = head[1];
  const rest = head[2];
  const prefix = `${interaction.user.id}_`;
  const isOwner = rest.startsWith(prefix);
  const ownerId = isOwner ? interaction.user.id : rest.split('_')[0];
  const arg = isOwner ? rest.slice(prefix.length) : rest.slice(rest.indexOf('_') + 1);

  if (!isOwner || ownerId !== interaction.user.id) {
    await interaction.reply({ content: "Hands off, those aren't your contracts. Run `.plist` for your own agency.", ephemeral: true });
    return;
  }
  if (!isGameFloorChannel(interaction.channelId)) {
    await interaction.reply({ content: WRONG_CHANNEL_TEXT(), ephemeral: true });
    return;
  }

  // Acknowledge fast (DB work can queue briefly), then edit the original message.
  await interaction.deferUpdate();
  const userId = interaction.user.id;

  switch (action) {
    case 'select': {
      const rosterId = Number(interaction.values?.[0]);
      if (!Number.isInteger(rosterId)) return;
      await showProfile(interaction, userId, rosterId);
      return;
    }

    case 'back': {
      await render(interaction, await buildHub(userId));
      return;
    }

    case 'recruit': {
      const result = await recruitTransaction(userId, arg);
      if (failed(result)) {
        await tell(interaction, result.reason);
        if (result.code === 'already_owned') {
          const chars = await getCharacters();
          const tiers = tierMap(await getTiers());
          const c = chars.find((x) => x.slug === arg);
          if (c) {
            const v = scoutCard(c, tiers.get(c.tier_key)!, userId, 'Already on the payroll.', 'Signed', { disabled: true, label: 'Signed' });
            await render(interaction, v);
          }
        }
        return;
      }
      const c = result.entry.character;
      const v = scoutCard(c, result.entry.tier, userId, `🤝 **Signed for ${coins(result.price)}.** ${pick(LINES.recruit)}`, 'Use .plist to manage your roster', {
        disabled: true,
        label: 'Signed',
      });
      await render(interaction, v);
      return;
    }

    case 'work': {
      const rosterId = Number(arg);
      const result = await sendToWork(userId, rosterId);
      if (failed(result)) {
        await tell(interaction, result.reason);
        await showProfile(interaction, userId, rosterId);
        return;
      }
      await render(interaction, buildProfile(result.entry, userId, `💼 ${pick(LINES.work)}`));
      return;
    }

    case 'care': {
      const rosterId = Number(arg);
      const entry = await getRosterEntry(userId, rosterId);
      if (!entry) return showProfile(interaction, userId, rosterId);
      const stamina = currentStamina(entry, new Date());
      const cost = careCost(entry.tier, stamina);
      if (entry.status === 'working' || cost === 0) {
        await tell(interaction, entry.status === 'working' ? `${entry.character.name} is out working.` : `${entry.character.name} is already at full stamina.`);
        return showProfile(interaction, userId, rosterId);
      }
      const info = await getCoinBalanceInfo(userId);
      const view = confirmView(
        `Pamper ${entry.character.name}?`,
        `Restores stamina from **${stamina}** to **100** for **${coins(cost)}**.\nYour balance: ${coins(info?.balance ?? 0)}`,
        ids('careyes', userId, `${rosterId}-${cost}`),
        ids('no', userId, rosterId)
      );
      await render(interaction, view);
      return;
    }

    case 'careyes': {
      const [idStr, costStr] = String(arg).split('-');
      const rosterId = Number(idStr);
      const result = await careTransaction(userId, rosterId, { maxCost: Number(costStr) });
      if (failed(result)) {
        await tell(interaction, result.reason);
        return showProfile(interaction, userId, rosterId);
      }
      await showProfile(interaction, userId, rosterId, `🧖 Fully rested for ${coins(result.cost)}. Bob Kun approves of self-care.`);
      return;
    }

    case 'train': {
      const rosterId = Number(arg);
      const entry = await getRosterEntry(userId, rosterId);
      if (!entry) return showProfile(interaction, userId, rosterId);
      const cost = trainCost(entry.character, entry.level);
      if (entry.status === 'working' || cost === null) {
        await tell(interaction, entry.status === 'working' ? `${entry.character.name} is out working. Finish the shift first.` : `${entry.character.name} is already max level.`);
        return showProfile(interaction, userId, rosterId);
      }
      const info = await getCoinBalanceInfo(userId);
      const view = confirmView(
        `Train ${entry.character.name}?`,
        `Level **${entry.level}** → **${entry.level + 1}** for **${coins(cost)}**.\n` +
          `Income goes ${coins(payoutPerBlock(entry.character, entry.level))} → ${coins(payoutPerBlock(entry.character, entry.level + 1))} per block.\n` +
          `Your balance: ${coins(info?.balance ?? 0)}`,
        ids('trainyes', userId, `${rosterId}-${entry.level}`),
        ids('no', userId, rosterId)
      );
      await render(interaction, view);
      return;
    }

    case 'trainyes': {
      const [idStr, lvlStr] = String(arg).split('-');
      const rosterId = Number(idStr);
      const result = await trainTransaction(userId, rosterId, { expectedLevel: Number(lvlStr) });
      if (failed(result)) {
        await tell(interaction, result.reason);
        return showProfile(interaction, userId, rosterId);
      }
      await showProfile(interaction, userId, rosterId, `📈 Level ${result.toLevel} unlocked for ${coins(result.cost)}. Bigger bag incoming.`);
      return;
    }

    case 'no': {
      await showProfile(interaction, userId, Number(arg));
      return;
    }

    default:
      await tell(interaction, 'Bob Kun does not recognise that button. Run `.plist` again.');
  }
}
