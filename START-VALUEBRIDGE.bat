@echo off
setlocal
set "APP_ROOT=%~dp0"
if not exist "%APP_ROOT%RUNTIME\node.exe" goto find_release
goto launch_local

:find_release
if exist "%APP_ROOT%releases\VALUEBRIDGE-360-PORTABLE\START-VALUEBRIDGE.bat" (
  echo Using the portable release bundled with this project folder...
  call "%APP_ROOT%releases\VALUEBRIDGE-360-PORTABLE\START-VALUEBRIDGE.bat"
  exit /b %errorlevel%
)
echo VALUEBRIDGE 360 runtime was not found beside this launcher or in the project's releases folder.
echo Open releases\VALUEBRIDGE-360-PORTABLE and run START-VALUEBRIDGE.bat,
echo or extract the complete VALUEBRIDGE-360-PORTABLE.zip first.
pause
exit /b 1

:launch_local
cd /d "%~dp0"
if not exist "%~dp0APPLICATION\index.html" (
  echo VALUEBRIDGE 360 cannot start because the application files are missing.
  echo Re-extract the complete package and try again.
  pause
  exit /b 1
)
if not exist "%~dp0DATA\analytics\current-snapshot.json" (
  echo The analytics snapshot pointer is missing.
  pause
  exit /b 1
)
echo Starting VALUEBRIDGE 360 using original BancABC CSV customer IDs and source records...
echo Keep this window open during the presentation. Press Ctrl+C to stop.
"%~dp0RUNTIME\node.exe" "%~dp0RUNTIME\serve.mjs"
if errorlevel 1 (
  echo.
  echo The local application did not start. If port 4174 is already in use,
  echo close the other local server and try again.
  pause
)
endlocal
