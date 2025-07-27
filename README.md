# BotHardV2

*This README was initially made by an AI and edited.*

## Setup

You'll need to install [Ollama](https://ollama.com/) and Node.js to get this running. The rest of the setup is automatic.

### Environment Variables

Create a `.env` file in the project root with your Discord bot token:

```env
DISCORD_TOKEN=your_bot_token_here
```

### Required Files

- Create a `memes/` folder and add some meme files to it
- The bot will automatically create `memecache.json` to cache uploaded memes

## What does it do?

- Pulls random memes out of a folder called `memes`. (You have to create that folder yourself and put some files in it!)
- Chats with users when they use a chat command, with a 1/55 chance to do it unprompted.
- Has three commands:
  - `_randmeme` – grabs a random meme from that folder
  - `_chat` and `_chag` – both do the same thing (these are just chat commands)

## Technical Details

- Uses Ollama with the `smollm2:360m` model (automatically pulled on startup)
- Memes are cached after first upload to avoid re-uploading
- Auto-restart: The start script restarts the bot every 10 seconds if it crashes
- Requires Ollama to be running locally on port 11434 (default)
