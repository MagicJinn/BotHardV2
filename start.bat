@echo off

:: Pull latest changes from Git
git pull

:: Make sure we have the model from Ollama
ollama pull smollm2:360m

:: Install Node.js dependencies
cmd /c npm install

:: Every 10 seconds, try to start the Discord bot. If the bot loses internet connection, it crashes. This fixes it.
:loop
node index.js
TIMEOUT /T 10
goto loop