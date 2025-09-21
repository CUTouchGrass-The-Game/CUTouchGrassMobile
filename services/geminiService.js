// geminiService.js
import { GoogleGenerativeAI } from "@google/generative-ai";
import { useCallback, useState } from "react";

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI("AIzaSyBYasuLRjg-RxyvSyclXYTrweevUjJBm-o");
const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash-exp",
  generationConfig: {
    temperature: 0.9, // Higher temperature for more randomness
    topP: 0.95, // Nucleus sampling for more variety
    topK: 40, // Top-k sampling for diverse outputs
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

  curseWithPrice:
    "Generate creative curses for a hide and seek game at Cornell University. Each curse should slow down the seekers " +
    "but not be too annoying. For each curse, provide:\n" +
    "1. A catchy name (2-4 words)\n" +
    "2. A description of what the curse does (1-2 sentences)\n" +
    "3. A price between 20-50 coins (multiples of 5 only: 20, 25, 30, 35, 40, 45, 50)\n" +
    "4. The effectiveness level (Low/Medium/High) - higher effectiveness = higher price\n\n" +
    "Examples:\n" +
    "- Name: 'Phone Ban'\n" +
    "- Description: 'Seekers cannot use their phones for 5 minutes'\n" +
    "- Price: 25\n" +
    "- Effectiveness: Medium\n\n" +
    "- Name: 'Library Quest'\n" +
    "- Description: 'Seekers must find and read one page from any book in the nearest library'\n" +
    "- Price: 40\n" +
    "- Effectiveness: High\n\n" +
    "Make curses creative, Cornell-specific when possible, and vary the difficulty and effectiveness. " +
    "Avoid curses that are just walking forwards/backwards or too simple.",
};

// Generate multiple prompts at once to avoid repetition
const generateMultiplePrompts = async (type, count) => {
  // Add randomization elements to make prompts more varied
  const randomElements = [
    "Focus on different areas of campus",
    "Include both indoor and outdoor locations", 
    "Mix easy and challenging tasks",
    "Consider different times of day",
    "Think about weather conditions",
    "Include both academic and social spaces",
    "Vary the specificity level",
    "Mix creative and practical approaches"
  ];
  
  const randomElement = randomElements[Math.floor(Math.random() * randomElements.length)];
  const timestamp = Date.now();
  
  const batchPrompt = `${CONTEXT}

${PROMPTS[type]}

Please generate exactly ${count} different and varied ${type} prompts. ${randomElement}. 
Current session: ${timestamp}
Number them 1-${count}. Make sure each one is completely different from the others, covering different types of objects, locations, and scenarios. Vary the difficulty and creativity. Be creative and think outside the box. Format as:
1. [prompt]
2. [prompt]
3. [prompt]
...`;

  try {
    // Add cache-busting and additional randomness
    const randomSeed = Math.random().toString(36).substring(7);
    const enhancedPrompt = `${batchPrompt}\n\nRandom seed: ${randomSeed}\nTimestamp: ${Date.now()}`;
    
    const result = await model.generateContent(enhancedPrompt);
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

// Generate curse prompts with prices, names, and descriptions
const generateCursePromptsWithPrices = async (count) => {
  // Different themes for each curse to ensure variety
  const curseThemes = [
    "Focus on academic challenges like library tasks, research, or studying",
    "Include physical activities like walking, running, or climbing", 
    "Mix technology and analog tasks like using phones vs. paper",
    "Consider social interactions with other students or staff",
    "Think about campus-specific locations like dining halls, gyms, or labs",
    "Include time-based challenges with specific durations",
    "Mix individual and group tasks requiring teamwork",
    "Consider seasonal activities and weather conditions",
    "Focus on creative tasks like drawing, writing, or performing",
    "Include problem-solving challenges and puzzles",
    "Think about sensory tasks involving sight, sound, or touch",
    "Consider transportation challenges around campus"
  ];
  
  // Generate a unique theme for each curse
  const selectedThemes = [];
  for (let i = 0; i < count; i++) {
    let theme;
    do {
      theme = curseThemes[Math.floor(Math.random() * curseThemes.length)];
    } while (selectedThemes.includes(theme) && selectedThemes.length < curseThemes.length);
    selectedThemes.push(theme);
  }
  
  const timestamp = Date.now();
  
  const batchPrompt = `${CONTEXT}

${PROMPTS.curseWithPrice}

Please generate exactly ${count} different and varied curse prompts. Each curse should have a different theme:
${selectedThemes.map((theme, index) => `${index + 1}. ${theme}`).join('\n')}

Current session: ${timestamp}
Format each curse as:

Name: [curse name]
Description: [curse description]
Price: [price in coins]
Effectiveness: [Low/Medium/High]

Make sure each curse is completely different from the others, covering different types of challenges and scenarios. Vary the difficulty, effectiveness, and prices. Ensure prices are only multiples of 5 between 20-50. Be creative and think of unique, engaging challenges that match their assigned themes.`;

  try {
    // Add cache-busting and additional randomness
    const randomSeed = Math.random().toString(36).substring(7);
    const enhancedPrompt = `${batchPrompt}\n\nRandom seed: ${randomSeed}\nTimestamp: ${Date.now()}`;
    
    const result = await model.generateContent(enhancedPrompt);
    const response = await result.response;
    const text = response.text().trim();

    console.log(`Raw curse response:`, text); // Debug log

    // Parse the curse responses
    const curses = [];
    const curseBlocks = text.split(/(?=Name:)/).filter(block => block.trim());

    for (const block of curseBlocks) {
      const lines = block.trim().split('\n').filter(line => line.trim());
      
      let name = '';
      let description = '';
      let price = 0;
      let effectiveness = '';

      for (const line of lines) {
        const trimmedLine = line.trim();
        
        if (trimmedLine.startsWith('Name:')) {
          name = trimmedLine.replace('Name:', '').trim();
        } else if (trimmedLine.startsWith('Description:')) {
          description = trimmedLine.replace('Description:', '').trim();
        } else if (trimmedLine.startsWith('Price:')) {
          const priceMatch = trimmedLine.match(/Price:\s*(\d+)/);
          if (priceMatch) {
            price = parseInt(priceMatch[1]);
            // Ensure price is a multiple of 5 between 20-50
            if (price < 20) price = 20;
            if (price > 50) price = 50;
            price = Math.round(price / 5) * 5; // Round to nearest multiple of 5
          }
        } else if (trimmedLine.startsWith('Effectiveness:')) {
          effectiveness = trimmedLine.replace('Effectiveness:', '').trim();
        }
      }

      // Only add if we have all required fields
      if (name && description && price > 0 && effectiveness) {
        curses.push({
          name,
          description,
          price,
          effectiveness
        });
      }
    }

    console.log(`Parsed ${curses.length} curse prompts:`, curses); // Debug log

    if (curses.length === 0) {
      throw new Error('Failed to parse any curse prompts from response');
    }

    return curses;
  } catch (error) {
    console.error(`Error generating ${count} curse prompts with prices:`, error);
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

// Shuffle array with additional randomness
const shuffleWithSeed = (array) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// Export the curse generation function
export { generateCursePromptsWithPrices };

// Main function to generate all prompts for a game
export const generateAllPromptsForGame = async (gameId) => {
  try {
    console.log(`Generating optimized prompts for game: ${gameId}`);

    // Step 1: Generate photo, see, and curse prompts in parallel
    console.log("Step 1: Generating initial prompts...");
    const [photoPrompts, seePrompts, cursePrompts, cursePromptsWithPrices] = await Promise.all([
      generateMultiplePrompts("photo", 12),
      generateMultiplePrompts("see", 12),
      generateMultiplePrompts("curse", 6), // Generate 3 curse prompts directly
      generateCursePromptsWithPrices(3), // Generate 3 structured curse prompts with prices
    ]);

    console.log(
      `Generated ${photoPrompts.length} photo, ${seePrompts.length} see`
    );

    // Step 2: Use AI to select the 5 best from each category
    console.log("Step 2: AI selecting best prompts...");
    const [bestPhotoPrompts, bestSeePrompts, bestCursePrompts] = await Promise.all([
      selectBestPrompts(photoPrompts, "photo", 6),
      selectBestPrompts(seePrompts, "see", 6),
      selectBestPrompts(cursePrompts, "curse", 3),
    ]);

    console.log(
      `Selected ${bestPhotoPrompts.length} best photo and ${bestSeePrompts.length} best see prompts`
    );

    // Step 3: Randomly select and shuffle final prompts
    console.log("Step 3: Random final selection...");
    const finalPrompts = {
      photo: shuffleWithSeed(randomlySelectFromBest(bestPhotoPrompts, 3)),
      see: shuffleWithSeed(randomlySelectFromBest(bestSeePrompts, 3)),
      curse: shuffleWithSeed(bestCursePrompts), // Shuffle curse prompts too
      curseWithPrices: cursePromptsWithPrices, // Include structured curse prompts with prices
    };

    console.log("Final selection:", {
      photo: finalPrompts.photo,
      see: finalPrompts.see,
      curse: finalPrompts.curse,
      curseWithPrices: finalPrompts.curseWithPrices,
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