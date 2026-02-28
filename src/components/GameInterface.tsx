"use client";

import { useState, useRef, useEffect } from "react";
import YouTube, { YouTubePlayer, YouTubeEvent } from "react-youtube";

type Song = {
    title: string;
    artist: string;
    videoId: string;
};

type GameState = "SETUP" | "LOADING" | "HINT" | "REVEAL" | "END";

export default function GameInterface() {
    const [theme, setTheme] = useState("");
    const [count, setCount] = useState(5);
    const [gameState, setGameState] = useState<GameState>("SETUP");
    const [songs, setSongs] = useState<Song[]>([]);
    const [currentSongIndex, setCurrentSongIndex] = useState(0);

    // Hint Phase variables
    const [player, setPlayer] = useState<YouTubePlayer | null>(null);
    const [timeRemaining, setTimeRemaining] = useState(10);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const [isPlayerReady, setIsPlayerReady] = useState(false);

    const startSetup = async () => {
        if (!theme) return alert("請輸入主題");
        setGameState("LOADING");
        try {
            const res = await fetch("/api/generate-songs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ theme, count }),
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            setSongs(data.songs);
            setCurrentSongIndex(0);
            setGameState("HINT");
            setTimeRemaining(10);
            setIsPlayerReady(false);
        } catch (err: any) {
            console.error(err);
            let errorMsg = err.message || "發生未知錯誤";

            // Handle the raw Google API JSON error string if it exists
            if (errorMsg.includes("429") || errorMsg.includes("Quota exceeded")) {
                errorMsg = "呼叫次數過於頻繁或已超過免費配額，請稍後再試或檢查 API Key 的計費狀態。";
            }

            alert("生成歌曲失敗：\n" + errorMsg);
            setGameState("SETUP");
        }
    };

    const currentSong = songs[currentSongIndex];

    // Tick the timer every second during HINT phase
    useEffect(() => {
        if (gameState === "HINT" && isPlayerReady) {
            timerRef.current = setInterval(() => {
                setTimeRemaining((prev) => {
                    if (prev <= 1) {
                        // Timer ended, but wait for user to click reveal
                        if (player) {
                            player.pauseVideo();
                        }
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [gameState, isPlayerReady, player]);

    const onPlayerReady = (event: YouTubeEvent) => {
        const p = event.target;
        setPlayer(p);

        if (gameState === "HINT") {
            const duration = p.getDuration();
            // Random start time, ensuring at least 15 seconds to play if possible
            const maxStart = Math.max(0, duration - 15);
            const randomStart = Math.floor(Math.random() * maxStart);

            p.seekTo(randomStart, true);
            p.playVideo();
            setIsPlayerReady(true);
            setTimeRemaining(10); // Reset time to 10 when a new song starts
        }
    };

    // Re-run player logic if current song changes but player is already ready?
    // react-youtube recreates the player or calls onReady when videoId changes
    // so we rely on onReady mostly. But we can also handle it here.

    const addTime = () => {
        setTimeRemaining((prev) => prev + 5);
        if (player && timeRemaining === 0) {
            // If it was paused, resume it
            player.playVideo();
        }
    };

    const reveal = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        setGameState("REVEAL");
        if (player) {
            player.playVideo(); // ensure playing in reveal
        }
    };

    const nextSong = () => {
        if (currentSongIndex < songs.length - 1) {
            setCurrentSongIndex((prev) => prev + 1);
            setGameState("HINT");
            setIsPlayerReady(false);
            setTimeRemaining(10);
        } else {
            setGameState("END");
        }
    };

    const restart = () => {
        setTheme("");
        setCount(5);
        setGameState("SETUP");
        setSongs([]);
        setCurrentSongIndex(0);
    };

    // Render logic...

    return (
        <div className="game-container">
            {gameState === "SETUP" && (
                <div className="setup-card animate-fade-in">
                    <h2>設定遊戲</h2>
                    <div className="input-group">
                        <label>主題描述 (例如：80年代華語熱門)</label>
                        <input
                            type="text"
                            value={theme}
                            onChange={(e) => setTheme(e.target.value)}
                            placeholder="輸入主題..."
                        />
                    </div>
                    <div className="input-group">
                        <label>歌曲數量</label>
                        <input
                            type="number"
                            value={count}
                            onChange={(e) => setCount(Number(e.target.value))}
                            min={1}
                            max={20}
                        />
                    </div>
                    <button className="btn-primary" onClick={startSetup}>
                        開始遊戲
                    </button>
                </div>
            )}

            {gameState === "LOADING" && (
                <div className="loading-card flex-center">
                    <div className="spinner"></div>
                    <p>正在生成歌曲清單...</p>
                </div>
            )}

            {(gameState === "HINT" || gameState === "REVEAL") && currentSong && (
                <div className={`active-game-card ${gameState === "REVEAL" ? "reveal-mode" : ""}`}>
                    <div className="header-info">
                        <span>第 {currentSongIndex + 1} / {songs.length} 首</span>
                        {gameState === "HINT" && (
                            <span className="timer">剩下: {timeRemaining} 秒</span>
                        )}
                    </div>

                    <div
                        className={`video-container ${gameState === "HINT" ? "hint-mode" : ""}`}
                    >
                        {/* YouTube player is always rendered to preload, just hidden visually during HINT */}
                        <YouTube
                            videoId={currentSong.videoId || ""}
                            opts={{
                                width: "100%",
                                height: "100%",
                                playerVars: {
                                    autoplay: 1,
                                    controls: gameState === "REVEAL" ? 1 : 0, // hide controls during HINT
                                    origin: typeof window !== "undefined" ? window.location.origin : undefined,
                                },
                            }}
                            onReady={onPlayerReady}
                            onError={(e) => {
                                console.error("YouTube Player Error", e.data);
                                // If video cannot be played, we can skip or reveal
                                // Let's just alert the user or auto-reveal the song
                                if (gameState === "HINT") {
                                    alert(`影片無法播放 (ID: ${currentSong.videoId})，請直接揭曉或換下一首。`);
                                    reveal();
                                }
                            }}
                            className="youtube-embed"
                        />
                    </div>

                    <div className="controls-container">
                        {gameState === "HINT" && (
                            <div className="hint-controls animate-slide-up">
                                <button className="btn-secondary" onClick={addTime}>
                                    +5 秒
                                </button>
                                <button className="btn-primary" onClick={reveal}>
                                    揭曉
                                </button>
                            </div>
                        )}

                        {gameState === "REVEAL" && (
                            <div className="reveal-info animate-slide-up">
                                <h3>{currentSong.title}</h3>
                                <p>{currentSong.artist}</p>
                                <div className="actions mt-4">
                                    <button className="btn-primary" onClick={nextSong}>
                                        下一首
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {gameState === "END" && (
                <div className="end-card animate-fade-in text-center">
                    <h2>遊戲結束！</h2>
                    <p>你猜對了幾首歌呢？</p>
                    <button className="btn-primary mt-4" onClick={restart}>
                        再玩一次
                    </button>
                </div>
            )}
        </div>
    );
}
