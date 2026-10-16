#!/bin/zsh
set -e
cd "$(dirname "$0")"

# 首次安装需要联网；之后编辑、裁切和导出均在本机完成。
if ! command -v node >/dev/null 2>&1; then
  print "请先安装 Node.js 22.18 或更新版本，再双击此文件。"
  read "?按回车关闭…"
  exit 1
fi

# 已启动时直接打开，避免重复占用同一个端口。
if node --input-type=module -e '
  try {
    const response = await fetch(`http://127.0.0.1:${process.env.PORT || 4317}/api/health`, { signal: AbortSignal.timeout(700) });
    process.exit((await response.json()).service === "resume-studio" ? 0 : 1);
  } catch { process.exit(1); }
' >/dev/null 2>&1; then
  open "http://127.0.0.1:${PORT:-4317}"
  exit 0
fi
if [ ! -d node_modules ]; then
  npm ci --registry=https://registry.npmjs.org
fi
npm run build
RESUME_OPEN_BROWSER=1 npm start
