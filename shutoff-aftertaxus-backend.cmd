@echo off
if /I "%~1"=="--help" goto :help
if /I "%~1"=="-h" goto :help
if /I "%~1"=="/?" goto :help
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0shutoff-aftertaxus-backend.ps1" %*
exit /b %ERRORLEVEL%

:help
echo Shuts off the AfterTaxUS backend Lambda by setting reserved concurrency to 0.
echo.
echo Usage:
echo   shutoff-aftertaxus-backend.cmd
echo   shutoff-aftertaxus-backend.cmd -Region us-west-2 -FunctionName helloWorld-portfolio
exit /b 0
