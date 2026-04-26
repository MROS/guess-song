import { NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";

const serverGeminiApiKey = process.env.GEMINI_API_KEY;

export async function POST(req: Request) {
    try {
        const { theme, count } = await req.json();

        if (!theme || !count) {
            return NextResponse.json(
                { error: "Missing theme or count" },
                { status: 400 }
            );
        }

        const customGeminiKey = req.headers.get("x-gemini-key");
        const activeApiKey = customGeminiKey || serverGeminiApiKey;

        if (!activeApiKey) {
            return NextResponse.json(
                { error: "Server missing Gemini API key and no custom key provided." },
                { status: 500 }
            );
        }

        const ai = new GoogleGenAI({ apiKey: activeApiKey });

        const generateGeminiSongs = async (targetCount: number, excludeTitles: string[] = []) => {
            let prompt = `根據主題「${theme}」提供 ${targetCount} 首歌曲。`;
            if (excludeTitles.length > 0) {
                prompt += ` 請不要包含以下這些歌曲：${excludeTitles.join('、')}。`;
            }

            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                title: { type: Type.STRING, description: "The name of the song" },
                                artist: { type: Type.STRING, description: "The name of the artist or band" },
                            },
                            required: ["title", "artist"],
                        },
                    },
                },
            });

            const text = response.text || "[]";
            try {
                return JSON.parse(text) as { title: string; artist: string }[];
            } catch (e) {
                console.error("Failed to parse Gemini response", text);
                return [];
            }
        };

        const fetchiTunesInfo = async (song: { title: string; artist: string }) => {
            const query = `${song.artist} ${song.title}`;
            try {
                const itunesRes = await fetch(
                    `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=5&country=tw`,
                    {
                        headers: {
                            // iTunes API sometimes blocks default Node.js fetches with 403 Forbidden
                            // Adding a dummy user-agent prevents this.
                            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
                        },
                    }
                );
                
                if (itunesRes.status === 429) {
                    throw new Error("ITUNES_429");
                }
                
                if (!itunesRes.ok) {
                    throw new Error(`iTunes API returned status: ${itunesRes.status}`);
                }
                
                const itunesData = await itunesRes.json();

                if (itunesData.results && itunesData.results.length > 0) {
                    const match = itunesData.results.find((r: any) =>
                        r.trackName.toLowerCase().includes(song.title.toLowerCase()) ||
                        song.title.toLowerCase().includes(r.trackName.toLowerCase())
                    );

                    if (match && match.previewUrl) {
                        return {
                            ...song,
                            previewUrl: match.previewUrl,
                            trackViewUrl: match.trackViewUrl,
                        };
                    }
                }
                return null; // Invalid song if no previewUrl or doesn't match
            } catch (e: any) {
                console.error("iTunes API error for query:", query, e.message);
                // Bubble up specific API blocks (like 429) so we can alert the user
                if (e.message === "ITUNES_429") {
                    throw e;
                }
                return null;
            }
        };

        let validSongs: { title: string; artist: string; previewUrl?: string; trackViewUrl?: string; }[] = [];
        const seenTitles = new Set<string>();

        // === 1. Round 1 ===
        // Request a buffer of +5 songs to handle potential iTunes matches failure
        const r1Songs = await generateGeminiSongs(count + 5);
        r1Songs.forEach(s => seenTitles.add(s.title));

        const r1Results = await Promise.all(r1Songs.map(fetchiTunesInfo));
        validSongs = r1Results.filter((s) => s !== null) as typeof validSongs;

        if (validSongs.length > count) {
            validSongs = validSongs.slice(0, count);
        }

        // === 2. Round 2 (If not enough valid songs were found) ===
        if (validSongs.length < count) {
            console.log(`Round 1 fell short. Got ${validSongs.length}/${count}. Retrying...`);
            const remainingCount = count - validSongs.length;
            const r2Songs = await generateGeminiSongs(remainingCount + 5, Array.from(seenTitles));

            const r2Results = await Promise.all(r2Songs.map(fetchiTunesInfo));
            const r2Valid = r2Results.filter((s) => s !== null) as typeof validSongs;

            validSongs = [...validSongs, ...r2Valid];

            if (validSongs.length > count) {
                validSongs = validSongs.slice(0, count);
            }
        }

        return NextResponse.json({ songs: validSongs });
    } catch (error: any) {
        console.error("Error in generate-songs route:", error);
        return NextResponse.json(
            { error: error.message || "Internal Server Error" },
            { status: 500 }
        );
    }
}
