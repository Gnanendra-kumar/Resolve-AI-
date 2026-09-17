import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || "dummy-key-for-local-dev" });

const LLM_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

export interface DiagnosisResult {
  rootCause: string;
  resolution: string;
  fixDiff: string;
  confidence: number;
  riskLevel: "low" | "medium" | "high";
  errorType: string;
  reasoning: string;
}

const SYSTEM_PROMPT = `You are an expert Site Reliability Engineer (SRE) specializing in CI/CD pipeline failures and incident diagnosis.

Your task is to analyze build/deployment failure logs and provide a structured diagnosis.

Always respond with valid JSON matching this exact schema:
{
  "rootCause": "A concise, technical description of the root cause (1-2 sentences)",
  "resolution": "Step-by-step resolution instructions",
  "fixDiff": "A unified diff of the exact code/config change needed (empty string if not applicable)",
  "confidence": <integer 0-100>,
  "riskLevel": "low" | "medium" | "high",
  "errorType": "dependency_missing" | "config_error" | "syntax_error" | "env_missing" | "network_error" | "permissions_error" | "timeout" | "test_failure" | "build_error" | "other",
  "reasoning": "Brief explanation of your confidence level and risk assessment"
}

Important Instructions:
1. If the failure is a test failure or code assertion failure (e.g. AssertionError, unittest, pytest), classify errorType as "test_failure".
2. If there are Similar Past Resolutions or if the failure log suggests a clear code fix, you MUST generate the exact unified diff in the "fixDiff" field. Do not leave it empty.

Risk level guidelines:
- low: YAML/config indentation, missing npm package, typo in build script, doc changes
- medium: Dockerfile changes, workflow restructuring, environment variable additions
- high: Database migrations, IAM/permissions, infrastructure deletion, production deployments`;

export async function diagnoseIncident(
  logs: string,
  similarCases: string[],
  repoContext?: { name: string; language?: string; branch: string }
): Promise<DiagnosisResult> {
  if (process.env.MOCK_DB === "true" || !process.env.GROQ_API_KEY) {
    console.log("[GroqService][MOCK] Bypassing Groq LLM diagnosis. Returning mock diagnosis.");
    return {
      rootCause: "Mock diagnosis: A simulated error pattern was detected in the logs.",
      resolution: "Check dependencies in package.json and ensure all modules are properly installed using 'npm install'.",
      fixDiff: `diff --git a/package.json b/package.json
index 123456..789012 100644
--- a/package.json
+++ b/package.json
@@ -10,2 +10,3 @@
     "express": "^4.19.2",
+    "lodash": "^4.17.21"
   }`,
      confidence: 90,
      riskLevel: "low",
      errorType: "dependency_missing",
      reasoning: "Simulated SRE confidence calculation based on mock parameters."
    };
  }
  const contextBlock =
    similarCases.length > 0
      ? `\n\n## Similar Past Resolutions (use these as context):\n${similarCases
          .slice(0, 3)
          .map((c, i) => `### Case ${i + 1}:\n${c}`)
          .join("\n\n---\n\n")}`
      : "";

  const repoBlock = repoContext
    ? `\n\n## Repository Context:\n- Name: ${repoContext.name}\n- Language: ${repoContext.language || "Unknown"}\n- Branch: ${repoContext.branch}`
    : "";

  // Truncate logs keeping both the start (setup context) and the end (where errors happen)
  let truncatedLogs = logs;
  const maxLogLength = 8000;
  if (logs.length > maxLogLength) {
    const keepStart = 1500;
    const keepEnd = maxLogLength - keepStart - 100;
    truncatedLogs = `${logs.slice(0, keepStart)}\n\n... [TRUNCATED ${logs.length - maxLogLength} CHARS] ...\n\n${logs.slice(-keepEnd)}`;
  }
  
  console.log(`[GroqService] Sending ${truncatedLogs.length} chars of logs to LLM. (Original size: ${logs.length})`);

  const userMessage = `Please diagnose this CI/CD failure:${repoBlock}${contextBlock}

## Failure Logs:
\`\`\`
${truncatedLogs}
\`\`\``;

  const response = await groq.chat.completions.create({
    model: LLM_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    response_format: { type: "json_object" },
    temperature: 0.15,
    max_tokens: 1500,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("Groq returned empty response");

  const result = JSON.parse(content) as DiagnosisResult;

  // Clamp confidence to valid range
  result.confidence = Math.max(0, Math.min(100, result.confidence));
  return result;
}

export async function embedText(text: string): Promise<number[]> {
  const vector = new Array(768).fill(0);
  
  // Clean the text and split into words
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
  
  if (words.length === 0) {
    vector[0] = 1;
    return vector;
  }

  // Hash each word deterministically into the 768-dimensional space
  for (const word of words) {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = (hash << 5) - hash + word.charCodeAt(i);
      hash |= 0;
    }
    const index = Math.abs(hash) % 768;
    vector[index] += 1;
  }

  // Normalize the vector to avoid division by zero and optimize cosine similarity
  let magnitude = 0;
  for (let i = 0; i < 768; i++) {
    magnitude += vector[i] * vector[i];
  }
  magnitude = Math.sqrt(magnitude);

  if (magnitude > 0) {
    for (let i = 0; i < 768; i++) {
      vector[i] /= magnitude;
    }
  } else {
    vector[0] = 1;
  }

  return vector;
}

export async function generateFix(
  diagnosis: DiagnosisResult,
  currentFileContent: string,
  filePath: string
): Promise<string> {
  if (process.env.MOCK_DB === "true" || !process.env.GROQ_API_KEY) {
    return "Mock fix patch diff content";
  }
  const response = await groq.chat.completions.create({
    model: LLM_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You are an expert developer. Generate a unified diff patch to fix the issue described. Output ONLY the unified diff, nothing else.",
      },
      {
        role: "user",
        content: `Fix this issue: ${diagnosis.rootCause}\n\nResolution: ${diagnosis.resolution}\n\nFile: ${filePath}\n\nCurrent content:\n\`\`\`\n${currentFileContent.slice(0, 3000)}\n\`\`\``,
      },
    ],
    temperature: 0.1,
    max_tokens: 1000,
  });

  return response.choices[0]?.message?.content || "";
}
