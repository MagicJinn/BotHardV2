@echo off

git pull
pip install -r requirements.txt
npm install

:: Start the python LLM server in a new window
start "Python Script" cmd /k "python chag.py"

:: Every 10 seconds, try to start the discord bot. If the bot loses internet connection, it crashes. This fixes it.
:loop
node index.js
TIMEOUT /T 10
goto loop
