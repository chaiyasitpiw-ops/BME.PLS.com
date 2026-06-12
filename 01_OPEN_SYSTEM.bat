@echo off
set BME_DATA_DIR=%~dp0send-hospital-data
powershell -ExecutionPolicy Bypass -File "%~dp0send-hospital-system\start-public-link.ps1"
pause
