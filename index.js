import dotenv from "dotenv";
dotenv.config();

import fetch from 'node-fetch';
import {
    Client,
    GatewayIntentBits
} from "discord.js";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent
    ]
});

client.login(process.env.DISCORD_TOKEN);

client.on("messageCreate", async (message) => {
    const content = message.content;
    console.log(content)

    const userWantsToChat = content.includes("_chag") || content.includes("_chat");
    if (userWantsToChat) {
        message.content = message.content.replace("_chag", "").replace("_chat", "")
        const response = await QuerryChat(message);
        message.channel.send(response)
    }
});

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
