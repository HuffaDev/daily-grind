"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameInfo } from "@/games/types";
import { getPuzzleId } from "../daily";
import { GameApiError, postGameAction } from "../discordClient";
import { DEFAULT_STATS, loadStats, recordGame, Stats } from "../stats";
import { useDiscordConnection } from "../useDiscordConnection";
import { PlayRound, reconcileMoves, RoundGameView } from "./types";

interface SavedGame<Move> {
  puzzleId: string;
  moves: Move[];
  elapsedSeconds: number;
}

/** Keeps the server's play-time measurement alive (see ACTIVE_GAP_CAP_MS), and resends moves that failed to send. */
const HEARTBEAT_MS = 15_000;

const storageKey = (gameId: string) => `daily-grind:${gameId}:progress`;

function loadSaved<Move>(gameId: string, puzzleId: string): SavedGame<Move> {
  const fresh: SavedGame<Move> = { puzzleId, moves: [], elapsedSeconds: 0 };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey(gameId)) ?? "null") as SavedGame<Move> | null;
    return parsed?.puzzleId === puzzleId && Array.isArray(parsed.moves) ? { ...fresh, ...parsed } : fresh;
  } catch {
    return fresh;
  }
}

/**
 * Everything a round game needs besides its UI: the player's moves, saving them,
 * syncing them with the leaderboard server, play time and local stats.
 */
export function useRoundGame<Move, Detail>(info: GameInfo, dateKey: string, play: PlayRound<Move, Detail>) {
  const puzzleId = useMemo(() => getPuzzleId(dateKey, info.puzzleVersion), [dateKey, info.puzzleVersion]);
  const [loaded, setLoaded] = useState(false);
  const [moves, setMoves] = useState<readonly Move[]>([]);
  const [serverPoints, setServerPoints] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats>(DEFAULT_STATS);
  const { connection, error: connectError } = useDiscordConnection();
  const elapsedRef = useRef(0);
  const movesRef = useRef(moves);
  const syncedRef = useRef(false);
  const unsentRef = useRef(false);
  // Requests run one at a time, so moves reach the server in the order they were made.
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  const result = useMemo(() => play(dateKey, moves), [play, dateKey, moves]);
  const { finished, solved } = result;

  const update = useCallback(
    (next: readonly Move[]) => {
      movesRef.current = next;
      setMoves(next);
      try {
        const saved: SavedGame<Move> = { puzzleId, moves: [...next], elapsedSeconds: elapsedRef.current };
        window.localStorage.setItem(storageKey(info.id), JSON.stringify(saved));
      } catch {
        // Storage can be unavailable (private mode, blocked in some embeds); play continues unsaved.
      }
    },
    [info.id, puzzleId]
  );

  // localStorage isn't available during server rendering, so this has to happen client-side.
  useEffect(() => {
    const saved = loadSaved<Move>(info.id, puzzleId);
    elapsedRef.current = saved.elapsedSeconds;
    movesRef.current = saved.moves;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMoves(saved.moves);
    setStats(loadStats(info.id, dateKey));
    setLoaded(true);
  }, [info.id, puzzleId, dateKey]);

  useEffect(() => {
    if (!loaded || finished) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") elapsedRef.current += 1;
    }, 1000);
    return () => clearInterval(id);
  }, [loaded, finished]);

  useEffect(() => {
    if (loaded && finished) setStats(recordGame(info.id, dateKey, { won: solved, timeSeconds: elapsedRef.current }));
  }, [loaded, finished, solved, info.id, dateKey]);

  const send = useCallback(
    (body: object) => {
      const request = () =>
        postGameAction<{ game: RoundGameView<Move> | null }>(connection!, info.id, { puzzleId, ...body }).then(({ game }) => {
          unsentRef.current = false;
          if (game) {
            setServerPoints(game.points);
            elapsedRef.current = Math.max(elapsedRef.current, game.elapsedSeconds);
          }
          // The server only differs if another device got further first, and its moves are the real ones.
          const { moves: kept, upload } = reconcileMoves(movesRef.current, game?.moves ?? []);
          if (kept !== movesRef.current) update(kept);
          unsentRef.current = upload;
        });
      queueRef.current = queueRef.current.then(request).catch((err: unknown) => {
        if (err instanceof GameApiError && err.status === 409) {
          setNotice(err.message);
          return;
        }
        unsentRef.current = true;
        console.warn("Leaderboard sync failed", err);
      });
    },
    [connection, info.id, puzzleId, update]
  );

  const sendProgress = useCallback(() => send({ action: "progress", moves: movesRef.current, elapsedSeconds: elapsedRef.current }), [send]);

  // Once signed in, keep whichever copy of today's game is further along. If this device's is ahead, the next tick uploads it.
  useEffect(() => {
    if (!connection || !loaded || syncedRef.current) return;
    syncedRef.current = true;
    send({ action: "sync" });
  }, [connection, loaded, send]);

  useEffect(() => {
    if (!loaded) return;
    const tick = () => {
      update(movesRef.current);
      if (connection && (unsentRef.current || (!finished && movesRef.current.length > 0))) sendProgress();
    };
    const id = setInterval(tick, HEARTBEAT_MS);
    window.addEventListener("online", tick);
    return () => {
      clearInterval(id);
      window.removeEventListener("online", tick);
    };
  }, [loaded, finished, connection, sendProgress, update]);

  const addMove = useCallback(
    (move: Move) => {
      const next = [...movesRef.current, move];
      update(next);
      if (connection) sendProgress();
    },
    [connection, sendProgress, update]
  );

  const onShare = useMemo(
    () =>
      connection
        ? async (text: string) => {
            await connection.sdk.commands.shareLink({ message: text });
          }
        : undefined,
    [connection]
  );

  return { loaded, moves, addMove, result, puzzleId, connection, serverPoints, onShare, stats, notice: notice ?? connectError };
}
