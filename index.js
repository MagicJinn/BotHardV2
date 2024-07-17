import dotenv from "dotenv";
dotenv.config();
import fetch from 'node-fetch';
import fs from 'fs';
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

async function Login() {
    let attempts = 0
    while (true) {
        try {
            await client.login(process.env.DISCORD_TOKEN);
            console.log("Logged in successfully");
            break; // Break if login is successful
        } catch (error) {
            attempts++
            if (attempts % 120 == 0) console.error(`Login attempt ${attempts} failed:`, error);

            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds before retrying
        }
    }
}

Login()

client.on("messageCreate", async (message) => {
    let content = message.content;
    console.log(content);
    content = content.toLowerCase();

    if (content === "_randmeme") {
        const meme = await getRandomMeme();
        if (meme) {
            const attachment = new AttachmentBuilder(meme.path, { name: meme.filename });
            message.channel.send({ files: [attachment] });
        } else {
            message.channel.send("Sorry, I couldn't find any memes.");
        }
    } else if (content.includes("_chag") || content.includes("_chat")) {
        message.content = message.content.replace("_chag", "").replace("_chat", "");
        const response = await QuerryChat(message);
        message.channel.send(response);
    }
});

async function getRandomMeme() {
    const memeDir = path.join(process.cwd(), 'memes');

    return new Promise((resolve, reject) => {
        fs.readdir(memeDir, (err, files) => {
            if (err) {
                console.error('Error reading meme directory:', err);
                resolve(null);
                return;
            }

            if (files.length === 0) {
                resolve(null);
                return;
            }

            const randomFile = files[Math.floor(Math.random() * files.length)];
            resolve({
                path: path.join(memeDir, randomFile),
                filename: randomFile
            });
        });
    });
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
