@echo off
if /I "%~1"=="--help" goto :help
if /I "%~1"=="-h" goto :help
if /I "%~1"=="/?" goto :help
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0turn-back-on-aftertaxus-backend.ps1" %*
exit /b %ERRORLEVEL%

:help
echo Turns the AfterTaxUS backend Lambda back on by deleting reserved concurrency.
echo.
echo Usage:
echo   turn-back-on-aftertaxus-backend.cmd
echo   turn-back-on-aftertaxus-backend.cmd -Region us-west-2 -FunctionName helloWorld-portfolio
exit /b 0
