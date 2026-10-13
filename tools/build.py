#!/usr/bin/env python3
# 构建单文件版：把整个游戏打包成一个 html，双击即可玩（无需服务器）。
# 用法：python3 build.py  （需要 node/npx，首次会自动下载 esbuild）
import subprocess, pathlib, sys

root = pathlib.Path(__file__).resolve().parent.parent
bundle_dir = root / '.build'
bundle_dir.mkdir(exist_ok=True)

print('打包 JS...')
subprocess.run(
    ['npx', '-y', 'esbuild', 'src/main.js', '--bundle', '--minify', '--format=iife',
     '--outfile=.build/bundle.js'],
    check=True, cwd=root,
)
bundle = (bundle_dir / 'bundle.js').read_text(encoding='utf-8')
html = (root / 'index.html').read_text(encoding='utf-8')

tag = '<script type="module" src="src/main.js"></script>'
assert tag in html, 'index.html 结构变了，请检查 build.py'
out = html.replace(tag, '<script>\n' + bundle + '\n</script>')

dest = root / 'standalone.html'
dest.write_text(out, encoding='utf-8')
print(f'完成 → {dest}  ({dest.stat().st_size // 1024} KB)')
