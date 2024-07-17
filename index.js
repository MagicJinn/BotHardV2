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

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent
    ]
});

let memeCache = {};

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

async function Login() {
    let attempts = 0;
    while (true) {
        try {
            await client.login(process.env.DISCORD_TOKEN);
            console.log("Logged in successfully");
            await loadMemeCache();
            break;
        } catch (error) {
            attempts++;
            if (attempts % 120 == 0) console.error(`Login attempt ${attempts} failed:`, error);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

client.on("messageCreate", async (message) => {
    const author = message.author
    const content = message.content.toLowerCase();
    console.log(`${author}: ${content}`);

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
                    message.channel.send(`Guhh? Nice going ${author}, you broke the bot.`);
                }
            }
        } else {
            console.log("No memes found");
            message.channel.send(`Guhh? Nice going ${author}, you broke the bot.`);
        }
    }
    if (content.includes("_chag") || content.includes("_chat")) {
        message.content = message.content.replace("_chag", "").replace("_chat", "");
        const response = await QuerryChat(message);
        message.channel.send(response);
    }
});

async function getRandomMeme() {
    const memeDir = path.join(process.cwd(), 'memes');
    console.log("Meme directory:", memeDir);

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

async function QuerryChat(message) {
    const author = message.author;
    const content = message.content;
    try {
        const response = await fetch(process.env.SERVER_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ user_label: author.username, message: content })
        });

        const data = await response.json();
        return data.response
    } catch (error) {
        console.error('Guhh? Error communicating with server:', error);
        return `Guhh? Nice going ${author}, you broke the bot.`;
    }
}

Login()
