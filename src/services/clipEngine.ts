// import { pipeline, env } from '@xenova/transformers';

// // Configure environment for robust remote model loading
// env.allowRemoteModels = true;
// env.useBrowserCache = true;
// env.remoteHost = 'https://huggingface.co/';
// env.remotePathTemplate = '{model}/resolve/{revision}/';

/**
 * clipEngine.ts
 * A lightweight Vision-Language Model (CLIP) module for intelligent fitness analysis.
 * Features: Auto-classification, Confidence Scoring, and Session Tagging.
 */

export interface ClipResult {
  label: string;
  confidence: number;
}

class ClipEngine {
  private classifier: any = null;
  private isLoading = false;
  private isAnalyzing = false;
  private mode: 'local' | 'cloud' = 'cloud';
  private progress = 0; // 0 to 100
  // Note: For production, this should be in an .env file
  private readonly hfToken: string = ""; // Removed for security

  // Labels for zero-shot image classification
  private readonly labels = [
    "person doing pushup",
    "person doing squat",
    "person doing plank",
    "person doing jumping jack",
    "person doing bicep curl",
    "person standing"
  ];

  public isReady() {
    return !!this.classifier;
  }

  public isBusy() {
    return this.isLoading;
  }

  public getMode() {
    return this.mode;
  }

  public getProgress() {
    return this.progress;
  }

  /**
   * Initializes the CLIP model. 
   * Uses quantized INT8 weights for ~150MB download size.
   */
  public async init() {
    this.mode = 'cloud';
    this.isLoading = false;
    // Local init disabled
  }

  /**
   * Analyzes a video frame using either local CLIP or Hugging Face Cloud Inference.
   */
  public async analyzeFrame(image: HTMLCanvasElement | HTMLImageElement): Promise<ClipResult | null> {
    if (this.isAnalyzing) return null;

    if (this.mode === 'local') {
      // Local mode disabled for now to bypass Vite 500 errors
      return null;
      try {
        this.isAnalyzing = true;
        const results = await this.classifier(image, this.labels);
        return {
          label: results[0]?.label || "unknown",
          confidence: results[0]?.score || 0
        };
      } catch (error) {
        console.error("CLIP: Local Inference Error:", error);
        return null;
      } finally {
        this.isAnalyzing = false;
      }
    } else if (this.mode === 'cloud') {
      return this.analyzeFrameCloud(image);
    }

    return null;
  }

  private async analyzeFrameCloud(image: HTMLCanvasElement | HTMLImageElement): Promise<ClipResult | null> {
    if (this.isAnalyzing) return null;

    try {
      this.isAnalyzing = true;

      // 1. Convert image to JPEG Blob
      const blob = await new Promise<Blob | null>((resolve) => {
        if (image instanceof HTMLCanvasElement) {
          image.toBlob((b) => resolve(b), 'image/jpeg', 0.6);
        } else {
          resolve(null);
        }
      });

      if (!blob) return null;

      // 2. Query Hugging Face Inference API
      const response = await fetch(
        "https://api-inference.huggingface.co/models/openai/clip-vit-base-patch32",
        {
          headers: {
            Authorization: `Bearer ${this.hfToken}`,
            "Content-Type": "application/json",
            "x-wait-for-model": "true"
          },
          method: "POST",
          body: JSON.stringify({
            inputs: await this.blobToBase64(blob),
            parameters: { candidate_labels: this.labels }
          }),
        }
      );

      if (!response.ok) {
        return null;
      }

      const results = await response.json();
      if (Array.isArray(results) && results.length > 0) {
        const top = results[0];
        return { label: top.label, confidence: top.score };
      }

      return null;
    } catch (error) {
      return null;
    } finally {
      this.isAnalyzing = false;
    }
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64 || "");
      };
      reader.readAsDataURL(blob);
    });
  }

  generateSessionTags(stats: {
    accuracy: number;
    avgConfidence: number;
    mistakes: string[];
    duration: number;
  }): string[] {
    const tags: string[] = [];
    if (stats.accuracy > 90) tags.push("Elite Precision");
    else if (stats.accuracy > 70) tags.push("Strong Consistency");
    if (stats.avgConfidence > 0.8) tags.push("Posture Master");
    if (stats.duration > 300) tags.push("High Endurance");
    if (stats.mistakes.length === 0) tags.push("Perfect Form Streak");
    return tags.length > 0 ? tags : ["Completed Session"];
  }
}

export const clipEngine = new ClipEngine();
