#!/usr/bin/env python3
# lcp.mjs 출력(JSON 줄) → 표. 사용: python3 -I docs/research/m1-39-perf/summarize.py results/final-slow4g.jsonl …
# 줄 앞에 {"build"|"variant": 이름, "r": …}로 감싼 형식(README의 실행 예)도 읽는다.
import json, sys

for path in sys.argv[1:]:
    print(f"## {path}")
    for line in open(path, encoding="utf-8"):
        d = json.loads(line)
        tag = d.get("build") or d.get("variant") or ""
        r = d.get("r", d)
        ends = [f["end"] for f in r.get("fonts", [])]
        print(
            f"{tag:18} {r['target']:34} FCP {r['fcp']:5} LCP {r['lcp']:5} CLS {r['cls']:.4f}(최대 {r.get('clsMax', r['cls']):.4f})"
            f" TBT {r.get('tbt', '-'):>4} HTML {r.get('htmlKB', '-')}KB 웹폰트 끝 {max(ends) if ends else '-'}"
        )
