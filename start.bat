@echo off

:: Pull latest changes from Git
git pull


:: Install Node.js dependencies
cmd /c npm install
cmd /c npm audit fix

:: Make sure we have the model from Ollama
:: Run npm stuff first to make sure Ollama has time to start up in the background
ollama pull smollm2:360m

:: Every 10 seconds, try to start the Discord bot. If the bot loses internet connection, it crashes. This fixes it.
:loop
node index.js
TIMEOUT /T 10
goto loop