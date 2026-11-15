# 把字型縮成只含 chars.txt 裡的字，並改名（辰宇落雁體採 OFL 授權，改作版不能沿用原字型名稱）。
import sys, subprocess
from fontTools.ttLib import TTFont
src, chars, out = sys.argv[1], sys.argv[2], sys.argv[3]
subprocess.check_call(['pyftsubset', src, '--text-file=' + chars, '--no-hinting', '--desubroutinize', '--output-file=/tmp/en-hand.ttf'])
f = TTFont('/tmp/en-hand.ttf')
names = {1: 'EN Hand', 3: 'EN Hand subset', 4: 'EN Hand', 6: 'ENHand', 16: 'EN Hand'}
for r in f['name'].names:
    if r.nameID in names:
        r.string = names[r.nameID]
f.flavor = 'woff2'
f.save(out)
