@echo off
rem Windows 래퍼. 본체는 dev.py 다. (macOS · Linux 는 ./dev.sh)
setlocal
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 "%~dp0dev.py" %*
) else (
  python "%~dp0dev.py" %*
)
exit /b %errorlevel%
