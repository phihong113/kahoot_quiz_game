@echo off
title QuizMaster LIVE Server
echo ====================================================
echo   DANG KHOI DONG QUIZMASTER LIVE GAME SERVER...
echo ====================================================
echo.
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [LOI] May tinh chua cai dat Node.js!
    echo Vui long tai & cai Node.js (mien phi) tai: https://nodejs.org
    pause
    exit
)

echo [1/2] Kiem tra thu muc node_modules...
if not exist node_modules (
    echo Dang cai dat thu vien ban dau...
    npm install
)

echo.
echo [2/2] Dang mo Server & Trinh duyet...
start http://localhost:3000
echo.
echo ====================================================
echo  MO PHONG ONLINE CHO HOC SINH DUNG 4G/5G (TUY CHON):
echo  Mo 1 cua so moi va go lenh: npx localtunnel --port 3000
echo ====================================================
echo.
npm start
