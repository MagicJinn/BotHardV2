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
        QuerryChat(message);
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
        message.channel.send(data.response);  // Assuming your Flask server sends a JSON response with a "response" field
    } catch (error) {
        console.error('Guhh? Error communicating with server:', error);
        message.channel.send('Guhh? Sorry, something went wrong while communicating with the server.');
    }
}
