import { GoogleGenAI, Type } from "@google/genai";
import { GeminiResponse } from "../types";

export async function extractReturnInfo(fileData: string, mimeType: string): Promise<GeminiResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured in the environment.");
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: [
        {
          parts: [
            {
              inlineData: {
                data: fileData,
                mimeType: mimeType,
              },
            },
            {
              text: "Analyze this receipt or QR code and extract return details. \n\n1. itemName: Provide a simplified, clean, and recognizable product name (e.g., 'Denim Jacket' instead of 'MNS SLM FIT STRCH DNM JKT BLU L'). Remove SKU numbers, sizes, and redundant descriptors unless essential.\n2. deadline: Extract the return deadline in YYYY-MM-DD format. If only a window is given (e.g., '30 days'), calculate it from the purchase date. Assume today is 2026-03-15 if no purchase date is found.\n3. packagingRules: Summarize key return requirements (e.g., 'Original tags & packaging required').\n4. storeName: Extract the name of the store (e.g., 'Zara', 'Apple Store').\n5. storeHours: Extract or infer store hours if visible (e.g., 'Mon-Sun 10AM-9PM').\n6. storeAddress: Extract the full address of the store or the specific branch.\n\nBe precise and concise.",
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            itemName: { type: Type.STRING },
            deadline: { type: Type.STRING, description: "YYYY-MM-DD format" },
            packagingRules: { type: Type.STRING },
            storeName: { type: Type.STRING },
            storeHours: { type: Type.STRING },
            storeAddress: { type: Type.STRING },
          },
          required: ["itemName", "deadline", "packagingRules", "storeName", "storeHours", "storeAddress"],
        },
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("Gemini returned an empty response.");
    }

    return JSON.parse(text) as GeminiResponse;
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    throw new Error(`Failed to call Gemini: ${error.message || "Unknown error"}`);
  }
}

export async function lookupStoreHours(storeName: string, location?: { latitude: number, longitude: number }): Promise<{ storeHours: string, storeAddress: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured in the environment.");
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Find the store hours and address for "${storeName}" near my location. Return the information in a clear format.`,
      config: {
        tools: [{ googleMaps: {} }],
        toolConfig: {
          retrievalConfig: {
            latLng: location ? {
              latitude: location.latitude,
              longitude: location.longitude
            } : undefined
          }
        }
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("Gemini returned an empty response.");
    }

    const structuredResponse = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: `Based on this information about a store: "${text}", extract the store hours and full address.
      
      Return as JSON:
      {
        "storeHours": "...",
        "storeAddress": "..."
      }`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            storeHours: { type: Type.STRING },
            storeAddress: { type: Type.STRING },
          },
          required: ["storeHours", "storeAddress"],
        }
      }
    });

    return JSON.parse(structuredResponse.text) as { storeHours: string, storeAddress: string };
  } catch (error: any) {
    console.error("Gemini Maps Error:", error);
    return { storeHours: "Hours not found", storeAddress: "Address not found" };
  }
}
