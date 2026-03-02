import { NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";

const geminiApiKey = process.env.GEMINI_API_KEY;

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

        if (!geminiApiKey) {
            return NextResponse.json(
                { error: "Missing Gemini API key in environment variables" },
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

        // 2. Map iTunes Search API preview URLs
        const resultSongs = await Promise.all(
            songs.map(async (song) => {
                const query = `${song.artist} ${song.title}`;
                const itunesRes = await fetch(
                    `https://itunes.apple.com/search?term=${encodeURIComponent(
                        query
                    )}&entity=song&limit=1`
                );
                const itunesData = await itunesRes.json();

                // default to empty if not found
                let previewUrl = "";
                let trackViewUrl = "";
                if (itunesData.results && itunesData.results.length > 0) {
                    previewUrl = itunesData.results[0].previewUrl;
                    trackViewUrl = itunesData.results[0].trackViewUrl;
                } else {
                    console.log("iTunes API returned no items for query:", query);
                }

                return {
                    ...song,
                    previewUrl,
                    trackViewUrl,
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
