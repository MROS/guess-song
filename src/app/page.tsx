import GameInterface from "@/components/GameInterface";

export default function Home() {
  return (
    <main className="main-container">
      <div className="title-area">
        <h1>🎵 猜歌大賽 🎵</h1>
        <p>聆聽10秒鐘，猜猜這是什麼歌！</p>
      </div>
      <GameInterface />
    </main>
  );
}
