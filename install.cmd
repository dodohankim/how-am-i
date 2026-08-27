@echo off
rem Windows 래퍼. 본체는 install.py 다. (macOS · Linux 는 ./install.sh)
setlocal
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 "%~dp0install.py" %*
) else (
  python "%~dp0install.py" %*
)
exit /b %errorlevel%
