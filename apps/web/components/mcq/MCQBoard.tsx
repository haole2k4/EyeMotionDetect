'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import { useGaze } from '../gaze/GazeProvider';

interface ExtendedGazeStats {
  snappedGaze?: [number, number];
  activeTargetKey?: string | null;
  saccadeEvent?: 'none' | 'next' | 'prev';
  pursuitProgress?: number;
  pursuitConfirmed?: boolean;
  headPoseOk?: boolean;
  lightingScore?: number;
  currentRegion?: string;
  dwellProgress?: number;
}

interface ExtendedGazeContext {
  stats?: ExtendedGazeStats | null;
  setInteractionMode?: (mode: 'default' | 'confirm') => void;
  registerMagneticTargets?: (
    targets: Array<{ id: number; key: string; x: number; y: number; width: number; height: number; gravityRadius?: number }>,
  ) => void;
  clearMagneticTargets?: () => void;
  recordImplicitDrift?: (targetX: number, targetY: number) => void;
  setPursuitOrbitTarget?: (target: { x: number; y: number; radius?: number } | null) => void;
  resetDwell?: (cooldownMs?: number) => void;
  accessibilityProfile?: {
    dominantEye: 'both' | 'left' | 'right';
    triggerMode: 'blink' | 'dwell';
    dwellTimeMs: number;
    blinkDurationMs: number;
    ttsEnabled: boolean;
    magneticStrength: number;
  };
}

interface MCQBoardProps {
  question: string;
  options: {
    A: string;
    B: string;
    C: string;
    D: string;
  };
  selectedAnswer?: 'A' | 'B' | 'C' | 'D' | null;
  onAnswerSelected?: (answer: 'A' | 'B' | 'C' | 'D') => void;
  onPrev?: () => void;
  onNext?: () => void;
  onSubmit?: () => void;
}

type DwellTone = 'blue' | 'emerald' | 'rose';

const SWEEP_TONE_CLASSES: Record<DwellTone, { overlay: string; bar: string }> = {
  blue: {
    overlay: 'bg-[#0066CC]/[0.09] border-r-2 border-[#0066CC]',
    bar: 'bg-[#0066CC]',
  },
  emerald: {
    overlay: 'bg-[#12783D]/[0.09] border-r-2 border-[#12783D]',
    bar: 'bg-[#12783D]',
  },
  rose: {
    overlay: 'bg-[#D70015]/[0.09] border-r-2 border-[#D70015]',
    bar: 'bg-[#D70015]',
  },
};

interface GazeDwellSweepProps {
  active: boolean;
  progress: number;
  tone?: DwellTone;
}

function GazeDwellSweep({ active, progress, tone = 'blue' }: GazeDwellSweepProps) {
  if (!active && progress <= 0) return null;

  const clamped = Math.max(active ? 3 : 0, Math.min(100, progress));
  const toneStyles = SWEEP_TONE_CLASSES[tone];

  return (
    <>
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-0 left-0 transition-[width] duration-75 ease-linear ${toneStyles.overlay}`}
        style={{ width: `${clamped}%` }}
      />
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute bottom-0 left-0 h-2 transition-[width] duration-75 ease-linear ${toneStyles.bar}`}
        style={{ width: `${clamped}%` }}
      />
    </>
  );
}

interface OptionCardProps {
  letter: 'A' | 'B' | 'C' | 'D';
  text: string;
  cardRef: React.RefObject<HTMLDivElement | null>;
  isSelected: boolean;
  isActive: boolean;
  dwellProgress: number;
  onSelect: () => void;
}

function OptionCard({
  letter,
  text,
  cardRef,
  isSelected,
  isActive,
  dwellProgress,
  onSelect,
}: OptionCardProps) {
  const cardSurfaceClass = isSelected
    ? 'bg-[#ECFDF3] border-2 border-[#12783D] shadow-[0_6px_18px_-4px_rgba(18,120,61,0.18),inset_0_1px_0_rgba(255,255,255,0.8)]'
    : isActive
      ? 'bg-[#F5F9FF] border-2 border-[#0066CC] shadow-[0_12px_28px_-6px_rgba(0,102,204,0.22),inset_0_1px_0_rgba(255,255,255,0.9)]'
      : 'bg-white/95 border-[1.5px] border-black/[0.10] shadow-[0_2px_12px_-2px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.03),inset_0_1px_0_rgba(255,255,255,0.95)] hover:border-[#0066CC]';

  const letterBadgeClass = isSelected
    ? 'bg-[#12783D] text-white border-[#12783D]'
    : isActive
      ? 'bg-[#0066CC] text-white border-[#0066CC]'
      : 'bg-[#F2F2F7] border-black/[0.08] text-[#1D1D1F]';

  return (
    <div
      ref={cardRef}
      onClick={onSelect}
      className={`relative h-full min-h-0 cursor-pointer overflow-hidden rounded-[22px] p-5 md:p-6 flex flex-col justify-between gap-3 transition-[border-color,background-color,box-shadow] duration-150 ${cardSurfaceClass}`}
    >
      <GazeDwellSweep active={isActive} progress={dwellProgress} tone="blue" />

      <div className="relative z-10 flex items-center justify-between gap-3">
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] border text-xl font-bold transition-colors ${letterBadgeClass}`}
        >
          {letter}
        </span>

        <div className="flex items-center gap-2">
          {isSelected && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#86EFAC] bg-[#DCFCE7] px-3 py-1 text-xs font-semibold text-[#12783D]">
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
              <span>Đã chọn</span>
            </span>
          )}
          {isActive && (
            <span className="inline-flex items-center rounded-full bg-[#0066CC] px-3 py-1 text-xs font-semibold text-white tabular-nums">
              {`Đang giữ · ${Math.round(dwellProgress)}%`}
            </span>
          )}
        </div>
      </div>

      <p className="relative z-10 text-lg md:text-xl lg:text-[22px] font-medium text-[#1D1D1F] leading-snug line-clamp-4">
        {text}
      </p>
    </div>
  );
}

export function MCQBoard({
  question,
  options,
  selectedAnswer,
  onAnswerSelected,
  onPrev,
  onNext,
  onSubmit,
}: MCQBoardProps) {
  const [selected, setSelected] = useState<string | null>(selectedAnswer ?? null);
  const [saccadeNotice, setSaccadeNotice] = useState<string | null>(null);
  const [orbitAngle, setOrbitAngle] = useState(0);

  const rawGaze = useGaze();
  const gaze = rawGaze as unknown as ExtendedGazeContext;
  const {
    stats,
    setInteractionMode,
    registerMagneticTargets,
    clearMagneticTargets,
    recordImplicitDrift,
    setPursuitOrbitTarget,
    resetDwell,
  } = gaze;

  const [confirmAction, setConfirmAction] = useState<{
    id: 'A' | 'B' | 'C' | 'D' | 'PREV' | 'NEXT' | 'SUBMIT';
    label: string;
  } | null>(null);

  // Button DOM element references
  const cardARef = useRef<HTMLDivElement | null>(null);
  const cardBRef = useRef<HTMLDivElement | null>(null);
  const cardCRef = useRef<HTMLDivElement | null>(null);
  const cardDRef = useRef<HTMLDivElement | null>(null);
  const prevBtnRef = useRef<HTMLDivElement | null>(null);
  const nextBtnRef = useRef<HTMLDivElement | null>(null);
  const submitBtnRef = useRef<HTMLDivElement | null>(null);

  // Modal element references
  const modalCancelRef = useRef<HTMLDivElement | null>(null);
  const modalConfirmRef = useRef<HTMLDivElement | null>(null);
  const modalPursuitRef = useRef<HTMLDivElement | null>(null);

  const lastSaccadeHandledRef = useRef<number>(0);
  const pursuitTriggeredRef = useRef<boolean>(false);

  // Sync selected option with current question's saved answer and reset dwell cooldown
  useEffect(() => {
    setSelected(selectedAnswer ?? null);
    resetDwell?.(1200);
  }, [question, selectedAnswer, resetDwell]);

  // 1. Magnetic Target Snap Registration
  const registerTargets = useCallback(() => {
    if (confirmAction) {
      // In confirmation mode, register modal targets
      const targets: Array<{
        id: number;
        key: string;
        x: number;
        y: number;
        width: number;
        height: number;
        gravityRadius?: number;
      }> = [];

      if (confirmAction.id === 'SUBMIT') {
        if (modalCancelRef.current) {
          const r = modalCancelRef.current.getBoundingClientRect();
          targets.push({ id: 101, key: 'SAFE_MARGIN', x: r.left, y: r.top, width: r.width, height: r.height, gravityRadius: 75 });
        }
        if (modalPursuitRef.current) {
          const r = modalPursuitRef.current.getBoundingClientRect();
          targets.push({ id: 102, key: 'SUBMIT_PURSUIT', x: r.left, y: r.top, width: r.width, height: r.height, gravityRadius: 90 });
        }
        if (modalConfirmRef.current) {
          const r = modalConfirmRef.current.getBoundingClientRect();
          targets.push({ id: 103, key: 'NEXT', x: r.left, y: r.top, width: r.width, height: r.height, gravityRadius: 75 });
        }
      } else {
        if (modalCancelRef.current) {
          const r = modalCancelRef.current.getBoundingClientRect();
          targets.push({ id: 101, key: 'SAFE_MARGIN', x: r.left, y: r.top, width: r.width, height: r.height, gravityRadius: 75 });
        }
        if (modalConfirmRef.current) {
          const r = modalConfirmRef.current.getBoundingClientRect();
          targets.push({ id: 102, key: 'NEXT', x: r.left, y: r.top, width: r.width, height: r.height, gravityRadius: 75 });
        }
      }

      registerMagneticTargets?.(targets);
      return;
    }

    // Default MCQ board targets
    const refs = [
      { key: 'A', id: 0, ref: cardARef },
      { key: 'PREV', id: 1, ref: prevBtnRef },
      { key: 'B', id: 2, ref: cardBRef },
      { key: 'NEXT', id: 3, ref: nextBtnRef },
      { key: 'C', id: 4, ref: cardCRef },
      { key: 'SUBMIT', id: 5, ref: submitBtnRef },
      { key: 'D', id: 6, ref: cardDRef },
    ];

    const targets = refs
      .map(({ key, id, ref }) => {
        if (!ref.current) return null;
        const rect = ref.current.getBoundingClientRect();
        return {
          id,
          key,
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
          gravityRadius: key === 'SUBMIT' ? 85 : 70,
        };
      })
      .filter((t): t is NonNullable<typeof t> => Boolean(t));

    if (targets.length > 0) {
      registerMagneticTargets?.(targets);
    }
  }, [confirmAction, registerMagneticTargets]);

  // Keep magnetic targets synchronized with resize and content updates
  useEffect(() => {
    registerTargets();
    const rafId = requestAnimationFrame(() => registerTargets());
    const handleResize = () => registerTargets();
    window.addEventListener('resize', handleResize);

    const observer = new ResizeObserver(() => {
      registerTargets();
    });

    if (cardARef.current) observer.observe(cardARef.current);
    if (cardBRef.current) observer.observe(cardBRef.current);
    if (cardCRef.current) observer.observe(cardCRef.current);
    if (cardDRef.current) observer.observe(cardDRef.current);
    if (prevBtnRef.current) observer.observe(prevBtnRef.current);
    if (nextBtnRef.current) observer.observe(nextBtnRef.current);
    if (submitBtnRef.current) observer.observe(submitBtnRef.current);
    if (modalCancelRef.current) observer.observe(modalCancelRef.current);
    if (modalConfirmRef.current) observer.observe(modalConfirmRef.current);
    if (modalPursuitRef.current) observer.observe(modalPursuitRef.current);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
      clearMagneticTargets?.();
    };
  }, [registerTargets, clearMagneticTargets, question, confirmAction]);

  // 2. Continuous Orbiting Stimulus Animation for Smooth Pursuit
  useEffect(() => {
    let animId = 0;
    const updateOrbit = () => {
      // 1.2s period orbit
      const now = performance.now();
      const theta = ((now % 1200) / 1200) * 2 * Math.PI;
      setOrbitAngle(theta);
      animId = requestAnimationFrame(updateOrbit);
    };
    animId = requestAnimationFrame(updateOrbit);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, []);

  // Update Pursuit target center when submit is hovered or in submit modal
  useEffect(() => {
    const isSubmitActive =
      stats?.activeTargetKey === 'SUBMIT' ||
      stats?.currentRegion === 'SUBMIT' ||
      (confirmAction && confirmAction.id === 'SUBMIT');

    if (isSubmitActive) {
      const targetElement =
        confirmAction?.id === 'SUBMIT' ? modalPursuitRef.current : submitBtnRef.current;

      if (targetElement) {
        const rect = targetElement.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        setPursuitOrbitTarget?.({ x: centerX, y: centerY, radius: 48 });
      }
    } else {
      setPursuitOrbitTarget?.(null);
    }
  }, [stats?.activeTargetKey, stats?.currentRegion, confirmAction, setPursuitOrbitTarget]);

  // Handle Action Request
  const handleActionRequest = useCallback(
    (id: 'A' | 'B' | 'C' | 'D' | 'PREV' | 'NEXT' | 'SUBMIT', label: string) => {
      if (confirmAction) return;
      pursuitTriggeredRef.current = false;
      setConfirmAction({ id, label });
    },
    [confirmAction],
  );

  // 3. Implicit Drift Correction on Answer Confirmation
  const performImplicitDriftCorrection = useCallback(
    (choiceId: 'A' | 'B' | 'C' | 'D') => {
      const refMap = {
        A: cardARef,
        B: cardBRef,
        C: cardCRef,
        D: cardDRef,
      };
      const element = refMap[choiceId]?.current;
      if (element) {
        const rect = element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        recordImplicitDrift?.(centerX, centerY);
      }
    },
    [recordImplicitDrift],
  );

  // Direct answer selection on dwell completion or click (no confirmation modal)
  const handleDirectSelectAnswer = useCallback(
    (choice: 'A' | 'B' | 'C' | 'D') => {
      setSelected(choice);
      performImplicitDriftCorrection(choice);
      onAnswerSelected?.(choice);
    },
    [onAnswerSelected, performImplicitDriftCorrection],
  );

  const handleConfirm = useCallback(
    (confirmed: boolean) => {
      if (!confirmAction) return;

      if (confirmed) {
        if (['A', 'B', 'C', 'D'].includes(confirmAction.id)) {
          const answerChoice = confirmAction.id as 'A' | 'B' | 'C' | 'D';
          setSelected(answerChoice);
          performImplicitDriftCorrection(answerChoice);
          if (onAnswerSelected) onAnswerSelected(answerChoice);
        } else if (confirmAction.id === 'PREV' && onPrev) {
          onPrev();
        } else if (confirmAction.id === 'NEXT' && onNext) {
          onNext();
        } else if (confirmAction.id === 'SUBMIT' && onSubmit) {
          onSubmit();
        }
      }

      setConfirmAction(null);
      setPursuitOrbitTarget?.(null);
    },
    [confirmAction, onAnswerSelected, onPrev, onNext, onSubmit, performImplicitDriftCorrection, setPursuitOrbitTarget],
  );

  // 4. Smooth Pursuit Triggered for SUBMIT (0% accidental triggers)
  useEffect(() => {
    if (stats?.pursuitConfirmed && !pursuitTriggeredRef.current) {
      if (confirmAction?.id === 'SUBMIT') {
        pursuitTriggeredRef.current = true;
        handleConfirm(true);
      } else if (stats.activeTargetKey === 'SUBMIT' || stats.currentRegion === 'SUBMIT') {
        pursuitTriggeredRef.current = true;
        handleActionRequest('SUBMIT', 'nộp bài thi');
      }
    }
  }, [stats?.pursuitConfirmed, stats?.activeTargetKey, stats?.currentRegion, confirmAction, handleConfirm, handleActionRequest]);

  // 5. Saccadic Edge Strokes: Quick flick gestures for prev/next
  useEffect(() => {
    const saccade = stats?.saccadeEvent;
    if (!saccade || saccade === 'none') return;

    const now = Date.now();
    if (now - lastSaccadeHandledRef.current < 900) return;
    lastSaccadeHandledRef.current = now;

    if (saccade === 'next' && onNext) {
      setSaccadeNotice('Liếc cạnh phải · Câu tiếp theo');
      onNext();
    } else if (saccade === 'prev' && onPrev) {
      setSaccadeNotice('Liếc cạnh trái · Quay lại câu trước');
      onPrev();
    }

    const timer = setTimeout(() => {
      setSaccadeNotice(null);
    }, 1600);

    return () => clearTimeout(timer);
  }, [stats?.saccadeEvent, onNext, onPrev]);

  // Sync interaction mode with GazeProvider
  const isConfirming = Boolean(confirmAction);
  useEffect(() => {
    setInteractionMode?.(isConfirming ? 'confirm' : 'default');
    return () => {
      setInteractionMode?.('default');
    };
  }, [isConfirming, setInteractionMode]);

  // Helper to determine if an element is magnetically locked or hovered
  const isTargetActive = (key: string) => {
    return stats?.activeTargetKey === key || stats?.currentRegion === key;
  };

  const getDwellProgress = (key: string) => {
    if (isTargetActive(key)) {
      return (stats?.dwellProgress ?? 0) * 100;
    }
    return 0;
  };

  const pursuitProgress = stats?.pursuitProgress ?? 0;

  return (
    <div className="relative h-full w-full overflow-y-auto md:overflow-hidden bg-[#F5F5F7] text-[#1D1D1F] select-none">
      {/* Saccadic Gesture Toast HUD */}
      {saccadeNotice && (
        <div className="apple-glass pointer-events-none fixed top-5 left-1/2 -translate-x-1/2 z-[9999] rounded-2xl px-5 py-2.5">
          <p className="text-sm font-semibold text-[#1D1D1F]">
            {saccadeNotice}
          </p>
        </div>
      )}

      {/* Main Responsive Exam Layout: 2-Col on Mobile (<md), 12-Col x 3-Row on Desktop (md+) */}
      <div
        className={`grid grid-cols-2 md:grid-cols-12 md:grid-rows-[minmax(0,1fr)_auto_minmax(0,1fr)] min-h-full md:h-full w-full gap-4 md:gap-8 p-4 md:p-6 transition-opacity duration-200 ${
          isConfirming ? 'pointer-events-none opacity-25' : ''
        }`}
      >
        {/* ROW 0: Option A | Center Rest Spacer | Option B */}
        <div className="order-1 md:order-none col-span-1 md:col-span-5 min-h-[128px] md:min-h-0">
          <OptionCard
            letter="A"
            text={options.A}
            cardRef={cardARef}
            isSelected={selected === 'A'}
            isActive={isTargetActive('A')}
            dwellProgress={getDwellProgress('A')}
            onSelect={() => handleDirectSelectAnswer('A')}
          />
        </div>

        <div className="hidden md:block md:col-span-2 min-h-0" aria-hidden="true" />

        <div className="order-2 md:order-none col-span-1 md:col-span-5 min-h-[128px] md:min-h-0">
          <OptionCard
            letter="B"
            text={options.B}
            cardRef={cardBRef}
            isSelected={selected === 'B'}
            isActive={isTargetActive('B')}
            dwellProgress={getDwellProgress('B')}
            onSelect={() => handleDirectSelectAnswer('B')}
          />
        </div>

        {/* ROW 1: PREV | Wide Question Display | NEXT */}
        <div className="order-4 md:order-none col-span-1 md:col-span-2 min-h-0 flex items-stretch">
          <div
            ref={prevBtnRef}
            onClick={() => onPrev?.()}
            className={`relative w-full min-h-[76px] md:min-h-[108px] cursor-pointer overflow-hidden rounded-[22px] px-3 py-3 flex flex-row md:flex-col items-center justify-center gap-2 transition-[border-color,background-color,box-shadow] duration-150 ${
              isTargetActive('PREV')
                ? 'border-2 border-[#0066CC] bg-[#F5F9FF] shadow-[0_12px_28px_-6px_rgba(0,102,204,0.22),inset_0_1px_0_rgba(255,255,255,0.9)]'
                : 'border-[1.5px] border-black/[0.10] bg-white/95 shadow-[0_2px_12px_-2px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.03),inset_0_1px_0_rgba(255,255,255,0.95)] hover:border-[#0066CC]'
            }`}
          >
            <GazeDwellSweep active={isTargetActive('PREV')} progress={getDwellProgress('PREV')} tone="blue" />
            <div className="relative z-10 flex flex-row md:flex-col items-center gap-2 md:gap-1.5">
              <ArrowLeft
                className={`h-5 w-5 md:h-6 md:w-6 shrink-0 ${isTargetActive('PREV') ? 'text-[#0066CC]' : 'text-[#1D1D1F]'}`}
                strokeWidth={2.25}
              />
              <span className="text-sm md:text-base font-semibold text-[#1D1D1F] text-center whitespace-nowrap">
                Câu trước
              </span>
              {isTargetActive('PREV') && (
                <span className="inline-flex items-center rounded-full bg-[#0066CC] px-2.5 py-0.5 text-xs font-semibold text-white tabular-nums">
                  {`Đang giữ · ${Math.round(getDwellProgress('PREV'))}%`}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="order-3 md:order-none col-span-2 md:col-span-8 min-h-0 flex items-center justify-center">
          <div className="w-full h-full min-h-[112px] rounded-[22px] border-[1.5px] border-black/[0.08] bg-white/95 px-5 py-4 md:px-10 md:py-6 flex flex-col items-center justify-center shadow-[0_2px_12px_-2px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.03),inset_0_1px_0_rgba(255,255,255,0.95)]">
            <h1 className="text-2xl md:text-[28px] font-semibold text-[#1D1D1F] text-center leading-snug tracking-[-0.01em]">
              {question}
            </h1>
          </div>
        </div>

        <div className="order-5 md:order-none col-span-1 md:col-span-2 min-h-0 flex items-stretch">
          <div
            ref={nextBtnRef}
            onClick={() => onNext?.()}
            className={`relative w-full min-h-[76px] md:min-h-[108px] cursor-pointer overflow-hidden rounded-[22px] px-3 py-3 flex flex-row md:flex-col items-center justify-center gap-2 transition-[border-color,background-color,box-shadow] duration-150 ${
              isTargetActive('NEXT')
                ? 'border-2 border-[#0066CC] bg-[#F5F9FF] shadow-[0_12px_28px_-6px_rgba(0,102,204,0.22),inset_0_1px_0_rgba(255,255,255,0.9)]'
                : 'border-[1.5px] border-black/[0.10] bg-white/95 shadow-[0_2px_12px_-2px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.03),inset_0_1px_0_rgba(255,255,255,0.95)] hover:border-[#0066CC]'
            }`}
          >
            <GazeDwellSweep active={isTargetActive('NEXT')} progress={getDwellProgress('NEXT')} tone="blue" />
            <div className="relative z-10 flex flex-row md:flex-col items-center gap-2 md:gap-1.5">
              <ArrowRight
                className={`h-5 w-5 md:h-6 md:w-6 shrink-0 ${isTargetActive('NEXT') ? 'text-[#0066CC]' : 'text-[#1D1D1F]'}`}
                strokeWidth={2.25}
              />
              <span className="text-sm md:text-base font-semibold text-[#1D1D1F] text-center whitespace-nowrap">
                Câu tiếp
              </span>
              {isTargetActive('NEXT') && (
                <span className="inline-flex items-center rounded-full bg-[#0066CC] px-2.5 py-0.5 text-xs font-semibold text-white tabular-nums">
                  {`Đang giữ · ${Math.round(getDwellProgress('NEXT'))}%`}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ROW 2: Option C | SUBMIT (Smooth Pursuit) | Option D */}
        <div className="order-6 md:order-none col-span-1 md:col-span-5 min-h-[128px] md:min-h-0">
          <OptionCard
            letter="C"
            text={options.C}
            cardRef={cardCRef}
            isSelected={selected === 'C'}
            isActive={isTargetActive('C')}
            dwellProgress={getDwellProgress('C')}
            onSelect={() => handleDirectSelectAnswer('C')}
          />
        </div>

        <div className="order-8 md:order-none col-span-2 md:col-span-2 min-h-0 flex items-stretch">
          <div
            ref={submitBtnRef}
            onClick={() => handleActionRequest('SUBMIT', 'nộp bài')}
            className={`relative w-full h-full min-h-[76px] md:min-h-0 cursor-pointer overflow-hidden rounded-[22px] px-4 py-3 flex flex-row md:flex-col items-center justify-center gap-3 md:gap-2 transition-[border-color,background-color,box-shadow] duration-150 ${
              isTargetActive('SUBMIT')
                ? 'border-2 border-[#D70015] bg-[#FFECEB] shadow-[0_12px_28px_-6px_rgba(215,0,21,0.20),inset_0_1px_0_rgba(255,255,255,0.9)]'
                : 'border-[1.5px] border-[#FFB8B5] bg-white/95 shadow-[0_2px_12px_-2px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.03),inset_0_1px_0_rgba(255,255,255,0.95)] hover:border-[#D70015] hover:bg-[#FFECEB]'
            }`}
          >
            <GazeDwellSweep
              active={isTargetActive('SUBMIT') || pursuitProgress > 0}
              progress={Math.max(getDwellProgress('SUBMIT'), pursuitProgress * 100)}
              tone="rose"
            />

            {/* Smooth Pursuit Orbit Stimulus */}
            <div className="relative z-10 flex items-center justify-center w-11 h-11 md:w-12 md:h-12 shrink-0 rounded-full border-2 border-[#D70015] bg-[#FFECEB] md:mt-1">
              <div
                className="absolute w-3.5 h-3.5 rounded-full bg-[#0066CC] border-2 border-white pointer-events-none"
                style={{
                  transform: `translate(${Math.cos(orbitAngle) * 16}px, ${Math.sin(orbitAngle) * 16}px)`,
                }}
              />
              <div className="w-2 h-2 rounded-full bg-[#D70015]" />
            </div>

            <div className="relative z-10 flex flex-col items-start md:items-center text-left md:text-center">
              <span className="text-base md:text-lg font-bold text-[#1D1D1F] leading-tight">
                Nộp bài
              </span>
              {isTargetActive('SUBMIT') ? (
                <span className="mt-1 inline-flex items-center rounded-full bg-[#D70015] px-2.5 py-0.5 text-xs font-semibold text-white tabular-nums">
                  {`Đang giữ · ${Math.round(Math.max(getDwellProgress('SUBMIT'), pursuitProgress * 100))}%`}
                </span>
              ) : (
                <span className="text-xs font-medium text-[#D70015] mt-0.5">
                  Lia mắt theo chấm
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="order-7 md:order-none col-span-1 md:col-span-5 min-h-[128px] md:min-h-0">
          <OptionCard
            letter="D"
            text={options.D}
            cardRef={cardDRef}
            isSelected={selected === 'D'}
            isActive={isTargetActive('D')}
            dwellProgress={getDwellProgress('D')}
            onSelect={() => handleDirectSelectAnswer('D')}
          />
        </div>
      </div>

      {/* Gaze-Aware Confirmation Modal */}
      {confirmAction && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-[6px] p-4 md:p-8">
          <div className="apple-glass-modal relative w-full max-w-4xl rounded-[28px] p-6 md:p-10 flex flex-col items-center justify-between min-h-[380px] md:min-h-[420px]">
            {/* Header Dialog */}
            <div className="text-center space-y-3">
              <span className="inline-block rounded-full border border-black/[0.08] bg-[#F2F2F7] px-4 py-1 text-xs font-semibold text-[#1D1D1F]">
                Xác nhận cử chỉ mắt
              </span>
              <h2 className="text-2xl md:text-3xl font-bold text-[#1D1D1F] tracking-[-0.02em]">
                {confirmAction.id === 'SUBMIT'
                  ? 'Xác nhận nộp bài thi?'
                  : `Xác nhận chọn ${confirmAction.label}?`}
              </h2>
              {confirmAction.id === 'SUBMIT' && (
                <p className="text-sm md:text-base font-medium text-[#3C3C43] max-w-xl mx-auto">
                  Hãy lia mắt đuổi theo chấm xanh vệ tinh hoặc nhìn giữ nút Nộp bài ngay bên dưới để hoàn tất bài thi.
                </p>
              )}
            </div>

            {/* Middle Section: Pursuit Target or Standard Modal */}
            {confirmAction.id === 'SUBMIT' ? (
              <div
                ref={modalPursuitRef}
                className="relative my-6 flex items-center justify-center w-48 h-48 rounded-full border-[3px] border-[#D70015] bg-[#FFECEB] shadow-[0_8px_24px_rgba(215,0,21,0.14),inset_0_1px_0_rgba(255,255,255,0.75)]"
              >
                {/* Rotating Orbit Stimulus Dot */}
                <div
                  className="absolute w-6 h-6 rounded-full bg-[#0066CC] border-2 border-white pointer-events-none"
                  style={{
                    transform: `translate(${Math.cos(orbitAngle) * 56}px, ${Math.sin(orbitAngle) * 56}px)`,
                  }}
                />

                {/* Circular Pursuit Progress Readout */}
                <div className="flex flex-col items-center justify-center">
                  <span className="text-4xl font-bold text-[#D70015] tabular-nums">
                    {Math.round(pursuitProgress * 100)}%
                  </span>
                  <span className="text-xs font-semibold text-[#D70015] mt-1">
                    Theo dấu mắt
                  </span>
                </div>
              </div>
            ) : (
              <div className="my-6 text-center text-[#3C3C43] text-base md:text-lg">
                Nhìn giữ vào ô <strong className="text-[#12783D] font-semibold">Đồng ý</strong> bên phải hoặc <strong className="text-[#D70015] font-semibold">Không đồng ý</strong> bên trái
              </div>
            )}

            {/* Action Buttons Row */}
            <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mt-2">
              {/* Nút KHÔNG ĐỒNG Ý */}
              <div
                ref={modalCancelRef}
                onClick={() => handleConfirm(false)}
                className={`relative min-h-[84px] cursor-pointer overflow-hidden rounded-[20px] px-5 py-4 flex items-center justify-between gap-4 transition-[border-color,background-color,box-shadow] duration-150 ${
                  isTargetActive('SAFE_MARGIN')
                    ? 'border-2 border-[#D70015] bg-[#FFECEB] shadow-[0_12px_28px_-6px_rgba(215,0,21,0.20),inset_0_1px_0_rgba(255,255,255,0.85)]'
                    : 'border-[1.5px] border-black/[0.10] bg-white/95 shadow-[0_4px_14px_rgba(0,0,0,0.05),inset_0_1px_0_rgba(255,255,255,0.95)] hover:border-[#D70015] hover:bg-[#FFECEB]'
                }`}
              >
                <GazeDwellSweep
                  active={isTargetActive('SAFE_MARGIN')}
                  progress={getDwellProgress('SAFE_MARGIN')}
                  tone="rose"
                />
                <div className="relative z-10 flex items-center gap-3.5 min-w-0 flex-1">
                  <div
                    className={`size-12 rounded-[14px] flex items-center justify-center shrink-0 transition-colors ${
                      isTargetActive('SAFE_MARGIN')
                        ? 'bg-[#D70015] text-white'
                        : 'bg-[#F2F2F7] text-[#1D1D1F]'
                    }`}
                  >
                    <X className="h-6 w-6" strokeWidth={2.5} />
                  </div>
                  <div className="text-left min-w-0">
                    <span className="block text-lg md:text-xl font-bold text-[#1D1D1F] leading-tight whitespace-nowrap">
                      Không đồng ý
                    </span>
                    <span className="block text-xs font-medium text-[#515154] mt-0.5 truncate">
                      Quay lại tiếp tục làm bài
                    </span>
                  </div>
                </div>
                <div className="relative z-10 shrink-0">
                  {isTargetActive('SAFE_MARGIN') ? (
                    <span className="inline-flex items-center rounded-full bg-[#D70015] px-3 py-1 text-xs font-semibold text-white tabular-nums whitespace-nowrap">
                      {`Đang giữ · ${Math.round(getDwellProgress('SAFE_MARGIN'))}%`}
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-[#515154] whitespace-nowrap">Nhìn giữ để hủy</span>
                  )}
                </div>
              </div>

              {/* Nút ĐỒNG Ý (Hoặc Nộp bài ngay) */}
              {confirmAction.id === 'SUBMIT' ? (
                <div
                  ref={modalConfirmRef}
                  onClick={() => handleConfirm(true)}
                  className={`relative min-h-[84px] cursor-pointer overflow-hidden rounded-[20px] px-5 py-4 flex items-center justify-between gap-4 transition-[border-color,background-color,box-shadow] duration-150 ${
                    isTargetActive('NEXT')
                      ? 'border-2 border-[#D70015] bg-[#FFDAD8] shadow-[0_12px_28px_-6px_rgba(215,0,21,0.25),inset_0_1px_0_rgba(255,255,255,0.85)]'
                      : 'border-2 border-[#D70015] bg-[#FFECEB] shadow-[0_4px_14px_rgba(215,0,21,0.10),inset_0_1px_0_rgba(255,255,255,0.8)] hover:bg-[#FFDAD8]'
                  }`}
                >
                  <GazeDwellSweep
                    active={isTargetActive('NEXT')}
                    progress={getDwellProgress('NEXT')}
                    tone="rose"
                  />
                  <div className="relative z-10 flex items-center gap-3.5 min-w-0 flex-1">
                    <div className="size-12 rounded-[14px] bg-[#D70015] text-white flex items-center justify-center shrink-0">
                      <Check className="h-6 w-6" strokeWidth={2.5} />
                    </div>
                    <div className="text-left min-w-0">
                      <span className="block text-lg md:text-xl font-bold text-[#1D1D1F] leading-tight whitespace-nowrap">
                        Nộp bài ngay
                      </span>
                      <span className="block text-xs font-medium text-[#991B1B] mt-0.5 truncate">
                        Hoàn tất và gửi kết quả
                      </span>
                    </div>
                  </div>
                  <div className="relative z-10 shrink-0">
                    {isTargetActive('NEXT') ? (
                      <span className="inline-flex items-center rounded-full bg-[#D70015] px-3 py-1 text-xs font-semibold text-white tabular-nums whitespace-nowrap">
                        {`Đang giữ · ${Math.round(getDwellProgress('NEXT'))}%`}
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-[#991B1B] whitespace-nowrap">Nhìn giữ để nộp</span>
                    )}
                  </div>
                </div>
              ) : (
                <div
                  ref={modalConfirmRef}
                  onClick={() => handleConfirm(true)}
                  className={`relative min-h-[84px] cursor-pointer overflow-hidden rounded-[20px] px-5 py-4 flex items-center justify-between gap-4 transition-[border-color,background-color,box-shadow] duration-150 ${
                    isTargetActive('NEXT')
                      ? 'border-2 border-[#12783D] bg-[#ECFDF3] shadow-[0_12px_28px_-6px_rgba(18,120,61,0.20),inset_0_1px_0_rgba(255,255,255,0.85)]'
                      : 'border-[1.5px] border-black/[0.10] bg-white/95 shadow-[0_4px_14px_rgba(0,0,0,0.05),inset_0_1px_0_rgba(255,255,255,0.95)] hover:border-[#12783D] hover:bg-[#ECFDF3]'
                  }`}
                >
                  <GazeDwellSweep
                    active={isTargetActive('NEXT')}
                    progress={getDwellProgress('NEXT')}
                    tone="emerald"
                  />
                  <div className="relative z-10 flex items-center gap-3.5 min-w-0 flex-1">
                    <div
                      className={`size-12 rounded-[14px] flex items-center justify-center shrink-0 transition-colors ${
                        isTargetActive('NEXT')
                          ? 'bg-[#12783D] text-white'
                          : 'bg-[#ECFDF3] text-[#12783D]'
                      }`}
                    >
                      <Check className="h-6 w-6" strokeWidth={2.5} />
                    </div>
                    <div className="text-left min-w-0">
                      <span className="block text-lg md:text-xl font-bold text-[#1D1D1F] leading-tight whitespace-nowrap">
                        Đồng ý
                      </span>
                      <span className="block text-xs font-medium text-[#515154] mt-0.5 truncate">
                        Xác nhận lựa chọn này
                      </span>
                    </div>
                  </div>
                  <div className="relative z-10 shrink-0">
                    {isTargetActive('NEXT') ? (
                      <span className="inline-flex items-center rounded-full bg-[#12783D] px-3 py-1 text-xs font-semibold text-white tabular-nums whitespace-nowrap">
                        {`Đang giữ · ${Math.round(getDwellProgress('NEXT'))}%`}
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-[#515154] whitespace-nowrap">Nhìn giữ để xác nhận</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
