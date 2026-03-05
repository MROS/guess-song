"use client";

import { useState, useRef, useEffect } from "react";

type Song = {
    title: string;
    artist: string;
    previewUrl?: string;
    trackViewUrl?: string;
};

type GameState = "SETUP" | "LOADING" | "HINT" | "REVEAL" | "END";

export default function GameInterface() {
    const [theme, setTheme] = useState("");
    const [count, setCount] = useState(5);
    const [gameState, setGameState] = useState<GameState>("SETUP");
    const [songs, setSongs] = useState<Song[]>([]);
    const [currentSongIndex, setCurrentSongIndex] = useState(0);

    // Hint Phase variables
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [timeRemaining, setTimeRemaining] = useState(10);
    const [isPlaying, setIsPlaying] = useState(false);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // Custom API Key
    const [userGeminiKey, setUserGeminiKey] = useState("");

    useEffect(() => {
        const storedKey = localStorage.getItem("userGeminiKey");
        if (storedKey) setUserGeminiKey(storedKey);
    }, []);

    const startSetup = async () => {
        if (!theme) return alert("請輸入主題");
        setGameState("LOADING");
        try {
            const res = await fetch("/api/generate-songs", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-gemini-key": userGeminiKey || ""
                },
                body: JSON.stringify({ theme, count }),
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            setSongs(data.songs);
            setCurrentSongIndex(0);
            setTimeRemaining(10);
            setIsPlaying(false);
            setGameState("HINT");
        } catch (err: any) {
            console.error(err);
            if (err.message === "QUOTA_EXCEEDED" || err.message?.includes("429")) {
                alert("系統預設的免費配額已耗盡！請在下方進階設定中，輸入您自己的 Gemini API Key 以繼續遊玩。");
                setGameState("SETUP");
                return;
            }

            let errorMsg = err.message || "發生未知錯誤";
            alert("生成歌曲失敗：\n" + errorMsg);
            setGameState("SETUP");
        }
    };

    const currentSong = songs[currentSongIndex];

    // Tick the timer every second during HINT phase when audio is playing
    useEffect(() => {
        if (gameState === "HINT" && isPlaying) {
            timerRef.current = setInterval(() => {
                setTimeRemaining((prev) => {
                    if (prev <= 1) {
                        // Timer ended, but wait for user to click reveal
                        if (audioRef.current) {
                            audioRef.current.pause();
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
    }, [gameState, isPlaying]);

    // Autoplay when transitioning to HINT
    useEffect(() => {
        if (gameState === "HINT" && currentSong?.previewUrl && audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().then(() => {
                setIsPlaying(true);
            }).catch(e => {
                console.error("Audio playback failed automatically:", e);
            });
        }
    }, [gameState, currentSongIndex, currentSong]);

    const addTime = () => {
        setTimeRemaining((prev) => prev + 5);
        if (audioRef.current && timeRemaining === 0) {
            audioRef.current.play().catch(e => console.error(e));
        }
    };

    const reveal = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        setGameState("REVEAL");
        if (audioRef.current) {
            audioRef.current.play().catch(e => console.error(e));
        }
    };

    const nextSong = () => {
        if (currentSongIndex < songs.length - 1) {
            setCurrentSongIndex((prev) => prev + 1);
            setGameState("HINT");
            setTimeRemaining(10);
            setIsPlaying(false);
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
        if (audioRef.current) {
            audioRef.current.pause();
        }
    };

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
                    <div className="input-group">
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>自訂 Gemini API Key (選填)</span>
                            <a
                                href="https://ai.google.dev/gemini-api/docs/api-key?hl=zh-tw"
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ fontSize: '13px', color: '#60a5fa', textDecoration: 'underline', fontWeight: 'normal' }}
                            >
                                去哪裏申請？
                            </a>
                        </label>
                        <input
                            type="password"
                            value={userGeminiKey}
                            onChange={(e) => {
                                setUserGeminiKey(e.target.value);
                                localStorage.setItem("userGeminiKey", e.target.value);
                            }}
                            placeholder="若無則使用系統預設... (儲存於瀏覽器)"
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
                        {currentSong.previewUrl ? (
                            <audio
                                ref={audioRef}
                                src={currentSong.previewUrl}
                                controls={gameState === "REVEAL"}
                                className="html5-audio"
                                style={{ width: '100%', marginTop: gameState === "REVEAL" ? '20px' : '0' }}
                                onPlay={() => setIsPlaying(true)}
                                onPause={() => setIsPlaying(false)}
                                onError={() => {
                                    if (gameState === "HINT") {
                                        alert('音訊無法播放，請直接揭曉或換下一首。');
                                        reveal();
                                    }
                                }}
                            />
                        ) : (
                            <div className="no-audio-msg" style={{ padding: '20px', textAlign: 'center', color: '#ffaaaa' }}>
                                找不到此歌曲的試聽音源 😢
                            </div>
                        )}
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
                                {currentSong.trackViewUrl && (
                                    <a href={currentSong.trackViewUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary mt-2" style={{ display: 'inline-block', fontSize: '14px', padding: '8px 16px', background: 'rgba(255,255,255,0.1)', color: '#fff', textDecoration: 'none', borderRadius: '4px' }}>
                                        在 Apple Music 聆聽
                                    </a>
                                )}
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
