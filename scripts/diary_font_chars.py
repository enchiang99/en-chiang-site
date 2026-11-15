# 收集網站上所有會出現的字，給日記本手寫字型做「只留用得到的字」的瘦身。
# GitHub Action（.github/workflows/diary-font.yml）每次文章或資料更新時會自動跑。
import glob, io, sys
paths = []
for pat in ['_about_*/**/*', '_data/**/*', 'index.html', '_layouts/diary.html', 'assets/diary.js']:
    paths += glob.glob(pat, recursive=True)
chars = set(chr(c) for c in range(0x20, 0x7f))
chars |= set('，。、；：？！「」『』（）《》〈〉—…～・｜／　ABOUTEN0123456789')
for p in paths:
    try:
        chars |= set(io.open(p, encoding='utf-8').read())
    except (IsADirectoryError, UnicodeDecodeError):
        pass
chars = {c for c in chars if c.isprintable() or c == '　'}
out = sys.argv[1] if len(sys.argv) > 1 else 'chars.txt'
io.open(out, 'w', encoding='utf-8').write(''.join(sorted(chars)))
print(len(chars), 'chars')
