@echo off
git status
set /p msg=Commit message: 
set msg=%msg:^"=""%
git add --all
git commit -m "%msg%"
