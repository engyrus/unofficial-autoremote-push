@echo off
set secs=2
git status
set /p msg=Commit message: 
set msg=%msg:"=%
git add --all
git commit --message "!msg!" || set secs=60
timeout /t %secs%
