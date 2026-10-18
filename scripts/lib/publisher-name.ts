/**
 * 출처 매체명 — 소스 이름에서 섹션·괄호 설명을 뗀 이름(카드 `src[].n`, 클러스터 보도 매체 수, 이적 단계의 '여러 매체 확인' — 순수 함수).
 * news-file.ts가 다시 내보낸다(기존 import 유지). 분류 단계(classify.ts → transfer-extract.ts)가 news-file.ts를 거치지 않고 쓰려고 따로 둔다
 * (news-file.ts는 classify.ts를 import한다 — 순환 import 방지).
 *
 * 구현은 src/lib/publisher-name.ts — `/about` 출처 목록(M1-36)이 카드와 같은 매체명으로 묶도록 화면·파이프라인이 한 규칙을 쓴다.
 */
export { publisherNameOf } from "@/lib/publisher-name";
