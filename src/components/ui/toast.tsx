"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type FocusEvent,
} from "react";

import { cx } from "@/lib/cx";

import { ICON_BUTTON } from "./button-classes";
import { CloseIcon } from "./icons";

/**
 * Toast — 짧은 알림 (DESIGN.md §9.2 Toast · §6.2 배출 · §4.4 위치, D0-12)
 *
 * - `toast({ message })`를 어디서든(클라이언트 섬) 부르면 페이지에 하나 둔 `<Toaster />`가 보여 준다. 전역 상태 라이브러리
 *   없이 모듈 안 구독자 목록(이벤트)으로 잇는다. 새 토스트가 오면 지금 것을 바꾼다(한 번에 하나).
 * - 모양: 최소 48px, 면 --ink · 글자 --paper 14px 800, 그림자 `--shadow-print-accent`, 직각. 왼쪽 키 칸(12px, 오른쪽 2px
 *   점선)에 종류("새 소식"·"공유"·"알림"). 액션은 텍스트 링크(글자 --paper), 포커스 링은 --paper(색 면 안 재정의).
 * - 위치: 화면 아래 가운데, 바닥에서 76px(1023 이하 — 하단 탭 위) / ≥1024 28px, z 40. 오프라인 띠(M1-37)가 보이면 띠 높이만큼
 *   더 위(`data-slot="toaster"` — globals.css §8).
 * - 동작: 배출 모션(`animate-eject`, base — 모션 줄이기면 0), 2.4초 뒤 사라짐. 포인터가 올라가 있거나 토스트 안에 포커스가
 *   있으면 멈췄다가 벗어나면 처음부터 다시 잰다(WCAG 2.2.1 — 액션을 누를 시간을 준다).
 * - 접근성: `aria-live="polite" aria-atomic="true"` 영역 하나를 늘 DOM에 두고 내용만 바꾼다(영역을 새로 만들면 읽지 않는
 *   화면 낭독기가 있다).
 * - 닫기 버튼(선택, `dismissible`): 44×44 아이콘 버튼 "알림 닫기". 혼합안 시안에는 없고 D0-12에서 더했다 — 액션이 있는
 *   토스트를 기다리지 않고 닫고 싶을 때 쓴다(기본 꺼짐).
 * - 액션 포커스(선택, `focusAction`): 띄우면 액션 버튼으로 포커스를 옮긴다 — 실패한 동작의 대체 경로만(M1-35). 평소 알림은 포커스를
 *   옮기지 않는다(읽기만 — aria-live).
 * - 포커스 복귀: 토스트 안(액션·닫기 버튼)에 포커스가 있는 채로 토스트가 사라지면(버튼으로 닫음·교체·`dismissToast`)
 *   포커스가 `<body>`로 떨어지지 않게 토스트에 들어오기 전 요소로 되돌린다. 그 요소가 없거나 포커스를 못 받으면
 *   `<main id="main" tabindex="-1">`(DESIGN §10 건너뛰기 링크 대상)로 보낸다(D0-12 리뷰).
 */

/** 포커스를 되돌릴 곳이 없을 때 대상 — 본문(DESIGN §10 랜드마크 `<main id="main" tabindex="-1">`) */
export const TOAST_FOCUS_FALLBACK_ID = "main";

/** 키 칸 문구(DESIGN §9.2) */
export type ToastKind = "새 소식" | "공유" | "알림";

export interface ToastOptions {
  /** 본문(예: "링크를 복사했어요") */
  message: string;
  /** 키 칸(기본 "알림") */
  kind?: ToastKind;
  /** 액션 하나(예: "새로고침") — 누르면 실행하고 닫는다 */
  action?: { label: string; onClick: () => void };
  /** 보이는 시간(ms, 기본 2400) */
  duration?: number;
  /** 닫기 버튼(기본 false) */
  dismissible?: boolean;
  /**
   * 띄우면 액션 버튼으로 포커스를 옮긴다(기본 false) — 실패한 동작의 대체 경로처럼 키보드로 바로 닿아야 할 때만(M1-35 복사 실패 "링크 열기").
   * 포커스가 안에 있는 동안 시간이 멈추고, 닫히면 아래 포커스 복귀 규칙대로 들어오기 전 요소로 돌아간다
   */
  focusAction?: boolean;
}

interface ToastItem extends ToastOptions {
  id: number;
}

/** 자동으로 사라지기까지(ms) — DESIGN §6.2 "2.4초 뒤 사라짐" */
export const TOAST_DURATION_MS = 2400;

type ToastEvent =
  { type: "show"; item: ToastItem } | { type: "dismiss"; id?: number };
type Listener = (event: ToastEvent) => void;

const listeners = new Set<Listener>();
let lastId = 0;

function emit(event: ToastEvent): void {
  for (const listener of listeners) listener(event);
}

/** 토스트를 띄운다. 돌려주는 id로 `dismissToast(id)`를 부를 수 있다. `<Toaster />`가 없으면 아무 일도 없다. */
export function toast(options: ToastOptions): number {
  lastId += 1;
  emit({ type: "show", item: { ...options, id: lastId } });
  return lastId;
}

/** 지금 토스트를 닫는다(id를 주면 그 토스트가 보일 때만) */
export function dismissToast(id?: number): void {
  emit({ type: "dismiss", id });
}

/** 페이지에 하나 둔다(레이아웃 끝). 토스트가 없어도 `aria-live` 영역은 늘 있다. */
export function Toaster({ className }: { className?: string }) {
  const [item, setItem] = useState<ToastItem | null>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const listener: Listener = (event) => {
      if (event.type === "show") {
        setItem(event.item);
        setPaused(false);
        return;
      }
      setItem((current) =>
        event.id === undefined || current?.id === event.id ? null : current,
      );
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!item || paused) return;
    const timer = setTimeout(
      () => setItem(null),
      item.duration ?? TOAST_DURATION_MS,
    );
    return () => clearTimeout(timer);
  }, [item, paused]);

  const close = useCallback(() => setItem(null), []);

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      // 오프라인 띠가 보이면 그 높이만큼 위로 올린다(globals.css §8 — M1-37)
      data-slot="toaster"
      className={cx(
        "pointer-events-none fixed inset-x-0 bottom-19 z-40 flex justify-center px-edge lg:bottom-7",
        className,
      )}
    >
      {item ? (
        <LiveToast
          key={item.id}
          kind={item.kind}
          action={
            item.action
              ? {
                  label: item.action.label,
                  // 먼저 닫고 실행한다 — 액션이 새 토스트를 띄우면 그것이 남는다
                  onClick: () => {
                    close();
                    item.action?.onClick();
                  },
                }
              : undefined
          }
          onDismiss={item.dismissible ? close : undefined}
          focusAction={item.focusAction === true && item.action !== undefined}
          onPointerEnter={() => setPaused(true)}
          onPointerLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) {
              setPaused(false);
            }
          }}
        >
          {item.message}
        </LiveToast>
      ) : null}
    </div>
  );
}

/**
 * `Toaster`가 띄운 토스트 한 장 — 안에 포커스가 있는 채로 사라지면 포커스를 되돌린다. `focusAction`이면 띄울 때 액션으로 포커스를 옮긴다.
 * 지워지는 컴포넌트의 layout effect 정리 함수는 DOM 노드를 떼기 전에 실행되므로, 이때는 아직 `activeElement`가 토스트 안이다.
 */
function LiveToast({
  onFocus,
  focusAction = false,
  ...props
}: ToastViewProps & { focusAction?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  /** 토스트에 들어오기 전 포커스(키보드로 Tab해 들어온 곳 · `focusAction`이 옮기기 전 요소) */
  const previous = useRef<HTMLElement | null>(null);

  // 액션 포커스 — 액션 버튼(토스트의 첫 버튼)으로. 들어오기 전 요소는 onFocus의 relatedTarget으로 기록된다
  useEffect(() => {
    if (focusAction) ref.current?.querySelector<HTMLElement>("button")?.focus();
  }, [focusAction]);

  useLayoutEffect(() => {
    const el = ref.current;
    return () => {
      if (!el) return;
      const doc = el.ownerDocument;
      if (!el.contains(doc.activeElement)) return;
      const back = previous.current;
      if (back?.isConnected && !el.contains(back)) {
        back.focus();
        if (doc.activeElement === back) return;
      }
      doc
        .getElementById(TOAST_FOCUS_FALLBACK_ID)
        ?.focus({ preventScroll: true });
    };
  }, []);

  function handleFocus(event: FocusEvent<HTMLDivElement>) {
    const from = event.relatedTarget;
    if (from instanceof HTMLElement && !event.currentTarget.contains(from)) {
      previous.current = from;
    }
    onFocus?.(event);
  }

  return <ToastView ref={ref} onFocus={handleFocus} {...props} />;
}

/** 토스트 액션 — 텍스트 링크 버튼. data-* 속성은 버튼에 그대로 붙는다(견본 강제 상태 표시 등) */
export interface ToastAction {
  label: string;
  onClick?: () => void;
  [key: `data-${string}`]: string | undefined;
}

export interface ToastViewProps extends ComponentProps<"div"> {
  kind?: ToastKind;
  action?: ToastAction;
  /** 주면 닫기 버튼(44×44)을 단다 */
  onDismiss?: () => void;
  /** 배출 모션(기본 true). 견본처럼 늘 떠 있는 정적 토스트는 false */
  animated?: boolean;
}

/** 토스트 한 장의 모양 — `Toaster`가 쓰고, 견본은 정적으로 그린다 */
export function ToastView({
  kind = "알림",
  action,
  onDismiss,
  animated = true,
  className,
  children,
  ...props
}: ToastViewProps) {
  return (
    <div
      className={cx(
        "pointer-events-auto inline-flex min-h-12 items-center gap-3 bg-ink text-sm font-extrabold text-paper shadow-print-accent [--ring:var(--paper)]",
        // 오른쪽 끝이 버튼이면 버튼 안쪽 여백이 있어 6px, 글자로 끝나면 16px
        action || onDismiss ? "pr-1.5" : "pr-4",
        animated && "animate-eject",
        className,
      )}
      {...props}
    >
      <span className="grid place-items-center self-stretch border-r-2 border-dotted border-r-paper/55 px-2.5 text-xs">
        {kind}
      </span>
      <span>{children}</span>
      {action ? <ToastActionButton {...action} /> : null}
      {onDismiss ? (
        <button
          type="button"
          aria-label="알림 닫기"
          onClick={onDismiss}
          className={cx(ICON_BUTTON, action && "-ml-2")}
        >
          <CloseIcon size={16} />
        </button>
      ) : null}
    </div>
  );
}

function ToastActionButton({ label, onClick, ...data }: ToastAction) {
  return (
    <button
      type="button"
      onClick={onClick}
      // 텍스트 링크 변형(DESIGN §9.2)과 같은 모양에 글자만 --paper(색 면 위). cx는 병합하지 않아 색을 바꿔 적는다
      className="relative ml-1 inline-flex min-h-11 items-center bg-transparent px-2 text-[13px] font-extrabold text-paper underline decoration-1 underline-offset-4 transition-[text-decoration-thickness] duration-fast hover:decoration-2"
      {...data}
    >
      {label}
    </button>
  );
}
