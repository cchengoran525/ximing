#!/bin/bash
# 双击启动《夕明 · 余烬之城》（需要系统装有 python3）
cd "$(dirname "$0")"
python3 serve.py &
SERVER_PID=$!
sleep 1
open "http://localhost:8130/index.html"
echo "游戏已在浏览器打开（端口 8130）。关闭本窗口即退出服务器。"
wait $SERVER_PID
