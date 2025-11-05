@echo off
REM Credits System Setup - Windows Batch Script
echo.
echo ===================================
echo Credits System Setup
echo ===================================
echo.

:menu
echo Please select an option:
echo.
echo 1. Configure environment variables (Interactive)
echo 2. View database migration SQL
echo 3. Test Supabase connection
echo 4. Install dependencies
echo 5. Build desktop app
echo 6. Run development server
echo 7. Exit
echo.
set /p choice="Enter your choice (1-7): "

if "%choice%"=="1" goto config
if "%choice%"=="2" goto migration
if "%choice%"=="3" goto test
if "%choice%"=="4" goto install
if "%choice%"=="5" goto build
if "%choice%"=="6" goto dev
if "%choice%"=="7" goto end
goto menu

:config
echo.
echo Running interactive configuration...
node setup-credits.js
pause
goto menu

:migration
echo.
echo ===================================
echo Database Migration SQL
echo ===================================
echo.
echo Copy and run this in Supabase SQL Editor:
echo.
type credits-migration.sql
echo.
echo.
echo Instructions:
echo 1. Go to your Supabase Dashboard
echo 2. Navigate to SQL Editor
echo 3. Create a new query
echo 4. Copy the SQL above
echo 5. Paste and click "Run"
echo.
pause
goto menu

:test
echo.
echo Testing Supabase connection...
node -e "const { createClient } = require('@supabase/supabase-js'); require('dotenv').config(); const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_ANON_KEY || ''); supabase.from('subscriptions').select('count').limit(1).then(({ data, error }) => { if (error) { console.log('❌ Connection failed:', error.message); } else { console.log('✅ Supabase connected successfully!'); } }).catch(err => console.log('❌ Error:', err.message));"
echo.
pause
goto menu

:install
echo.
echo Installing dependencies...
call npm install
echo.
echo ✅ Dependencies installed!
pause
goto menu

:build
echo.
echo Building desktop app...
call npm run build:prod
echo.
echo ✅ Build complete!
pause
goto menu

:dev
echo.
echo Starting development server...
echo Press Ctrl+C to stop
call npm run dev
pause
goto menu

:end
echo.
echo Setup complete! Next steps:
echo.
echo 1. Edit .env with your credentials (if not done)
echo 2. Run database migration in Supabase
echo 3. Test payment: npm run dev
echo 4. Build app: npm run build:prod
echo.
echo Documentation: CREDITS_SYSTEM_README.md
echo.
pause
exit
