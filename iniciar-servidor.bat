@echo off
REM ============================================================
REM  Tudo Sobre Nada - servidor local
REM  Clique duas vezes neste arquivo para ligar o site.
REM  Depois abra: http://localhost:8777
REM  Para desligar: feche esta janela (ou Ctrl+C nela).
REM ============================================================

cd /d "%~dp0"

echo.
echo   Tudo Sobre Nada - iniciando servidor local...
echo   Pasta: %CD%
echo   Endereco: http://localhost:8777
echo   Na rede:  http://192.168.1.2:8777  (ajuste se o IP mudar)
echo.
echo   Para desligar, feche esta janela.
echo.

where python >nul 2>nul
if %errorlevel%==0 (
    python -m http.server 8777 --bind 0.0.0.0
) else (
    echo   ERRO: Python nao encontrado no PATH.
    echo   Instale em https://www.python.org/downloads/ e marque "Add Python to PATH".
    pause
)
