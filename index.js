import dotenv from "dotenv";
dotenv.config();
import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import {
    Client,
    GatewayIntentBits,
    AttachmentBuilder,
    EmbedBuilder,
    ChannelType,
    PermissionFlagsBits
} from "discord.js";

// Configuration constants
const CONFIG = {
    INTENTS: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent
    ],
    COMMANDS: {
        RANDOM_MEME: "_randmeme",
        MOVE_CONV: ["_moveconv", "_convmove"],
        CHAT: ["_chag", "_chat"]
    },
    OLLAMA: {
        URL: "http://localhost:11434/api/chat",
        MODEL: "qwen2.5:0.5b",
        SYSTEM_PROMPT: "You are BotHard, a based bot that can talk. BotHard is CrackHard's failed attempt at a functioning bot, brought back to life by MagicJinn. Speak like you have an IQ of 50."
    },
    FILES: {
        MEME_CACHE: "memecache.json",
        MEME_DIR: "memes"
    },
    MESSAGES: {
        NO_MEMES: "lol no memes",
        LOADING: "https://tenor.com/view/mogus-spin-gif-26368032",
        NO_RESPONSE: "Buhh?",
        ERROR_GENERIC: (author) => `Guhh? Nice going ${author}, you broke the bot.`,
        NO_OLLAMA_RESPONSE: "Guhh? No response from Ollama.",
            MOVE_USAGE: "usage: `_moveconv #channel <amount> [age]`",
            MOVE_NO_AMOUNT: "Guhh? how many messages? `_moveconv #channel <amount> [age]`",
            MOVE_INVALID_AMOUNT: "Uhh? amount has to be between 1 and 100.",
            MOVE_INVALID_AGE: "Buhh? age looks like `30` (minutes), `45s`, `2h`, or `1d`.",
            MOVE_NO_CHANNEL: "Buhh? that channel doesnt exist or i cant use it.",
            MOVE_NO_MESSAGES: "Guhh? nothing to move.",
            MOVE_NO_RECENT: "Buhh? none of those messages are within the age limit.",
            MOVE_ADMIN_ONLY: "Buhh? you need manage messages for that.",
            MOVE_NOTICE: (channelLink) => `conversation moved to ${channelLink}`
    },
    TIMING: {
        EDIT_INTERVAL: 1000
    },
    CHANCE: {
        RANDOM_TALK: 150 // 1 in x
    },
    MOVE_CONV: {
            MAX_AMOUNT: 100,
            DEFAULT_AGE_MS: 24 * 60 * 60 * 1000,
            EMBED_COLOR: 0x5865F2,
            DESC_LIMIT: 4096,
            FILES_PER_MESSAGE: 10
    }
};

class MemeManager {
    constructor() {
        this.cache = {};
        this.cacheLoaded = false;
    }

    async loadCache() {
        if (this.cacheLoaded) return;
        
        try {
            const data = await fs.readFile(CONFIG.FILES.MEME_CACHE, 'utf8');
            this.cache = JSON.parse(data);
            console.log(`Meme cache loaded: ${Object.keys(this.cache).length} entries`);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error("Error loading meme cache:", error);
            }
            this.cache = {};
        }
        this.cacheLoaded = true;
    }

    async saveCache() {
        try {
            await fs.writeFile(CONFIG.FILES.MEME_CACHE, JSON.stringify(this.cache, null, 2));
        } catch (error) {
            console.error("Error saving meme cache:", error);
        }
    }

    async getRandomMeme() {
        await this.loadCache();
        
        const memeDir = path.join(process.cwd(), CONFIG.FILES.MEME_DIR);

        try {
            const files = await fs.readdir(memeDir);
            
            if (files.length === 0) {
                return null;
            }

            const randomFile = files[Math.floor(Math.random() * files.length)];

            if (this.cache[randomFile]) {
                return { url: this.cache[randomFile], filename: randomFile };
            }

            return {
                path: path.join(memeDir, randomFile),
                filename: randomFile
            };
        } catch (error) {
            return null;
        }
    }

    async cacheMeme(filename, url) {
        this.cache[filename] = url.split("?")[0]; // Remove Discord tracking params
        await this.saveCache();
    }
}

class ChatManager {
    async queryOllama(content, message) {
        // Send loading message immediately
        const sentMessage = await message.channel.send(CONFIG.MESSAGES.LOADING);

        try {
            const response = await this.postMessage(content);

            if (!response.body) {
                await sentMessage.edit(CONFIG.MESSAGES.NO_OLLAMA_RESPONSE);
                return;
            }

            await this.streamResponse(response, sentMessage);
        } catch (error) {
            console.error("Ollama query error:", error);
            await sentMessage.edit(CONFIG.MESSAGES.ERROR_GENERIC(message.author.username));
        }
    }

    async postMessage(content) {
        return await fetch(CONFIG.OLLAMA.URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: CONFIG.OLLAMA.MODEL,
                stream: true,
                keep_alive: -1, // this keeps the model loaded in RAM indefinitely
                messages: [
                    { role: "system", content: CONFIG.OLLAMA.SYSTEM_PROMPT },
                    { role: "user", content: content }
                ]
            })
        });
    }

    async streamResponse(response, sentMessage) {
        let buffer = '';
        let words = [];
        let done = false;

        const editLoop = async () => {
            let sentAnyWords = false;
            
            while (!done || buffer.length > 0) {
                // Process buffer into words
                if (buffer.length > 0) {
                    const newWords = buffer.split(/\s+/).filter(Boolean);
                    if (newWords.length > 0) {
                        words.push(...newWords);
                        buffer = '';
                    }
                }

                // Update message with accumulated words
                if (words.length > 0) {
                    const text = words.join(' ');
                    await sentMessage.edit(text);
                    sentAnyWords = true;
                }

                await new Promise(resolve => setTimeout(resolve, CONFIG.TIMING.EDIT_INTERVAL));
            }

            if (!sentAnyWords) {
                await sentMessage.edit(CONFIG.MESSAGES.NO_RESPONSE);
            }
        };

        // Start edit loop
        const editPromise = editLoop();

        // Process response stream
        try {
            for await (const chunk of response.body) {
                const lines = chunk.toString().split('\n').filter(Boolean);
                
                for (const line of lines) {
                    try {
                        const data = JSON.parse(line);
                        if (data.message?.content) {
                            buffer += data.message.content;
                        }
                        if (data.done) {
                            done = true;
                        }
                    } catch (parseError) {
                        // Ignore JSON parse errors for partial chunks
                    }
                }
            }
        } catch (error) {
            console.error("Stream processing error:", error);
        }

        done = true;
        await editPromise;
    }
}

class DiscordBot {
    constructor() {
        this.client = new Client({ intents: CONFIG.INTENTS });
        this.memeManager = new MemeManager();
        this.chatManager = new ChatManager();
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.client.on("messageCreate", this.handleMessage.bind(this));
        
        this.client.on("clientReady", () => {
            console.log(`Bot logged in as ${this.client.user.tag}`);
        });

        this.client.on("error", (error) => {
            console.error("Discord client error:", error);
        });
    }

    async handleMessage(message) {
        if (message.author.bot) return;

        const content = message.content.toLowerCase();
        console.log(`${message.author.username}: ${message.content}`);

        try {
            if (CONFIG.COMMANDS.MOVE_CONV.some(cmd => content.startsWith(cmd))) {
                await this.handleMoveConvCommand(message);
            } else if (content.includes(CONFIG.COMMANDS.RANDOM_MEME)) {
                await this.handleMemeCommand(message);
            } else if (
                CONFIG.COMMANDS.CHAT.some(cmd => content.includes(cmd)) ||
                Math.random() < 1 / CONFIG.CHANCE.RANDOM_TALK
            ) {
                await this.handleChatCommand(message, content);
            }
        } catch (error) {
            console.error("Message handling error:", error);
            await message.channel.send(CONFIG.MESSAGES.ERROR_GENERIC(message.author.username));
        }
    }

    parseMoveConvAge(raw) {
        if (raw == null) return CONFIG.MOVE_CONV.DEFAULT_AGE_MS;

        const match = String(raw).match(/^(\d+)([shd])?$/i);
        if (!match) return null;

        const value = Number(match[1]);
        const unit = (match[2] || "m").toLowerCase();
        const multipliers = {
            s: 1000,
            m: 60 * 1000,
            h: 60 * 60 * 1000,
            d: 24 * 60 * 60 * 1000
        };
        return value * multipliers[unit];
    }

    async handleMoveConvCommand(message) {
        if (!message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) {
            await message.channel.send(CONFIG.MESSAGES.MOVE_ADMIN_ONLY);
            return;
        }

        const match = message.content.match(/^_(?:moveconv|convmove)\s+<#(\d+)>(?:\s+(\d+))?(?:\s+(\d+[shd]?))?$/i);
        if (!match) {
            await message.channel.send(CONFIG.MESSAGES.MOVE_USAGE);
            return;
        }

        if (match[2] == null) {
            await message.channel.send(CONFIG.MESSAGES.MOVE_NO_AMOUNT);
            return;
        }

        const amount = Number(match[2]);
        if (!Number.isInteger(amount) || amount < 1 || amount > CONFIG.MOVE_CONV.MAX_AMOUNT) {
            await message.channel.send(CONFIG.MESSAGES.MOVE_INVALID_AMOUNT);
            return;
        }

        const maxAgeMs = this.parseMoveConvAge(match[3]);
        if (maxAgeMs == null) {
            await message.channel.send(CONFIG.MESSAGES.MOVE_INVALID_AGE);
            return;
        }

        const targetChannel = message.guild?.channels.cache.get(match[1]);
        if (
            !targetChannel ||
            (targetChannel.type !== ChannelType.GuildText &&
                targetChannel.type !== ChannelType.GuildAnnouncement)
        ) {
            await message.channel.send(CONFIG.MESSAGES.MOVE_NO_CHANNEL);
            return;
        }

        const fetched = await message.channel.messages.fetch({
            limit: amount,
            before: message.id
        });
        if (fetched.size === 0) {
            await message.channel.send(CONFIG.MESSAGES.MOVE_NO_MESSAGES);
            return;
        }

        const cutoff = Date.now() - maxAgeMs;
        const messages = [...fetched.values()]
            .reverse()
            .filter(m => m.createdTimestamp >= cutoff);

        if (messages.length === 0) {
            await message.channel.send(CONFIG.MESSAGES.MOVE_NO_RECENT);
            return;
        }

        const participantIds = [...new Set(messages.map(m => m.author.id))];
        const embed = this.buildConversationEmbed(messages, message.channel, message.author);
        const pings = participantIds.map(id => `<@${id}>`).join(" ");
        const files = await this.downloadMoveAttachments(messages);
        const batchSize = CONFIG.MOVE_CONV.FILES_PER_MESSAGE;

        const movedMessage = await targetChannel.send({
            content: pings,
            embeds: [embed],
            files: files.slice(0, batchSize),
            allowedMentions: {
                users: participantIds
            }
        });

        for (let i = batchSize; i < files.length; i += batchSize) {
            await targetChannel.send({
                files: files.slice(i, i + batchSize)
            });
        }

        const toDelete = [...messages, message];
        await this.deleteMessages(message.channel, toDelete);

        const channelLink = `[#${targetChannel.name}](${movedMessage.url})`;
        await message.channel.send(CONFIG.MESSAGES.MOVE_NOTICE(channelLink));
    }

    async downloadMoveAttachments(messages) {
        const files = [];
        let index = 0;

        for (const m of messages) {
            for (const att of m.attachments.values()) {
                try {
                    const res = await fetch(att.url);
                    if (!res.ok) continue;

                    const buffer = Buffer.from(await res.arrayBuffer());
                    const name = att.name || `file_${index}`;
                    files.push(new AttachmentBuilder(buffer, {
                        name: `${index}_${name}`
                    }));
                    index++;
                } catch (error) {
                    console.error("Attachment download failed:", error);
                }
            }
        }

        return files;
    }

    buildConversationEmbed(messages, sourceChannel, mover) {
        const lines = messages.map(m => {
            const time = m.createdAt.toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit"
            });
            const body = m.content?.trim() || "";
            const attachmentLines = [...m.attachments.values()]
                .map(a => `📎 ${a.name}`)
                .join("\n");
            const text = [body, attachmentLines].filter(Boolean).join("\n") || "*empty message*";
            return `**${m.member?.displayName || m.author.username}** · ${time}\n${text}`;
        });

        let description = lines.join("\n\n");
        if (description.length > CONFIG.MOVE_CONV.DESC_LIMIT) {
            description = description.slice(0, CONFIG.MOVE_CONV.DESC_LIMIT - 20) + "\n\n…truncated";
        }

        return new EmbedBuilder()
            .setColor(CONFIG.MOVE_CONV.EMBED_COLOR)
            .setTitle(`Conversation from #${sourceChannel.name}`)
            .setDescription(description)
            .setFooter({
                text: `Moved by ${mover.username}`
            })
            .setTimestamp();
    }

    async deleteMessages(channel, messages) {
        const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
        const recent = messages.filter(m => m.createdTimestamp > twoWeeksAgo);
        const old = messages.filter(m => m.createdTimestamp <= twoWeeksAgo);

        if (recent.length > 1) {
            await channel.bulkDelete(recent, true);
        } else if (recent.length === 1) {
            await recent[0].delete().catch(() => {});
        }

        for (const m of old) {
            await m.delete().catch(() => {});
        }
    }

    async handleMemeCommand(message) {
        const meme = await this.memeManager.getRandomMeme();
        
        if (!meme) {
            await message.channel.send(CONFIG.MESSAGES.NO_MEMES);
            return;
        }

        if (meme.url) {
            await message.channel.send(meme.url);
        } else {
            try {
                const attachment = new AttachmentBuilder(meme.path, { name: meme.filename });
                const sentMessage = await message.channel.send({ files: [attachment] });
                const attachmentUrl = sentMessage.attachments.first().url;
                
                await this.memeManager.cacheMeme(meme.filename, attachmentUrl);
            } catch (error) {
                console.error("Meme sending error:", error);
                await message.channel.send(CONFIG.MESSAGES.ERROR_GENERIC(message.author.username));
            }
        }
    }

    async handleChatCommand(message, content) {
        // Remove command prefixes and clean content
        let cleanContent = content;
        CONFIG.COMMANDS.CHAT.forEach(cmd => {
            cleanContent = cleanContent.replace(cmd, "");
        });
        cleanContent = cleanContent.trim();

        if (cleanContent) {
            await this.chatManager.queryOllama(cleanContent, message);
        }
    }

    async start() {
        try {
            await this.client.login(process.env.DISCORD_TOKEN);
        } catch (error) {
            console.error("Failed to start bot:", error);
            process.exit(1);
        }
    }
}

// Start the bot
const bot = new DiscordBot();
bot.start();

// Querry Ollama to initialize the model
(async () => {
    console.log("Pinging Ollama...");
    const res = await bot.chatManager.postMessage("Test message. Do not respond.");
    if(res != null){
        console.log("Ollama responded!");
    }
  })();
  
  
  