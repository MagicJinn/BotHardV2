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
                    memeCache[meme.filename] = attachmentUrl;
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
        const cleancontent = content.replace("_chag", "").replace("_chat", "");
        const response = await QueryChat(cleancontent);
        message.channel.send(response);
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
        console.error('Error in getRandomMeme:', error);
        return null;
    }
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
    try {
        const response = await fetch(`${process.env.SERVER_URL}${chagLearn}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message: content })
        });
        const data = await response.json();
        if (data.status === "success") {
            return "Message learned successfully.";
        } else {
            console.error('Error learning message:', data.message);
            return `Guhh? Couldn't learn that: ${data.message}`;
        }
    } catch (error) {
        console.error('Guhh? Error communicating with server:', error);
        return `Guhh? Nice going ${currentAuthor}, you broke the bot.`;
    }
}

client.login(process.env.DISCORD_TOKEN);