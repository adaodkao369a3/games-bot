import { Message, MessageComponentInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, TextChannel, User } from 'discord.js';

type ImpostorState = 'idle' | 'lobby' | 'clue_submission' | 'voting' | 'kill_phase' | 'complete' | 'timeout';

interface Player {
  userId: string;
  username: string;
  isImpostor: boolean;
  isEliminated: boolean;
  clue: string | null;
  vote: string | null;
}

interface ImpostorGameData {
  channelId: string;
  guildId: string | undefined;
  hostId: string;
  players: Map<string, Player>;
  secretWord: string;
  currentRound: number;
  impostorId: string | null;
  messageId: string | null;
  message: Message | null;
  gameInstanceId: string;
  votes: Map<string, string>; // voter -> target
}

// Game configuration
const GAME_CONFIG = {
  minPlayers: 4,
  maxPlayers: 20,
  // Secret word pool
  secretWords: [
    'pizza', 'beach', 'music', 'party', 'movie', 'coffee', 'school', 'family',
    'summer', 'winter', 'garden', 'forest', 'ocean', 'mountain', 'river',
    'castle', 'dragon', 'robot', 'alien', 'pirate', 'ninja', 'wizard',
    'knight', 'princess', 'king', 'queen', 'hero', 'villain', 'magic',
    'sword', 'shield', 'bow', 'arrow', 'horse', 'dog', 'cat', 'bird',
    'fish', 'tree', 'flower', 'sun', 'moon', 'star', 'cloud', 'rain',
    'snow', 'wind', 'fire', 'water', 'earth', 'sky', 'night', 'day',
    'morning', 'evening', 'breakfast', 'lunch', 'dinner', 'snack', 'drink',
    'book', 'pen', 'paper', 'phone', 'computer', 'keyboard', 'mouse',
    'screen', 'chair', 'table', 'bed', 'house', 'room', 'door', 'window',
    'floor', 'ceiling', 'wall', 'roof', 'garden', 'yard', 'street', 'road',
    'car', 'bus', 'train', 'plane', 'boat', 'ship', 'bicycle', 'skateboard',
    'scooter', 'motorcycle', 'truck', 'van', 'taxi', 'subway', 'tram',
    'helicopter', 'rocket', 'spaceship', 'satellite', 'planet', 'galaxy',
    'universe', 'star', 'comet', 'asteroid', 'meteor', 'blackhole',
  ],
  // Timeout in milliseconds
  timeoutMs: 10 * 60 * 1000, // 10 minutes
  // Clue submission timeout per round
  clueTimeoutMs: 60 * 1000, // 60 seconds
  // Voting timeout per round
  votingTimeoutMs: 30 * 1000, // 30 seconds
};

export class ImpostorGame {
  private state: ImpostorState = 'idle';
  private data: ImpostorGameData;
  private gameTimeout: NodeJS.Timeout | null = null;
  private clueTimeout: NodeJS.Timeout | null = null;
  private votingTimeout: NodeJS.Timeout | null = null;

  constructor(channelId: string, guildId: string | undefined, hostId: string) {
    this.data = {
      channelId,
      guildId,
      hostId,
      players: new Map(),
      secretWord: '',
      currentRound: 0,
      impostorId: null,
      messageId: null,
      message: null,
      gameInstanceId: `impostor_${channelId}_${Date.now()}`,
      votes: new Map(),
    };
  }

  /**
   * Start the impostor game lobby
   */
  async start(message: Message): Promise<void> {
    this.state = 'lobby';
    this.data.messageId = message.id;
    this.data.message = message;

    const embed = this.createLobbyEmbed();
    const row = this.createLobbyButtons();

    const sentMessage = await message.reply({
      embeds: [embed],
      components: [row],
    });

    this.data.messageId = sentMessage.id;
    this.data.message = sentMessage;

    // Set timeout
    this.gameTimeout = setTimeout(() => {
      this.timeoutGame(sentMessage);
    }, GAME_CONFIG.timeoutMs);
  }

  /**
   * Handle button interactions
   */
  async handleInteraction(interaction: MessageComponentInteraction): Promise<void> {
    const customId = interaction.customId;

    switch (customId) {
      case 'impostor_join':
        await this.handleJoin(interaction);
        break;
      case 'impostor_start':
        await this.handleStart(interaction);
        break;
      case 'impostor_vote_':
        await this.handleVote(interaction, customId);
        break;
      case 'impostor_kill_':
        await this.handleKill(interaction, customId);
        break;
      default:
        if (customId.startsWith('impostor_vote_')) {
          await this.handleVote(interaction, customId);
        } else if (customId.startsWith('impostor_kill_')) {
          await this.handleKill(interaction, customId);
        } else {
          await interaction.reply({
            content: 'Unknown action.',
            ephemeral: true,
          });
        }
    }
  }

  /**
   * Handle message submissions (clues)
   */
  async handleMessage(message: Message): Promise<void> {
    if (this.state !== 'clue_submission') {
      return;
    }

    const userId = message.author.id;
    const player = this.data.players.get(userId);

    if (!player || player.isEliminated) {
      return;
    }

    // Check if already submitted
    if (player.clue !== null) {
      await message.reply('You have already submitted your clue for this round.');
      return;
    }

    // Validate clue (one word only)
    const content = message.content.trim().toLowerCase();
    if (!/^[a-z]+$/.test(content)) {
      await message.reply('Your clue must be a single word (letters only).');
      return;
    }

    // Record clue
    player.clue = content;

    // Update embed
    await this.updateClueEmbed();

    // Check if all players have submitted
    if (this.allCluesSubmitted()) {
      this.clearClueTimeout();
      await this.startVoting();
    }
  }

  /**
   * Handle JOIN button
   */
  private async handleJoin(interaction: MessageComponentInteraction): Promise<void> {
    if (this.state !== 'lobby') {
      await interaction.reply({
        content: 'Game has already started.',
        ephemeral: true,
      });
      return;
    }

    const userId = interaction.user.id;
    const username = interaction.user.username;

    if (this.data.players.has(userId)) {
      await interaction.reply({
        content: 'You have already joined the game.',
        ephemeral: true,
      });
      return;
    }

    if (this.data.players.size >= GAME_CONFIG.maxPlayers) {
      await interaction.reply({
        content: 'Game is full.',
        ephemeral: true,
      });
      return;
    }

    this.data.players.set(userId, {
      userId,
      username,
      isImpostor: false,
      isEliminated: false,
      clue: null,
      vote: null,
    });

    const embed = this.createLobbyEmbed();
    const row = this.createLobbyButtons();
    await interaction.update({
      embeds: [embed],
      components: [row],
    });
  }

  /**
   * Handle START button
   */
  private async handleStart(interaction: MessageComponentInteraction): Promise<void> {
    if (this.state !== 'lobby') {
      await interaction.reply({
        content: 'Game has already started.',
        ephemeral: true,
      });
      return;
    }

    if (interaction.user.id !== this.data.hostId) {
      await interaction.reply({
        content: 'Only the host can start the game.',
        ephemeral: true,
      });
      return;
    }

    if (this.data.players.size < GAME_CONFIG.minPlayers) {
      await interaction.reply({
        content: `Need at least ${GAME_CONFIG.minPlayers} players to start.`,
        ephemeral: true,
      });
      return;
    }

    await interaction.deferUpdate();

    // Select impostor randomly
    const playerIds = Array.from(this.data.players.keys());
    const impostorIndex = Math.floor(Math.random() * playerIds.length);
    this.data.impostorId = playerIds[impostorIndex];
    this.data.players.get(this.data.impostorId)!.isImpostor = true;

    // Select secret word
    this.data.secretWord = GAME_CONFIG.secretWords[Math.floor(Math.random() * GAME_CONFIG.secretWords.length)];

    // Send secret word to non-impostors
    const channel = this.data.message?.channel as TextChannel;
    for (const [userId, player] of this.data.players) {
      if (!player.isImpostor) {
        try {
          const user = await channel.guild.members.fetch(userId);
          await user.send(`🕵️ **IMPOSTOR GAME**\n\nThe secret word is: **${this.data.secretWord}**\n\nYou are NOT the Impostor.`);
        } catch (e) {
          console.error('Failed to DM user:', e);
        }
      } else {
        try {
          const user = await channel.guild.members.fetch(userId);
          await user.send(`🕵️ **IMPOSTOR GAME**\n\nYou are the **IMPOSTOR**!\n\nYou do not know the secret word.\n\nBlend in and eliminate the others.`);
        } catch (e) {
          console.error('Failed to DM user:', e);
        }
      }
    }

    // Start first round
    await this.startRound();
  }

  /**
   * Start a new round
   */
  private async startRound(): Promise<void> {
    this.data.currentRound++;
    this.state = 'clue_submission';

    // Reset clues and votes
    for (const player of this.data.players.values()) {
      player.clue = null;
      player.vote = null;
    }
    this.data.votes.clear();

    // Send new round embed
    const channel = this.data.message?.channel as TextChannel;
    const embed = this.createRoundEmbed();
    await channel.send({
      embeds: [embed],
    });

    // Set clue timeout
    this.clueTimeout = setTimeout(() => {
      this.forceClueSubmission();
    }, GAME_CONFIG.clueTimeoutMs);
  }

  /**
   * Update clue embed
   */
  private async updateClueEmbed(): Promise<void> {
    const channel = this.data.message?.channel as TextChannel;
    const messages = await channel.messages.fetch({ limit: 10 });
    
    // Find the most recent round embed
    for (const msg of messages.values()) {
      if (msg.embeds.length > 0 && msg.embeds[0].title?.includes('ROUND')) {
        const embed = this.createRoundEmbed();
        await msg.edit({ embeds: [embed] });
        break;
      }
    }
  }

  /**
   * Check if all clues submitted
   */
  private allCluesSubmitted(): boolean {
    for (const player of this.data.players.values()) {
      if (!player.isEliminated && player.clue === null) {
        return false;
      }
    }
    return true;
  }

  /**
   * Force clue submission on timeout
   */
  private async forceClueSubmission(): Promise<void> {
    for (const player of this.data.players.values()) {
      if (!player.isEliminated && player.clue === null) {
        player.clue = '...';
      }
    }
    await this.startVoting();
  }

  /**
   * Start voting phase
   */
  private async startVoting(): Promise<void> {
    this.state = 'voting';

    const channel = this.data.message?.channel as TextChannel;
    const embed = this.createVotingEmbed();
    const row = this.createVotingButtons();
    await channel.send({
      embeds: [embed],
      components: [row],
    });

    // Set voting timeout
    this.votingTimeout = setTimeout(() => {
      this.resolveVoting();
    }, GAME_CONFIG.votingTimeoutMs);
  }

  /**
   * Handle vote
   */
  private async handleVote(interaction: MessageComponentInteraction, customId: string): Promise<void> {
    if (this.state !== 'voting') {
      await interaction.reply({
        content: 'Not in voting phase.',
        ephemeral: true,
      });
      return;
    }

    const userId = interaction.user.id;
    const player = this.data.players.get(userId);

    if (!player || player.isEliminated) {
      await interaction.reply({
        content: 'You are not in the game.',
        ephemeral: true,
      });
      return;
    }

    if (player.vote !== null) {
      await interaction.reply({
        content: 'You have already voted.',
        ephemeral: true,
      });
      return;
    }

    const targetId = customId.replace('impostor_vote_', '');
    if (targetId === userId) {
      await interaction.reply({
        content: 'You cannot vote for yourself.',
        ephemeral: true,
      });
      return;
    }

    const target = this.data.players.get(targetId);
    if (!target || target.isEliminated) {
      await interaction.reply({
        content: 'Invalid target.',
        ephemeral: true,
      });
      return;
    }

    player.vote = targetId;
    this.data.votes.set(userId, targetId);

    await interaction.deferUpdate();

    // Check if all votes are in
    if (this.allVotesSubmitted()) {
      this.clearVotingTimeout();
      await this.resolveVoting();
    }
  }

  /**
   * Check if all votes submitted
   */
  private allVotesSubmitted(): boolean {
    for (const player of this.data.players.values()) {
      if (!player.isEliminated && player.vote === null) {
        return false;
      }
    }
    return true;
  }

  /**
   * Resolve voting
   */
  private async resolveVoting(): Promise<void> {
    this.clearVotingTimeout();

    // Count votes
    const voteCounts = new Map<string, number>();
    for (const targetId of this.data.votes.values()) {
      voteCounts.set(targetId, (voteCounts.get(targetId) || 0) + 1);
    }

    // Find player with most votes
    let maxVotes = 0;
    let eliminatedId: string | null = null;
    for (const [targetId, count] of voteCounts) {
      if (count > maxVotes) {
        maxVotes = count;
        eliminatedId = targetId;
      }
    }

    // Handle tie
    const tiedPlayers: string[] = [];
    for (const [targetId, count] of voteCounts) {
      if (count === maxVotes) {
        tiedPlayers.push(targetId);
      }
    }

    if (tiedPlayers.length > 1) {
      // Tie - random elimination among tied
      eliminatedId = tiedPlayers[Math.floor(Math.random() * tiedPlayers.length)];
    }

    // Eliminate player
    if (eliminatedId) {
      const eliminated = this.data.players.get(eliminatedId);
      if (eliminated) {
        eliminated.isEliminated = true;
      }
    }

    // Show voting results
    const channel = this.data.message?.channel as TextChannel;
    const embed = this.createVotingResultEmbed(voteCounts, eliminatedId);
    await channel.send({
      embeds: [embed],
    });

    // Check win conditions
    if (await this.checkWinConditions()) {
      return;
    }

    // Check if impostor kill phase
    if (this.data.currentRound >= 2 && this.data.impostorId) {
      const impostor = this.data.players.get(this.data.impostorId);
      if (impostor && !impostor.isEliminated) {
        await this.startKillPhase();
        return;
      }
    }

    // Next round
    await this.startRound();
  }

  /**
   * Start kill phase
   */
  private async startKillPhase(): Promise<void> {
    this.state = 'kill_phase';

    const channel = this.data.message?.channel as TextChannel;
    const embed = this.createKillPhaseEmbed();
    const row = this.createKillButtons();
    await channel.send({
      embeds: [embed],
      components: [row],
    });
  }

  /**
   * Handle kill
   */
  private async handleKill(interaction: MessageComponentInteraction, customId: string): Promise<void> {
    if (this.state !== 'kill_phase') {
      await interaction.reply({
        content: 'Not in kill phase.',
        ephemeral: true,
      });
      return;
    }

    const userId = interaction.user.id;
    if (userId !== this.data.impostorId) {
      await interaction.reply({
        content: 'Only the Impostor can kill.',
        ephemeral: true,
      });
      return;
    }

    const targetId = customId.replace('impostor_kill_', '');
    const target = this.data.players.get(targetId);
    if (!target || target.isEliminated) {
      await interaction.reply({
        content: 'Invalid target.',
        ephemeral: true,
      });
      return;
    }

    target.isEliminated = true;

    await interaction.deferUpdate();

    // Show kill result
    const channel = this.data.message?.channel as TextChannel;
    const embed = new EmbedBuilder()
      .setTitle('💀 KILL')
      .setDescription(`**${target.username} was eliminated by the Impostor!**`)
      .setColor(0xe74c3c);
    await channel.send({
      embeds: [embed],
    });

    // Check win conditions
    if (await this.checkWinConditions()) {
      return;
    }

    // Next round
    await this.startRound();
  }

  /**
   * Check win conditions
   */
  private async checkWinConditions(): Promise<boolean> {
    const activePlayers = Array.from(this.data.players.values()).filter(p => !p.isEliminated);
    const impostor = this.data.players.get(this.data.impostorId!);

    // Impostor eliminated - non-impostors win
    if (impostor && impostor.isEliminated) {
      await this.endGame('non_impostor');
      return true;
    }

    // Impostor wins if only 2 players left (impostor + 1 other)
    if (activePlayers.length <= 2) {
      await this.endGame('impostor');
      return true;
    }

    return false;
  }

  /**
   * End game
   */
  private async endGame(winner: 'impostor' | 'non_impostor'): Promise<void> {
    this.state = 'complete';
    this.clearTimeout();
    this.clearClueTimeout();
    this.clearVotingTimeout();

    const impostor = this.data.players.get(this.data.impostorId!);
    const channel = this.data.message?.channel as TextChannel;

    const embed = new EmbedBuilder()
      .setTitle(winner === 'impostor' ? '🕵️ IMPOSTOR WINS!' : '🎉 CREW WINS!')
      .setDescription(`**The Impostor was:** ${impostor?.username}\n\n` +
        `**Secret Word:** ${this.data.secretWord}\n\n` +
        `**Rounds Played:** ${this.data.currentRound}`)
      .setColor(winner === 'impostor' ? 0xe74c3c : 0x00ff00);

    await channel?.send({
      embeds: [embed],
    });
  }

  /**
   * Handle game timeout
   */
  private async timeoutGame(message: Message): Promise<void> {
    this.state = 'timeout';
    this.clearTimeout();

    const embed = new EmbedBuilder()
      .setTitle('🕵️ IMPOSTOR')
      .setDescription(`Game timed out.`)
      .setColor(0xe74c3c);

    await message.edit({
      embeds: [embed],
      components: [],
    });
  }

  /**
   * Clear timeout
   */
  private clearTimeout(): void {
    if (this.gameTimeout) {
      clearTimeout(this.gameTimeout);
      this.gameTimeout = null;
    }
  }

  /**
   * Clear clue timeout
   */
  private clearClueTimeout(): void {
    if (this.clueTimeout) {
      clearTimeout(this.clueTimeout);
      this.clueTimeout = null;
    }
  }

  /**
   * Clear voting timeout
   */
  private clearVotingTimeout(): void {
    if (this.votingTimeout) {
      clearTimeout(this.votingTimeout);
      this.votingTimeout = null;
    }
  }

  /**
   * Check if game is finished
   */
  isFinished(): boolean {
    return this.state === 'complete' || this.state === 'timeout';
  }

  // Embed creation methods

  private createLobbyEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle('🕵️ IMPOSTOR')
      .setDescription(`Find the Impostor among you!\n\n` +
        `One player is the Impostor. Everyone else gets a secret word.\n` +
        `Submit clues, vote to eliminate, and find the Impostor before they eliminate you!\n\n` +
        `**Players:** ${this.data.players.size}/${GAME_CONFIG.minPlayers}+`)
      .setColor(0x3498db);
  }

  private createRoundEmbed(): EmbedBuilder {
    let description = `**ROUND ${this.data.currentRound}**\n\n`;
    description += `Submit a one-word clue related to the secret word.\n\n`;

    for (const player of this.data.players.values()) {
      if (!player.isEliminated) {
        description += `${player.username} — ${player.clue || '...'}\n`;
      }
    }

    return new EmbedBuilder()
      .setTitle('🕵️ IMPOSTOR')
      .setDescription(description)
      .setColor(0x3498db);
  }

  private createVotingEmbed(): EmbedBuilder {
    let description = `**VOTING PHASE**\n\n`;
    description += `Vote for who you think is the Impostor.\n\n`;

    for (const player of this.data.players.values()) {
      if (!player.isEliminated) {
        description += `${player.username}\n`;
      }
    }

    return new EmbedBuilder()
      .setTitle('🕵️ IMPOSTOR')
      .setDescription(description)
      .setColor(0xFFD700);
  }

  private createVotingResultEmbed(voteCounts: Map<string, number>, eliminatedId: string | null): EmbedBuilder {
    let description = `**VOTING RESULTS**\n\n`;

    for (const [targetId, count] of voteCounts) {
      const player = this.data.players.get(targetId);
      description += `${player?.username}: ${count} votes\n`;
    }

    if (eliminatedId) {
      const eliminated = this.data.players.get(eliminatedId);
      description += `\n**Eliminated:** ${eliminated?.username}`;
    }

    return new EmbedBuilder()
      .setTitle('🕵️ IMPOSTOR')
      .setDescription(description)
      .setColor(0xFFD700);
  }

  private createKillPhaseEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle('🕵️ IMPOSTOR')
      .setDescription(`**KILL PHASE**\n\n` +
        `The Impostor can eliminate one player.`)
      .setColor(0xe74c3c);
  }

  // Button creation methods

  private createLobbyButtons(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('impostor_join')
        .setLabel('JOIN GAME')
        .setStyle(ButtonStyle.Primary)
    ).addComponents(
      new ButtonBuilder()
        .setCustomId('impostor_start')
        .setLabel('START GAME')
        .setStyle(ButtonStyle.Success)
    );
  }

  private createVotingButtons(): ActionRowBuilder<ButtonBuilder> {
    const row = new ActionRowBuilder<ButtonBuilder>();

    for (const [userId, player] of this.data.players) {
      if (!player.isEliminated) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`impostor_vote_${userId}`)
            .setLabel(player.username)
            .setStyle(ButtonStyle.Primary)
        );
      }
    }

    return row;
  }

  private createKillButtons(): ActionRowBuilder<ButtonBuilder> {
    const row = new ActionRowBuilder<ButtonBuilder>();

    for (const [userId, player] of this.data.players) {
      if (!player.isEliminated && userId !== this.data.impostorId) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`impostor_kill_${userId}`)
            .setLabel(player.username)
            .setStyle(ButtonStyle.Danger)
        );
      }
    }

    return row;
  }
}
