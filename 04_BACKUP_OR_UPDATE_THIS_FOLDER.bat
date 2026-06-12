@echo off
set BME_DATA_DIR=%~dp0send-hospital-data
powershell -ExecutionPolicy Bypass -File "%~dp0send-hospital-system\export-to-new-computer.ps1"
pause
