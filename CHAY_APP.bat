@echo off
title QuizMaster LIVE Server
cd /d "%~dp0"

echo ====================================================
echo   DANG KHOI DONG QUIZMASTER LIVE GAME SERVER...
echo ====================================================
echo.

node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [LOI] May tinh chua cai dat Node.js!
    if exist CAI_DAT_NODEJS.msi (
        echo Dang mo file cai dat CAI_DAT_NODEJS.msi...
        echo Vui long bam Next - Next - Install tren man hinh hien ra!
        start CAI_DAT_NODEJS.msi
    ) else (
        echo Vui long tai Node.js mien phi tai trang web https://nodejs.org
    )
    echo.
    pause
    exit /b
)

echo [1/2] Kiem tra thu muc node_modules...
if not exist node_modules (
    echo Dang cai dat thu vien ban dau, vui long cho trong giay lat...
    call npm.cmd install
)

echo.
echo [2/2] Dang mo Server va Trinh duyet...
start http://localhost:3000

echo.
echo ====================================================
echo   GAME SERVER DANG CHAY CHUAN XAC!
echo   Vui long KHONG DONG cua so nay trong qua trinh thi dau.
echo ====================================================
echo.

node server.js
pause
