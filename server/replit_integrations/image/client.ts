/**
 * @deprecated This module belongs to the legacy Replit platform integration layer.
 * It is NOT used in the production code path. See LEGACY_MODULES.md for the
 * deprecation plan. This module will be removed in a future major release (v2.0.0).
 */
import fs from "node:fs";
import { toFile } from "openai";
import { Buffer } from "node:buffer";
import { createAiClient, getAiProviderConfig, getImageModel } from "../../services/ai-provider";

function getOpenAiClient() {
  return createAiClient(getAiProviderConfig());
}

/**
 * Generate an image and return as Buffer.
 */
export async function generateImageBuffer(
  prompt: string,
  size: "1024x1024" | "512x512" | "256x256" = "1024x1024"
): Promise<Buffer> {
  const openai = getOpenAiClient();
  const response = await openai.images.generate({
    model: getImageModel(),
    prompt,
    size,
  });
  const base64 = response.data?.[0]?.b64_json ?? "";
  return Buffer.from(base64, "base64");
}

/**
 * Edit/combine multiple images into a composite.
 * Uses gpt-image-1 model via Replit AI Integrations.
 */
export async function editImages(
  imageFiles: string[],
  prompt: string,
  outputPath?: string
): Promise<Buffer> {
  const images = await Promise.all(
    imageFiles.map((file) =>
      toFile(fs.createReadStream(file), file, {
        type: "image/png",
      })
    )
  );

  const openai = getOpenAiClient();
  const response = await openai.images.edit({
    model: getImageModel(),
    image: images,
    prompt,
  });

  const imageBase64 = response.data?.[0]?.b64_json ?? "";
  const imageBytes = Buffer.from(imageBase64, "base64");

  if (outputPath) {
    fs.writeFileSync(outputPath, imageBytes);
  }

  return imageBytes;
}

