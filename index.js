import dotenv from "dotenv";
dotenv.config();
import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import {
    Client,
    GatewayIntentBits,
    AttachmentBuilder
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
        CHAT: ["_chag", "_chat"]
    },
    OLLAMA: {
        URL: "http://localhost:11434/api/chat",
        MODEL: "smollm2:360m",
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
        NO_OLLAMA_RESPONSE: "Guhh? No response from Ollama."
    },
    TIMING: {
        EDIT_INTERVAL: 1000
    },
    CHANCE: {
        RANDOM_TALK: 55 // 1 in x
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
        
        this.client.on("ready", () => {
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
            if (content.includes(CONFIG.COMMANDS.RANDOM_MEME)) {
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
  
  
  