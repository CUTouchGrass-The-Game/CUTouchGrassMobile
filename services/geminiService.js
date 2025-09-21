// geminiService.js
import { GoogleGenerativeAI } from "@google/generative-ai";
import { useCallback, useState } from "react";

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI("AIzaSyC6_UjsX4TJuEPmdhlKjzvcuhMbFHTS-lM");
const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash-exp",
  generationConfig: {
    temperature: 0.7, // Increased for more variety
  },
});

const CONTEXT =
  "We are playing the game hide and seek in Cornell University inspired by the youtube series Jet Lag: The Game.";

const PROMPTS = {
  photo:
    "Can you generate a creative question that asks the hider to take a photo of something interesting near " +
    "their hiding spot? Generate the question in a single sentence, which each with one single thing to " +
    "photograph. Do not give multiple options, and don't be too specific. Avoid using 'most distinctive' " +
    "or 'most unique'. For example, take a photo of the tallest visible building, straight up, " +
    "nearest bus station, touching nearest plant, body of water, gorge, etc. Avoid using asterisks in your " +
    "response. It shouldn't be annoying to do and should provide valuable information for the seekers.",

  see:
    "Can you generate a creative question that asks the hider if they can see a specific object " +
    "near their hiding spot? Generate the question in a single sentence. Do not give multiple options, " +
    "and don't be too specific. It can be anything reasonable, not just buildings or street signs or emergency " +
    "poles/boxes. Avoid using 'most distinctive' or 'most unique'. For example, can you see a cafe, can you " +
    "see the Slope, can you see a dining hall, can you see a printer, etc. Avoid using asterisks in your " +
    "response. It shouldn't be annoying to do and should provide valuable information for the seekers.",

  curse:
    "Can you generate a curse that will slow the seekers down. Generate it with a single sentence. " +
    "For example, the curse may make the seekers read a page of a book from the nearest library, ban " +
    "their phone use for 10 minutes, or a throw a rock for a certain distance. It shouldn't be too " +
    "annoying to do but should slow down the seekers. Don't just generate ones that walk forwards " +
    "or backwards",
};

// Generate multiple prompts at once to avoid repetition
const generateMultiplePrompts = async (type, count) => {
  const batchPrompt = `${CONTEXT}

${PROMPTS[type]}

Please generate exactly ${count} different and varied ${type} prompts. Number them 1-${count}. Make sure each one is completely different from the others, covering different types of objects, locations, and scenarios. Vary the difficulty and creativity. Format as:
1. [prompt]
2. [prompt]
3. [prompt]
...`;

  try {
    const result = await model.generateContent(batchPrompt);
    const response = await result.response;
    const text = response.text().trim();

    // Parse the numbered responses
    // Parse the numbered responses with better error handling
    const lines = text
      .trim()
      .split("\n")
      .filter((line) => line && line.trim());
    const prompts = [];

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      const match = trimmedLine.match(/^\d+\.\s*(.+)$/);
      if (match && match[1] && match[1].trim()) {
        prompts.push(match[1].trim());
      }
    }

    console.log(`Parsed ${prompts.length} ${type} prompts:`, prompts); // Debug log

    if (prompts.length === 0) {
      throw new Error(`Failed to parse any ${type} prompts from response`);
    }

    return prompts;
  } catch (error) {
    console.error(`Error generating ${count} ${type} prompts:`, error);
    throw error;
  }
};

// Use AI to select the most interesting prompts
const selectBestPrompts = async (prompts, type, targetCount) => {
  const selectionPrompt = `Here are ${
    prompts.length
  } ${type} prompts for a Cornell University hide and seek game:

${prompts.map((prompt, i) => `${i + 1}. ${prompt}`).join("\n")}

Please select the ${targetCount} most fun, interesting, and strategically valuable prompts for the game. Consider:
- Variety in difficulty and creativity
- Strategic value for seekers
- Fun factor and engagement
- Avoiding repetitive or similar prompts
- Cornell-specific opportunities

Respond with ONLY the numbers of your selected prompts, comma-separated (e.g., "2, 5, 8, 12, 15"):`;

  try {
    const result = await model.generateContent(selectionPrompt);
    const response = await result.response;

    if (!response) {
      throw new Error("No response from Gemini API for selection");
    }

    const text = response.text();

    if (!text || typeof text !== "string") {
      throw new Error("Invalid selection response from Gemini API");
    }

    console.log(`Raw selection response for ${type}:`, text); // Debug log

    const selectedNumbers = response
      .text()
      .trim()
      .split(",")
      .map((num) => parseInt(num.trim()) - 1) // Convert to 0-based indices
      .filter((index) => index >= 0 && index < prompts.length);

    return selectedNumbers.map((index) => prompts[index]);
  } catch (error) {
    console.error(`Error selecting best ${type} prompts:`, error);
    // Fallback: randomly select if AI selection fails
    const shuffled = [...prompts].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, targetCount);
  }
};

// Randomly select final prompts from the curated list
const randomlySelectFromBest = (bestPrompts, finalCount) => {
  const shuffled = [...bestPrompts].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, finalCount);
};

// Main function to generate all prompts for a game
export const generateAllPromptsForGame = async (gameId) => {
  try {
    console.log(`Generating optimized prompts for game: ${gameId}`);

    // Step 1: Generate 10 photo and 10 see prompts in parallel
    console.log("Step 1: Generating initial prompts...");
    const [photoPrompts, seePrompts, /* cursePrompts */] = await Promise.all([
      generateMultiplePrompts("photo", 12),
      generateMultiplePrompts("see", 12),
      // generateMultiplePrompts("curse", 3), // Generate 3 curse prompts directly
    ]);

    console.log(
      `Generated ${photoPrompts.length} photo, ${seePrompts.length} see`
    );

    // Step 2: Use AI to select the 5 best from each category
    console.log("Step 2: AI selecting best prompts...");
    const [bestPhotoPrompts, bestSeePrompts] = await Promise.all([
      selectBestPrompts(photoPrompts, "photo", 6),
      selectBestPrompts(seePrompts, "see", 6),
    ]);

    console.log(
      `Selected ${bestPhotoPrompts.length} best photo and ${bestSeePrompts.length} best see prompts`
    );

    // Step 3: Randomly select 2 from each category of best prompts
    console.log("Step 3: Random final selection...");
    const finalPrompts = {
      photo: randomlySelectFromBest(bestPhotoPrompts, 3),
      see: randomlySelectFromBest(bestSeePrompts, 3),
      // curse: cursePrompts, // Use all 3 curse prompts
    };

    console.log("Final selection:", {
      photo: finalPrompts.photo,
      see: finalPrompts.see,
      // curse: finalPrompts.curse,
    });

    // Step 4: Return prompts directly (removed Firebase database operations)
    console.log("All prompts generated - returning directly");
    return finalPrompts;
  } catch (error) {
    console.error("Error in generateAllPromptsForGame:", error);
    throw error;
  }
};

// Generate a single fresh prompt (for when user wants something new)
export const generateSinglePrompt = async (type) => {
  const result = await model.generateContent(promptText);
  const response = await result.response;

  if (!response) {
    throw new Error("No response from Gemini API");
  }

  const text = response.text();

  if (!text || typeof text !== "string") {
    throw new Error("Invalid response text from Gemini API");
  }

  return text.trim();
};

// Get a random prompt from the available ones
export const getRandomPrompt = (prompts, type) => {
  if (!prompts[type] || prompts[type].length === 0) {
    throw new Error(`No ${type} prompts available`);
  }

  const randomIndex = Math.floor(Math.random() * prompts[type].length);
  return prompts[type][randomIndex];
};

// Custom hook for managing game prompts
export const useGeminiPrompts = (gameId) => {
  const [prompts, setPrompts] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const initializeGame = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Try to get existing prompts first
      const existingPrompts = await getGamePrompts(gameId);
      setPrompts(existingPrompts);
      console.log("Loaded existing prompts");
    } catch (err) {
      // If no existing prompts, generate new ones with the optimized flow
      console.log("No existing prompts found, generating optimized prompts...");
      try {
        const newPrompts = await generateAllPromptsForGame(gameId);
        setPrompts(newPrompts);
      } catch (generateError) {
        setError("Failed to generate game prompts");
        throw generateError;
      }
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  const regeneratePrompts = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const newPrompts = await generateAllPromptsForGame(gameId);
      setPrompts(newPrompts);
    } catch (err) {
      setError("Failed to regenerate prompts");
      throw err;
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  const getPrompt = useCallback(
    (type) => {
      if (!prompts) {
        throw new Error("Prompts not loaded yet");
      }
      return getRandomPrompt(prompts, type);
    },
    [prompts]
  );

  return {
    prompts,
    loading,
    error,
    initializeGame,
    regeneratePrompts,
    getPrompt,
  };
};

// Custom hook for generating individual prompts
export const useGeminiGenerator = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generatePrompt = useCallback(async (type) => {
    setLoading(true);
    setError(null);

    try {
      const prompt = await generateSinglePrompt(type);
      return prompt;
    } catch (err) {
      setError(`Failed to generate ${type} prompt`);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    generatePrompt,
    loading,
    error,
  };
};