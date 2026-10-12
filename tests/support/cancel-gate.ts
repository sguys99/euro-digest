/**
 * 뉴스 실패 → 경기 데이터 취소를 결정적으로 시험하는 문 (M1-48 — 경기 데이터는 뉴스 피드 수집과 병렬로 시작한다).
 * 경기 데이터 프로바이더의 간격 대기(sleep)를 취소 로그(`collect.matchdata.cancel`)가 찍힐 때까지 붙잡는다. 그래서 첫 요청이
 * 이미 나갔더라도 다음 요청 전에 반드시 취소 신호를 본다(가짜 시계·즉시 응답에서도 경합 없이 "첫 요청 이하"가 된다).
 */
import {
  createLogger,
  type LogRecord,
  type Logger,
} from "../../scripts/lib/logger";

export interface CancelGate {
  /** 프로바이더 sleep 자리에 넣는다 */
  sleep: (ms: number) => Promise<void>;
  /** 취소 로그를 보면 문을 연다 — records에도 쌓는 로거 */
  logger: (records: LogRecord[]) => Logger;
}

export function cancelGate(): CancelGate {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return {
    sleep: async () => {
      await opened;
    },
    logger: (records) =>
      createLogger({
        scope: "collect",
        format: "json",
        sink: (_line, record) => {
          records.push(record);
          if (record.event === "collect.matchdata.cancel") open();
        },
      }),
  };
}
