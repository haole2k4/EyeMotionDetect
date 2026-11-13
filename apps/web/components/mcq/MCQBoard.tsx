'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
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

type DwellTone = 'A' | 'B' | 'C' | 'D' | 'sky' | 'emerald' | 'rose';

const SWEEP_STYLES: Record<DwellTone, { curtain: string; bar: string }> = {
  A: {
    curtain: 'from-blue-500/20 via-blue-400/35 to-cyan-300/50 border-r-2 border-cyan-300',
    bar: 'bg-gradient-to-r from-blue-400 to-cyan-300',
  },
  B: {
    curtain: 'from-purple-500/20 via-purple-400/35 to-pink-300/50 border-r-2 border-pink-300',
    bar: 'bg-gradient-to-r from-purple-400 to-pink-300',
  },
  C: {
    curtain: 'from-emerald-500/20 via-emerald-400/35 to-teal-300/50 border-r-2 border-teal-300',
    bar: 'bg-gradient-to-r from-emerald-400 to-teal-300',
  },
  D: {
    curtain: 'from-amber-500/20 via-amber-400/35 to-yellow-300/50 border-r-2 border-yellow-300',
    bar: 'bg-gradient-to-r from-amber-400 to-yellow-300',
  },
  sky: {
    curtain: 'from-sky-500/20 via-sky-400/30 to-cyan-300/45 border-r-2 border-sky-300',
    bar: 'bg-gradient-to-r from-sky-400 to-cyan-300',
  },
  emerald: {
    curtain: 'from-emerald-500/20 via-emerald-400/30 to-teal-300/45 border-r-2 border-emerald-300',
    bar: 'bg-gradient-to-r from-emerald-400 to-teal-300',
  },
  rose: {
    curtain: 'from-rose-500/20 via-rose-400/30 to-pink-300/45 border-r-2 border-rose-300',
    bar: 'bg-gradient-to-r from-rose-500 to-pink-400',
  },
};

const OPTION_THEMES: Record<
  'A' | 'B' | 'C' | 'D',
  {
    base: string;
    active: string;
    selected: string;
    badge: string;
    activePill: string;
    activeDot: string;
    selectedPill: string;
  }
> = {
  A: {
    base: 'border-blue-500/60 bg-[#0d1629] hover:border-blue-400/80',
    active: 'border-cyan-300 bg-blue-950/90 shadow-[0_0_28px_rgba(56,189,248,0.45)]',
    selected: 'border-cyan-300 bg-blue-900/80 ring-2 ring-cyan-400/80',
    badge: 'bg-blue-600 text-white',
    activePill: 'border-cyan-400/60 bg-blue-950/90 text-cyan-200',
    activeDot: 'bg-cyan-300',
    selectedPill: 'border-cyan-400/60 bg-blue-950/80 text-cyan-200',
  },
  B: {
    base: 'border-purple-500/60 bg-[#160d29] hover:border-purple-400/80',
    active: 'border-purple-300 bg-purple-950/90 shadow-[0_0_28px_rgba(192,132,252,0.45)]',
    selected: 'border-purple-300 bg-purple-900/80 ring-2 ring-purple-400/80',
    badge: 'bg-purple-600 text-white',
    activePill: 'border-purple-400/60 bg-purple-950/90 text-purple-200',
    activeDot: 'bg-pink-300',
    selectedPill: 'border-purple-400/60 bg-purple-950/80 text-purple-200',
  },
  C: {
    base: 'border-emerald-500/60 bg-[#0d2919] hover:border-emerald-400/80',
    active: 'border-emerald-300 bg-emerald-950/90 shadow-[0_0_28px_rgba(52,211,153,0.45)]',
    selected: 'border-emerald-300 bg-emerald-900/80 ring-2 ring-emerald-400/80',
    badge: 'bg-emerald-600 text-white',
    activePill: 'border-emerald-400/60 bg-emerald-950/90 text-emerald-200',
    activeDot: 'bg-teal-300',
    selectedPill: 'border-emerald-400/60 bg-emerald-950/80 text-emerald-200',
  },
  D: {
    base: 'border-amber-500/60 bg-[#291e0d] hover:border-amber-400/80',
    active: 'border-amber-300 bg-amber-950/90 shadow-[0_0_28px_rgba(251,191,36,0.45)]',
    selected: 'border-amber-300 bg-amber-900/80 ring-2 ring-amber-400/80',
    badge: 'bg-amber-600 text-white',
    activePill: 'border-amber-400/60 bg-amber-950/90 text-amber-200',
    activeDot: 'bg-yellow-300',
    selectedPill: 'border-amber-400/60 bg-amber-950/80 text-yellow-200',
  },
};

interface GazeDwellSweepProps {
  active: boolean;
  progress: number;
  tone?: DwellTone;
}

function GazeDwellSweep({ active, progress, tone = 'sky' }: GazeDwellSweepProps) {
  if (!active && progress <= 0) return null;

  const clamped = Math.max(active ? 3 : 0, Math.min(100, progress));
  const toneStyles = SWEEP_STYLES[tone];

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r transition-[width] duration-75 ease-linear ${toneStyles.curtain}`}
      style={{ width: `${clamped}%` }}
    />
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
  const theme = OPTION_THEMES[letter];

  return (
    <div
      ref={cardRef}
      onClick={onSelect}
      className={`relative h-full min-h-0 cursor-pointer overflow-hidden rounded-2xl border-[1.5px] p-5 md:p-6 flex flex-col justify-between gap-3 transition-all duration-150 ${
        isSelected
          ? theme.selected
          : isActive
            ? theme.active
            : theme.base
      }`}
    >
      <GazeDwellSweep active={isActive} progress={dwellProgress} tone={letter} />

      <div className="relative z-10 flex items-center justify-between gap-3">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl font-bold tracking-tight shadow-sm transition-colors ${theme.badge}`}
        >
          {letter}
        </span>

        <div className="flex items-center gap-2">
          {isSelected && (
            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ${theme.selectedPill}`}>
              Đã chọn
            </span>
          )}
          {isActive && (
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide tabular-nums ${theme.activePill}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${theme.activeDot}`} />
              {`Đang giữ • ${Math.round(dwellProgress)}%`}
            </span>
          )}
        </div>
      </div>

      <p className="relative z-10 text-lg md:text-xl lg:text-[22px] font-medium text-slate-100 leading-snug line-clamp-4">
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
  const stats = gaze.stats;

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
  const resetDwell = gaze?.resetDwell;
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

      gaze?.registerMagneticTargets?.(targets);
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
      gaze?.registerMagneticTargets?.(targets);
    }
  }, [confirmAction, gaze]);

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
    if (prevBtnRef.current) observer.observe(prevBtnRef.current);
    if (nextBtnRef.current) observer.observe(nextBtnRef.current);
    if (submitBtnRef.current) observer.observe(submitBtnRef.current);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
      gaze?.clearMagneticTargets?.();
    };
  }, [registerTargets, gaze, question, confirmAction]);

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
        gaze?.setPursuitOrbitTarget?.({ x: centerX, y: centerY, radius: 48 });
      }
    } else {
      gaze?.setPursuitOrbitTarget?.(null);
    }
  }, [stats?.activeTargetKey, stats?.currentRegion, confirmAction, gaze]);

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
        gaze?.recordImplicitDrift?.(centerX, centerY);
      }
    },
    [gaze],
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
      gaze?.setPursuitOrbitTarget?.(null);
    },
    [confirmAction, onAnswerSelected, onPrev, onNext, onSubmit, performImplicitDriftCorrection, gaze],
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
      setSaccadeNotice('Liếc cạnh phải • Câu tiếp theo');
      onNext();
    } else if (saccade === 'prev' && onPrev) {
      setSaccadeNotice('Liếc cạnh trái • Quay lại câu trước');
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
    gaze?.setInteractionMode?.(isConfirming ? 'confirm' : 'default');
    return () => {
      gaze?.setInteractionMode?.('default');
    };
  }, [isConfirming, gaze]);

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
    <div className="relative h-full w-full overflow-hidden bg-[#080B11] text-slate-100 select-none">
      {/* Saccadic Gesture Toast HUD */}
      {saccadeNotice && (
        <div className="pointer-events-none fixed top-5 left-1/2 -translate-x-1/2 z-[9999] rounded-xl border border-sky-400/50 bg-[#0D1524]/95 px-5 py-2 shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-top-4 duration-200">
          <p className="text-sm font-semibold text-sky-200 tracking-wide">
            {saccadeNotice}
          </p>
        </div>
      )}

      {/* Main 12-Col x 3-Row Precision Exam Layout */}
      <div
        className={`grid grid-cols-12 grid-rows-[minmax(0,1fr)_auto_minmax(0,1fr)] h-full w-full gap-4 md:gap-6 p-4 md:p-6 transition-opacity duration-200 ${
          isConfirming ? 'pointer-events-none opacity-20 filter blur-[2px]' : ''
        }`}
      >
        {/* ROW 0: Option A | Center Rest Spacer | Option B */}
        <div className="col-span-5 min-h-0">
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

        <div className="col-span-2 min-h-0" aria-hidden="true" />

        <div className="col-span-5 min-h-0">
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
        <div className="col-span-2 min-h-0 flex items-stretch">
          <div
            ref={prevBtnRef}
            onClick={() => onPrev?.()}
            className={`relative w-full min-h-[104px] cursor-pointer overflow-hidden rounded-2xl border-[1.5px] px-3 py-3 flex flex-col items-center justify-center gap-1.5 transition-all duration-150 ${
              isTargetActive('PREV')
                ? 'border-sky-300 bg-sky-950/90 shadow-[0_0_24px_rgba(56,189,248,0.4)]'
                : 'border-sky-500/40 bg-[#0d1829] hover:border-sky-400/70'
            }`}
          >
            <GazeDwellSweep active={isTargetActive('PREV')} progress={getDwellProgress('PREV')} tone="sky" />
            <div className="relative z-10 flex flex-col items-center gap-1">
              <span className="text-lg font-bold text-sky-300">◀</span>
              <span className="text-sm md:text-base font-semibold text-slate-100 text-center">
                Câu trước
              </span>
              {isTargetActive('PREV') && (
                <span className="inline-flex items-center rounded-full border border-sky-400/50 bg-sky-950/90 px-2 py-0.5 text-[10px] font-semibold text-sky-200 tabular-nums">
                  {`Đang giữ • ${Math.round(getDwellProgress('PREV'))}%`}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="col-span-8 min-h-0 flex items-center justify-center">
          <div className="w-full h-full min-h-[112px] rounded-2xl border-[1.5px] border-slate-700/80 bg-[#0D121C] px-6 py-4 md:px-10 md:py-6 flex flex-col items-center justify-center">
            <h1 className="text-xl md:text-2xl lg:text-[26px] font-semibold text-slate-50 text-center leading-snug tracking-normal">
              {question}
            </h1>
          </div>
        </div>

        <div className="col-span-2 min-h-0 flex items-stretch">
          <div
            ref={nextBtnRef}
            onClick={() => onNext?.()}
            className={`relative w-full min-h-[104px] cursor-pointer overflow-hidden rounded-2xl border-[1.5px] px-3 py-3 flex flex-col items-center justify-center gap-1.5 transition-all duration-150 ${
              isTargetActive('NEXT')
                ? 'border-sky-300 bg-sky-950/90 shadow-[0_0_24px_rgba(56,189,248,0.4)]'
                : 'border-sky-500/40 bg-[#0d1829] hover:border-sky-400/70'
            }`}
          >
            <GazeDwellSweep active={isTargetActive('NEXT')} progress={getDwellProgress('NEXT')} tone="sky" />
            <div className="relative z-10 flex flex-col items-center gap-1">
              <span className="text-lg font-bold text-sky-300">▶</span>
              <span className="text-sm md:text-base font-semibold text-slate-100 text-center">
                Câu tiếp
              </span>
              {isTargetActive('NEXT') && (
                <span className="inline-flex items-center rounded-full border border-sky-400/50 bg-sky-950/90 px-2 py-0.5 text-[10px] font-semibold text-sky-200 tabular-nums">
                  {`Đang giữ • ${Math.round(getDwellProgress('NEXT'))}%`}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ROW 2: Option C | SUBMIT (Smooth Pursuit) | Option D */}
        <div className="col-span-5 min-h-0">
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

        <div className="col-span-2 min-h-0 flex items-stretch">
          <div
            ref={submitBtnRef}
            onClick={() => handleActionRequest('SUBMIT', 'nộp bài')}
            className={`relative w-full h-full cursor-pointer overflow-hidden rounded-2xl border-[1.5px] px-3 py-3 flex flex-col items-center justify-center gap-2 transition-all duration-150 ${
              isTargetActive('SUBMIT')
                ? 'border-rose-300 bg-rose-950/90 shadow-[0_0_28px_rgba(244,63,94,0.45)]'
                : 'border-rose-500/55 bg-[#1c0d16] hover:border-rose-400/80'
            }`}
          >
            <GazeDwellSweep
              active={isTargetActive('SUBMIT') || pursuitProgress > 0}
              progress={Math.max(getDwellProgress('SUBMIT'), pursuitProgress * 100)}
              tone="rose"
            />

            {/* Smooth Pursuit Orbit Stimulus */}
            <div className="relative z-10 flex items-center justify-center w-11 h-11 rounded-full border border-rose-400/40 bg-rose-950/60 mt-1">
              <div
                className="absolute w-3 h-3 rounded-full bg-sky-300 shadow-[0_0_10px_rgba(56,189,248,0.85)] pointer-events-none"
                style={{
                  transform: `translate(${Math.cos(orbitAngle) * 16}px, ${Math.sin(orbitAngle) * 16}px)`,
                }}
              />
              <div className="w-2 h-2 rounded-full bg-rose-400/90" />
            </div>

            <div className="relative z-10 flex flex-col items-center text-center">
              <span className="text-base md:text-lg font-bold text-slate-100 leading-tight">
                Nộp bài
              </span>
              {isTargetActive('SUBMIT') ? (
                <span className="mt-1 inline-flex items-center rounded-full border border-rose-400/50 bg-rose-950/90 px-2 py-0.5 text-[10px] font-semibold text-rose-200 tabular-nums">
                  {`Đang giữ • ${Math.round(Math.max(getDwellProgress('SUBMIT'), pursuitProgress * 100))}%`}
                </span>
              ) : (
                <span className="text-[11px] font-medium text-rose-200/75 mt-0.5">
                  Lia mắt theo chấm
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="col-span-5 min-h-0">
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
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-6 md:p-8 animate-in fade-in duration-150">
          <div className="relative w-full max-w-4xl rounded-2xl border border-slate-700/80 bg-[#0C111B] p-8 md:p-10 shadow-2xl flex flex-col items-center justify-between min-h-[420px]">
            {/* Header Dialog */}
            <div className="text-center space-y-2.5">
              <span className="inline-block rounded-full bg-slate-900 px-3.5 py-1 text-xs font-semibold text-sky-300 border border-slate-700 uppercase tracking-widest">
                Xác nhận cử chỉ mắt
              </span>
              <h2 className="text-2xl md:text-3xl font-bold text-slate-50">
                Xác nhận chọn {confirmAction.label}?
              </h2>
              {confirmAction.id === 'SUBMIT' && (
                <p className="text-sm md:text-base font-medium text-slate-300 max-w-xl mx-auto">
                  Hãy lia mắt đuổi theo chấm sáng vệ tinh bên dưới để xác nhận nộp bài an toàn.
                </p>
              )}
            </div>

            {/* Middle Section: Pursuit Target or Standard Modal */}
            {confirmAction.id === 'SUBMIT' ? (
              <div
                ref={modalPursuitRef}
                className="relative my-6 flex items-center justify-center w-48 h-48 rounded-full border-2 border-rose-500/60 bg-[#140E16]"
              >
                {/* Rotating Orbit Stimulus Dot */}
                <div
                  className="absolute w-6 h-6 rounded-full bg-sky-300 shadow-[0_0_16px_rgba(56,189,248,0.85)] pointer-events-none"
                  style={{
                    transform: `translate(${Math.cos(orbitAngle) * 56}px, ${Math.sin(orbitAngle) * 56}px)`,
                  }}
                />

                {/* Circular Pursuit Progress Readout */}
                <div className="flex flex-col items-center justify-center">
                  <span className="text-4xl font-bold text-rose-400 tabular-nums">
                    {Math.round(pursuitProgress * 100)}%
                  </span>
                  <span className="text-[11px] font-semibold text-slate-400 tracking-wider uppercase mt-1">
                    Theo dấu mắt
                  </span>
                </div>
              </div>
            ) : (
              <div className="my-6 text-center text-slate-300 text-base md:text-lg">
                Nhìn giữ vào ô <strong className="text-emerald-400 font-semibold">Đồng ý</strong> bên phải hoặc <strong className="text-rose-400 font-semibold">Không đồng ý</strong> bên trái
              </div>
            )}

            {/* Action Buttons Row */}
            <div className="w-full grid grid-cols-2 gap-6 mt-2">
              {/* Nút KHÔNG ĐỒNG Ý */}
              <div
                ref={modalCancelRef}
                onClick={() => handleConfirm(false)}
                className={`relative cursor-pointer overflow-hidden rounded-2xl border-[1.5px] p-5 flex items-center justify-center gap-3 transition-colors ${
                  isTargetActive('SAFE_MARGIN')
                    ? 'border-rose-400 bg-[#221118]'
                    : 'border-slate-700/80 bg-[#121620] hover:border-rose-500/60'
                }`}
              >
                <GazeDwellSweep
                  active={isTargetActive('SAFE_MARGIN')}
                  progress={getDwellProgress('SAFE_MARGIN')}
                  tone="rose"
                />
                <span className="relative z-10 text-xl font-bold text-rose-400">✕</span>
                <span className="relative z-10 text-xl font-bold text-slate-100">Không đồng ý</span>
              </div>

              {/* Nút ĐỒNG Ý (Hoặc Nộp bài ngay) */}
              {confirmAction.id === 'SUBMIT' ? (
                <div
                  onClick={() => handleConfirm(true)}
                  className="relative cursor-pointer overflow-hidden rounded-2xl border-[1.5px] border-rose-500/70 bg-[#1B1018] p-5 flex items-center justify-center gap-3 hover:border-rose-400 hover:bg-[#24131E] transition-colors"
                >
                  <span className="text-xl font-bold text-slate-100">Nộp bài ngay</span>
                </div>
              ) : (
                <div
                  ref={modalConfirmRef}
                  onClick={() => handleConfirm(true)}
                  className={`relative cursor-pointer overflow-hidden rounded-2xl border-[1.5px] p-5 flex items-center justify-center gap-3 transition-colors ${
                    isTargetActive('NEXT')
                      ? 'border-emerald-400 bg-[#0F211B]'
                      : 'border-slate-700/80 bg-[#121620] hover:border-emerald-500/60'
                  }`}
                >
                  <GazeDwellSweep
                    active={isTargetActive('NEXT')}
                    progress={getDwellProgress('NEXT')}
                    tone="emerald"
                  />
                  <span className="relative z-10 text-xl font-bold text-emerald-400">✓</span>
                  <span className="relative z-10 text-xl font-bold text-slate-100">Đồng ý</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
