"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Leaderboard from "@/platform/components/Leaderboard";
import LaunchLink from "@/platform/components/LaunchLink";
import { getDailyPuzzleNumber, getUtcDateKey } from "@/platform/daily";
import { isInDiscord } from "@/platform/discordClient";
import { hand } from "@/platform/roundGame/fonts";
import GameHeader from "@/platform/roundGame/GameHeader";
import GameManual from "@/platform/components/GameManual";
import ResultCard from "@/platform/roundGame/ResultCard";
import RoundBanner from "@/platform/roundGame/RoundBanner";
import { hint, panel, pressable, primaryButton, screen, secondaryButton } from "@/platform/roundGame/ui";
import { useRoundGame } from "@/platform/roundGame/useRoundGame";
import { isCoastal } from "../lib/coast";
import { aimErrors, bearing, compassName, dailyRound, MAX_POINTS_PER_TARGET, MAX_SCORE, playWhichWay, shareLine, targetPoints, TARGETS_PER_DAY } from "../lib/rules";
import { whichWay } from "../meta";
import { whichWayManual } from "../manual";
import AnswerMap from "./AnswerMap";
import { createWorld, World } from "./world";

export default function WhichWay() {
  const [dateKey, setDateKey] = useState(() => getUtcDateKey());
  return <Round key={dateKey} dateKey={dateKey} onPlayDate={setDateKey} />;
}

function Round({ dateKey, onPlayDate }: { dateKey: string; onPlayDate: (dateKey: string) => void }) {
  const { origin, targets } = useMemo(() => dailyRound(dateKey), [dateKey]);
  const game = useRoundGame(whichWay, dateKey, playWhichWay);
  const aims = game.moves;
  const errors = useMemo(() => aimErrors(dateKey, aims), [dateKey, aims]);
  // True while the answer to the latest aim is on screen, before moving on to the next city.
  const [revealing, setRevealing] = useState(false);
  const [aim, setAim] = useState<number | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  const worldRef = useRef<World | null>(null);

  const index = revealing ? aims.length - 1 : aims.length;
  const finished = index >= TARGETS_PER_DAY;
  const target = targets[Math.min(index, TARGETS_PER_DAY - 1)];
  const trueBearing = bearing(origin, target);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let world: World;
    try {
      world = createWorld(container, dateKey, origin.lat, isCoastal(origin), setAim);
    } catch (err) {
      console.warn("Couldn't start WebGL", err);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFailed(true);
      return;
    }
    worldRef.current = world;
    return () => {
      worldRef.current = null;
      world.dispose();
    };
  }, [dateKey, origin]);

  // The compass fills whatever room the text leaves, so it's always the biggest thing on screen.
  useEffect(() => {
    const header = headerRef.current;
    const footer = footerRef.current;
    if (!header || !footer) return;
    const update = () => {
      const { height } = window.document.documentElement.getBoundingClientRect();
      worldRef.current?.setInsets(header.getBoundingClientRect().bottom, height - footer.getBoundingClientRect().top);
    };
    const observer = new ResizeObserver(update);
    observer.observe(header);
    observer.observe(footer);
    update();
    return () => observer.disconnect();
  }, []);

  function lockIn() {
    const world = worldRef.current;
    if (!world || revealing || aim === null) return;
    game.addMove(world.aimed());
    setRevealing(true);
    world.reveal(trueBearing);
  }

  function next() {
    worldRef.current?.clear();
    setAim(null);
    setMapOpen(false);
    setRevealing(false);
  }

  return (
    <div className={screen}>
      <div ref={containerRef} className="absolute inset-0" />
      <RoundBanner dateKey={dateKey} notice={game.notice} onPlayDate={onPlayDate} />
      {failed && !finished && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 p-6 text-center">
          <p>This device couldn&apos;t start the 3D compass.</p>
          <LaunchLink href="/" className={secondaryButton}>
            All games
          </LaunchLink>
        </div>
      )}

      <header
        ref={headerRef}
        className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/60 via-black/35 to-transparent px-3 pb-2 text-center [text-shadow:0_2px_6px_rgba(0,0,0,0.65)]"
        style={{ paddingTop: "calc(0.5rem + var(--discord-safe-area-inset-top, env(safe-area-inset-top)))" }}
      >
        <GameHeader
          progress={finished ? "" : `${index + 1} of ${TARGETS_PER_DAY}`}
          action={
            <GameManual gameId={whichWay.id} name={whichWay.name} manual={whichWayManual} buttonClassName={`${pressable} min-h-8 rounded-full px-3 text-sm font-semibold text-[#1c1a16] bg-[#f4ecd8] hover:brightness-110`} />
          }
        />
        <p className={`${hand.className} text-3xl leading-none short:text-lg`}>
          From {origin.name}, {origin.country}
        </p>
        {!finished && (
          <h1 className={`${hand.className} text-4xl leading-tight sm:text-5xl short:text-2xl`}>
            point to {target.name}, {target.country}
          </h1>
        )}
      </header>

      <footer
        ref={footerRef}
        className="absolute inset-x-3 flex min-h-32 flex-col items-center short:min-h-0 justify-end gap-2 text-center"
        style={{ bottom: "calc(0.75rem + var(--discord-safe-area-inset-bottom, env(safe-area-inset-bottom)))" }}
      >
        {!finished && !revealing && (
          <>
            <p className={`${hint} rounded-lg bg-black/55 px-3 py-1 tabular-nums short:hidden`} aria-live="polite">
              {aim === null ? "Drag on the compass to aim the needle" : `Pointing ${compassName(aim)}, ${Math.round(aim) % 360}°`}
            </p>
            <input
              type="range"
              min={0}
              max={359}
              value={aim === null ? 0 : Math.round(aim) % 360}
              onChange={(event) => worldRef.current?.setAim(Number(event.target.value))}
              aria-label="Aim the compass, in degrees"
              className="sr-only"
            />
            <button type="button" onClick={lockIn} disabled={aim === null} className={`${primaryButton} w-full max-w-xs disabled:opacity-50`}>
              Lock it in
            </button>
          </>
        )}
        {revealing && !finished && (
          <>
            <div className={`${panel} w-full max-w-sm px-3 py-2`}>
              <p className={`${hand.className} text-4xl leading-none short:text-2xl`} aria-live="polite">
                {Math.round(errors[index])}° off
              </p>
              <p className="text-sm short:hidden">
                <span className="font-semibold text-[#7db0ff]">Blue needle</span>: the shortest route sets off <strong>{compassName(trueBearing)}</strong>.
              </p>
            </div>
            <div className="flex w-full max-w-sm gap-2">
              <button type="button" onClick={() => setMapOpen(true)} className={`${secondaryButton} flex-1 px-2`}>
                See the map
              </button>
              <button type="button" onClick={next} className={`${primaryButton} flex-1 px-2`}>
                {index === TARGETS_PER_DAY - 1 ? "See result" : "Next city"}
              </button>
            </div>
          </>
        )}
      </footer>

      {mapOpen && revealing && !finished && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/65 p-3" role="dialog" aria-label="Map of the route">
          <div className={`${panel} flex w-full max-w-md flex-col items-center gap-3 p-4 text-center`}>
            <AnswerMap origin={origin} target={target} aimed={aims[index]} />
            <p className="text-xs text-[#ece7dc]/70">
              The world seen from {origin.name}, north up. <span className="font-semibold text-[#7db0ff]">Solid blue</span> is the shortest route, <span className="font-semibold text-[#fbbf24]">dashed amber</span> is your aim. Lands near the rim are on the far side of the Earth, so they look stretched.
            </p>
            <button type="button" onClick={() => setMapOpen(false)} className={`${primaryButton} w-full`}>
              Back to the compass
            </button>
          </div>
        </div>
      )}

      {game.loaded && finished && (
        <ResultCard
          score={game.result.points}
          howScored={`Up to ${MAX_POINTS_PER_TARGET} points for each city. Full points within 5°, none at 90° or more.`}
          maxScore={MAX_SCORE}
          detailHeading="Your aim"
          rows={targets.map((t, i) => ({ label: t.name, detail: `${Math.round(errors[i])}° off`, points: targetPoints(errors[i]) }))}
          maxPerRow={MAX_POINTS_PER_TARGET}
          stats={game.stats}
          shareText={shareLine(getDailyPuzzleNumber(dateKey), origin.name, errors, isInDiscord() ? undefined : window.location.href)}
          onShare={game.onShare}
        >
          {game.connection && <Leaderboard connection={game.connection} game={whichWay} puzzleId={game.puzzleId} myPoints={game.serverPoints} className="mt-5" />}
        </ResultCard>
      )}
    </div>
  );
}
