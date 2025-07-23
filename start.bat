@echo off

:: Define the Conda environment name
:: set CONDA_ENV=myenv

:: Check if Conda is installed
:: where conda >nul 2>nul
:: if %errorlevel% neq 0 (
::     echo Conda is not installed. Please install Conda first.
::     exit /b 1
:: )

:: Check if the environment exists
:: call conda env list | findstr /C:"%CONDA_ENV%" >nul
:: if %errorlevel% neq 0 (
::     echo Creating Conda environment %CONDA_ENV%...
::     call conda create -y -n %CONDA_ENV% python=3.9
:: )

:: Activate the Conda environment
:: call conda activate %CONDA_ENV%

:: Pull latest changes from Git
 git pull

:: Make sure we have the model from Ollama
 ollama pull smollm2:360m

:: Install Python dependencies
:: pip install -r requirements.txt

:: Install Node.js dependencies
:: npm install
:: Exits the script for some reason

:: Start the Python LLM server in a new window
:: start "Python Script" cmd /k "conda activate %CONDA_ENV% && python chag.py"

:: Every 10 seconds, try to start the Discord bot. If the bot loses internet connection, it crashes. This fixes it.
:loop
node index.js
TIMEOUT /T 10
goto loop