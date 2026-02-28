import { NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";

const geminiApiKey = process.env.GEMINI_API_KEY;
const youtubeApiKey = process.env.YOUTUBE_API_KEY;

const ai = new GoogleGenAI({ apiKey: geminiApiKey });

export async function POST(req: Request) {
    try {
        const { theme, count } = await req.json();

        if (!theme || !count) {
            return NextResponse.json(
                { error: "Missing theme or count" },
                { status: 400 }
            );
        }

        if (!geminiApiKey || !youtubeApiKey) {
            return NextResponse.json(
                { error: "Missing API keys in environment variables" },
                { status: 500 }
            );
        }

        // 1. Generate song list using Gemini
        const prompt = `根據主題「${theme}」提供 ${count} 首歌曲。`;
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
                            title: {
                                type: Type.STRING,
                                description: "The name of the song",
                            },
                            artist: {
                                type: Type.STRING,
                                description: "The name of the artist or band",
                            },
                        },
                        required: ["title", "artist"],
                    },
                },
            },
        });

        const text = response.text || "[]";
        let songs: { title: string; artist: string }[] = [];
        try {
            songs = JSON.parse(text);
        } catch (e) {
            console.error("Failed to parse Gemini response", text);
            return NextResponse.json(
                { error: "Failed to generate valid song list" },
                { status: 500 }
            );
        }

        // 2. Map youtube video IDs
        const resultSongs = await Promise.all(
            songs.map(async (song) => {
                const query = `${song.artist} ${song.title} official music video`;
                const ytRes = await fetch(
                    `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(
                        query
                    )}&key=${youtubeApiKey}&type=video&maxResults=1&videoEmbeddable=true`
                );
                const ytData = await ytRes.json();

                // default to empty if not found
                let videoId = "";
                if (ytData.items && ytData.items.length > 0) {
                    videoId = ytData.items[0].id.videoId;
                } else {
                    console.log("YouTube API returned no items:", JSON.stringify(ytData, null, 2));
                    if (ytData.error) {
                        console.error("YouTube API Error:", ytData.error.message);
                        if (ytData.error.message.includes("quota")) {
                            throw new Error("YouTube API 配額已用盡");
                        }
                    }
                }

                return {
                    ...song,
                    videoId,
                };
            })
        );

        return NextResponse.json({ songs: resultSongs });
    } catch (error: any) {
        console.error("Error in generate-songs route:", error);
        return NextResponse.json(
            { error: error.message || "Internal Server Error" },
            { status: 500 }
        );
    }
}
