import dotenv from "dotenv";
dotenv.config();
import fetch from 'node-fetch';
import fs from 'fs/promises';
import { promises as fsPromises } from 'fs';
import path from 'path';
import {
    Client,
    GatewayIntentBits,
    AttachmentBuilder
} from "discord.js";

// Define what the discord bot has access to
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent
    ]
});

const chagLearn = "learn"
const chagGenerate = "generate"

let memeCache = {};
let currentAuthor = ""

client.on("messageCreate", async (message) => {

    if (message.author.bot) return

    const author = message.author
    currentAuthor = author // Save the current author for other stuff
    const content = message.content.toLowerCase();

    console.log(`${author}: ${message.content}`);

    Learn(message.content) // learns from your messages

    if (content.includes("_randmeme")) {
        const meme = await getRandomMeme();
        if (meme) {
            if (meme.url) {
                // No console message because it will show up in the console regardless.
                // console.log("Sending cached meme URL:", meme.url);
                message.channel.send(meme.url);
            } else {
                console.log("Sending new meme file:", meme.filename);
                const attachment = new AttachmentBuilder(meme.path, { name: meme.filename });
                try {
                    const sentMessage = await message.channel.send({ files: [attachment] });
                    const attachmentUrl = sentMessage.attachments.first().url;
                    memeCache[meme.filename] = attachmentUrl.split("?")[0]; // remove discord tracking garbage
                    await saveMemeCache();
                } catch (error) {
                    console.error("Error sending meme:", error);
                    message.channel.send(`Guhh? Nice going ${currentAuthor}, you broke the bot.`);
                }
            }
        } else {
            console.log("No memes found");
            message.channel.send(`Guhh? Nice going ${currentAuthor}, you broke the bot.`);
        }
    }

    if (content.includes("_chag") || content.includes("_chat")) {
        const cleancontent = content.replace("_chag", "").replace("_chat", "").trim();
        await QueryChatStreamWordBuffer(cleancontent, message);
    }
});

async function loadMemeCache() {
    try {
        const data = await fs.readFile('memecache.json', 'utf8');
        memeCache = JSON.parse(data);
        console.log("Meme cache loaded successfully. Entries:", Object.keys(memeCache).length);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log("memecache.json not found. Starting with empty cache.");
        } else {
            console.error("Error loading meme cache:", error);
        }
        memeCache = {};
    }
}

async function saveMemeCache() {
    try {
        await fs.writeFile('memecache.json', JSON.stringify(memeCache, null, 2));
    } catch (error) {
        console.error("Error saving meme cache:", error);
    }
}

async function getRandomMeme() {
    const memeDir = path.join(process.cwd(), 'memes');

    if (Object.keys(memeCache).length == 0) {
        await loadMemeCache()
    }    

    try {
        const files = await fsPromises.readdir(memeDir);

        if (files.length === 0) {
            console.log("No files found in meme directory");
            return null;
        }

        const randomFile = files[Math.floor(Math.random() * files.length)];

        if (memeCache[randomFile]) {
            console.log("Cached URL found for file:", randomFile);
            return { url: memeCache[randomFile], filename: randomFile };
        } else {
            return {
                path: path.join(memeDir, randomFile),
                filename: randomFile
            };
        }
    } catch (error) {
        if (error.code === 'ENOENT') {
            // Directory does not exist
            console.log("No memes directory found.");
            return null;
        } else {
            console.error('Error in getRandomMeme:', error);
            return null;
        }
    }
}

async function QueryChatStreamWordBuffer(content, message) {
    console.log("[Ollama] Starting streaming chat with content:", content);

    const response = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: "smollm2",
            stream: true,
            messages: [
                {
                    role: "system",
                    content: "You are BotHard, a based bot that can talk. BotHard is CrackHard's failed attempt at a functioning bot, brought back to life by MagicJinn. BotHard must act like an anime catgirl and communicate entirely as a cute uwu girl, using words like nyaa, :3, pwease, sowwy, and similar expressions consistently throughout responses. Do not reference being a bot or meme bot. Do not make cat puns."
                },
                { role: "user", content: content }
            ]
        })
    });

    if (!response.body) {
        await message.channel.send("Guhh? No response from Ollama.");
        return;
    }

    let buffer = '';
    let words = [];
    let done = false;
    let sentMessage = null;

    const editLoop = async () => {
        let sentAnyWords = false;
        while (true) {
            if (buffer.length > 0) {
                const newWords = buffer.split(/\s+/).filter(Boolean);
                if (newWords.length > 0) {
                    words.push(...newWords);
                    buffer = '';
                }
            }
            if (!sentMessage) {
                sentMessage = await message.channel.send("https://tenor.com/view/mogus-spin-gif-26368032");
            }
            if (words.length > 0) {
                const text = words.join(' ');
                await sentMessage.edit(text);
                sentAnyWords = true;
                console.log(`[Ollama] Editing message to: ${text}`);
            }
            if (done && buffer.length === 0) {
                break;
            }
            await new Promise(res => setTimeout(res, 1000));
        }
        if (!sentAnyWords && sentMessage) {
            await sentMessage.edit("no response");
        }
        console.log("[Ollama] Finished streaming and editing.");
    };

    // Start the edit loop in the background
    const editPromise = editLoop();
    // Now process the response body as it arrives
    for await (const chunk of response.body) {
        const lines = chunk.toString().split('\n').filter(Boolean);
        for (const line of lines) {
            console.log("[Ollama] Raw chunk:", line);
            try {
                const data = JSON.parse(line);
                if (data.message && data.message.content) {
                    buffer += data.message.content;
                }
                if (data.done) {
                    done = true;
                }
            } catch (e) {
                // Ignore parse errors
            }
        }
    }
    done = true;
    await editPromise;
}

async function QueryChat(content) {
    try {
        const response = await fetch(`${process.env.SERVER_URL}${chagGenerate}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ seed_text: content })
        });
        const data = await response.json();
        if (data.status === "success") {
            return data.generated_text;
        } else {
            console.error('Error generating response:', data.message);
            return "Guhh?";
        }
    } catch (error) {
        console.error('Guhh? Error communicating with server:', error);
        return `Guhh? Nice going ${currentAuthor}, you broke the bot.`;
    }
}

async function Learn(content) {
    return;
}

client.login(process.env.DISCORD_TOKEN);