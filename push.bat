@echo off
set secs=2
git push || set secs=60
timeout /t %secs%
