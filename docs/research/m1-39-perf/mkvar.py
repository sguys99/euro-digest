#!/usr/bin/env python3
# M1-39 — 빌드 결과(out/)를 복사해 HTML의 웹폰트 preload 링크만 바꾼 변형 6가지를 만든다(빌드 없이 preload 효과만 비교).
# 사용: python3 -I docs/research/m1-39-perf/mkvar.py <out 폴더> <변형을 둘 폴더>   → 폴더마다 h2serve.mjs로 띄워 lcp.mjs로 잰다.
import glob, os, re, shutil, sys

SRC, DST = sys.argv[1], sys.argv[2]
BASE = os.environ.get("BASE_PATH", "/euro-digest")
F = {
    "s400": f"{BASE}/fonts/eurodigest-sans/eurodigest-sans-400.ksx.woff2",
    "s800": f"{BASE}/fonts/eurodigest-sans/eurodigest-sans-800.ksx.woff2",
    "b600": f"{BASE}/fonts/barlow-condensed/BarlowCondensed-SemiBold.latin.woff2",
    "b800": f"{BASE}/fonts/barlow-condensed/BarlowCondensed-ExtraBold.latin.woff2",
}
VARIANTS = {
    "v0_d0-11": ["s400", "b800"],  # D0-11~M1-37(한글 400 + Barlow 800)
    "v1_none": [],  # M1-39 결정(2026-10-24 사용자 승인)
    "v2_all": ["s400", "s800", "b600", "b800"],
    "v3_s400b800b600": ["s400", "b800", "b600"],
    "v4_s800b800b600": ["s800", "b800", "b600"],
    "v5_b800b600": ["b800", "b600"],
}
PRELOAD = re.compile(r'<link rel="preload" href="[^"]+\.woff2" as="font"[^>]*/>')
CHARSET = re.compile(r'<meta charSet="utf-8"/>', re.I)
os.makedirs(DST, exist_ok=True)
for name, faces in VARIANTS.items():
    out = os.path.join(DST, name)
    if os.path.exists(out):
        continue
    shutil.copytree(SRC, out)
    links = "".join(f'<link rel="preload" href="{F[f]}" as="font" crossorigin="" type="font/woff2"/>' for f in faces)
    for html in glob.glob(os.path.join(out, "**", "*.html"), recursive=True):
        s = PRELOAD.sub("", open(html, encoding="utf-8").read())
        m = CHARSET.search(s)
        if m:  # <head> 앞쪽(문자 집합 선언 바로 뒤) — React preload()가 넣던 자리
            s = s[: m.end()] + links + s[m.end():]
        open(html, "w", encoding="utf-8").write(s)
    print(name, faces)
