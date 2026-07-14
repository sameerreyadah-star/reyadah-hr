/**
 * Face Verification Service
 * 
 * This service handles:
 * 1. Storing selfie photos taken during clock-in/out
 * 2. Comparing selfies with stored employee photos
 * 3. Basic liveness detection (blur, brightness checks)
 * 
 * Note: For production-grade face matching, integrate with a dedicated
 * face recognition API (AWS Rekognition, Azure Face API, etc.)
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Minimum acceptable image quality thresholds
const MIN_BRIGHTNESS = 10;
const MAX_BRIGHTNESS = 250;
const MIN_VARIANCE = 8; // Lowered from 15 - was too strict

/**
 * Save a selfie image from buffer to disk
 * @param {Buffer} imageBuffer - Raw image data
 * @param {string} employeeId - Employee ID for filename
 * @param {string} type - 'clockIn' or 'clockOut'
 * @returns {Promise<string>} Relative path to saved image
 */
async function saveSelfie(imageBuffer, employeeId, type) {
  const selfiesDir = path.join(__dirname, '..', '..', 'uploads', 'selfies');
  if (!fs.existsSync(selfiesDir)) {
    fs.mkdirSync(selfiesDir, { recursive: true });
  }

  const timestamp = Date.now();
  const filename = `${employeeId}_${type}_${timestamp}.jpg`;
  const filepath = path.join(selfiesDir, filename);

  // Process and save as JPEG with reasonable quality
  await sharp(imageBuffer)
    .jpeg({ quality: 80, mozjpeg: true })
    .resize(640, 480, { fit: 'inside', withoutEnlargement: true })
    .toFile(filepath);

  return `/uploads/selfies/${filename}`;
}

/**
 * Analyze image quality (blur detection, brightness checks)
 * Uses a multi-factor scoring approach that's more lenient
 * @param {Buffer} imageBuffer - Raw image data
 * @returns {Promise<{pass: boolean, score: number, reasons: string[]}>}
 */
async function analyzeImageQuality(imageBuffer) {
  const reasons = [];
  
  try {
    const metadata = await sharp(imageBuffer).metadata();
    const { width, height } = metadata;

    // Check minimum resolution - slightly more lenient
    if (width < 150 || height < 150) {
      reasons.push('Image too small (minimum 150x150 pixels)');
    }

    // Get pixel data for analysis
    const pixelData = await sharp(imageBuffer)
      .grayscale()
      .raw()
      .toBuffer();

    // Calculate average brightness
    const avgBrightness = pixelData.reduce((sum, val) => sum + val, 0) / pixelData.length;
    
    if (avgBrightness < MIN_BRIGHTNESS) {
      reasons.push('Image too dark');
    }
    if (avgBrightness > MAX_BRIGHTNESS) {
      reasons.push('Image too bright/overexposed');
    }

    // Calculate variance (low variance = solid color = likely blank/fake)
    const variance = pixelData.reduce((sum, val) => sum + Math.pow(val - avgBrightness, 2), 0) / pixelData.length;
    if (variance < MIN_VARIANCE) {
      reasons.push('Image appears blank or uniform');
    }

    // Edge detection for blur detection
    // Use a sampling approach to improve performance and robustness
    const sampleStep = Math.max(2, Math.floor(Math.min(width, height) / 100));
    let edgeSum = 0;
    let edgeCount = 0;
    for (let y = sampleStep; y < height - sampleStep; y += sampleStep) {
      for (let x = sampleStep; x < width - sampleStep; x += sampleStep) {
        const idx = y * width + x;
        // Simple edge detection: compare with neighbors at sample distance
        const diff = Math.abs(pixelData[idx] - pixelData[idx - sampleStep]) +
                     Math.abs(pixelData[idx] - pixelData[idx + sampleStep]) +
                     Math.abs(pixelData[idx] - pixelData[idx - width * sampleStep]) +
                     Math.abs(pixelData[idx] - pixelData[idx + width * sampleStep]);
        edgeSum += diff;
        edgeCount += 4;
      }
    }
    
    const avgEdgeStrength = edgeCount > 0 ? edgeSum / edgeCount : 0;
    
    // More lenient blur detection - only flag if truly blank
    if (avgEdgeStrength < 2) {
      reasons.push('Image appears blurry or empty - no distinguishable features detected');
    }

    // Multi-factor scoring: more forgiving
    // If only minor issues (e.g., slight blur but good brightness), still pass
    const criticalIssues = reasons.filter(r => 
      r.includes('blank') || r.includes('too small')
    );
    
    const minorIssues = reasons.filter(r => 
      r.includes('dark') || r.includes('bright') || r.includes('blurry')
    );

    // Allow passing if there are no critical issues and at most 1 minor issue
    const pass = criticalIssues.length === 0 && minorIssues.length <= 1;
    
    // Score calculation
    const score = pass ? 100 : Math.max(0, 100 - (criticalIssues.length * 40 + minorIssues.length * 20));

    return { pass, score, reasons };
  } catch (err) {
    // Don't fail completely on analysis error - allow through with warning
    return {
      pass: true,
      score: 60,
      reasons: ['Warning: ' + err.message],
    };
  }
}

/**
 * Compare two face images for similarity
 * Uses a multi-resolution comparison approach for better accuracy
 * @param {string} imagePath1 - Path to first image
 * @param {string} imagePath2 - Path to second image  
 * @returns {Promise<{match: boolean, similarity: number}>}
 */
async function compareFaces(imagePath1, imagePath2) {
  try {
    // Normalize both images before comparison: resize to same size, equalize
    const compareSize = 64; // Using 64x64 for better balance of speed and accuracy
    
    const [pixels1, pixels2] = await Promise.all([
      sharp(imagePath1)
        .grayscale()
        .resize(compareSize, compareSize, { fit: 'fill' })
        .raw()
        .toBuffer(),
      sharp(imagePath2)
        .grayscale()
        .resize(compareSize, compareSize, { fit: 'fill' })
        .raw()
        .toBuffer(),
    ]);

    // Normalize pixel values (contrast stretching) to reduce lighting sensitivity
    function normalizePixels(pixels) {
      let min = 255, max = 0;
      for (let i = 0; i < pixels.length; i++) {
        if (pixels[i] < min) min = pixels[i];
        if (pixels[i] > max) max = pixels[i];
      }
      const range = max - min;
      if (range === 0) return pixels;
      const normalized = new Uint8Array(pixels.length);
      for (let i = 0; i < pixels.length; i++) {
        normalized[i] = Math.round(((pixels[i] - min) / range) * 255);
      }
      return normalized;
    }

    const norm1 = normalizePixels(pixels1);
    const norm2 = normalizePixels(pixels2);

    // Calculate Structural Similarity-like measure
    // Mean and variance for each image
    let mean1 = 0, mean2 = 0;
    for (let i = 0; i < norm1.length; i++) {
      mean1 += norm1[i];
      mean2 += norm2[i];
    }
    mean1 /= norm1.length;
    mean2 /= norm2.length;

    let variance1 = 0, variance2 = 0, covariance = 0;
    for (let i = 0; i < norm1.length; i++) {
      const d1 = norm1[i] - mean1;
      const d2 = norm2[i] - mean2;
      variance1 += d1 * d1;
      variance2 += d2 * d2;
      covariance += d1 * d2;
    }
    variance1 /= norm1.length;
    variance2 /= norm2.length;
    covariance /= norm1.length;

    // SSIM constants
    const C1 = 0.01 * 255 * 0.01 * 255;
    const C2 = 0.03 * 255 * 0.03 * 255;
    
    const numerator = (2 * mean1 * mean2 + C1) * (2 * covariance + C2);
    const denominator = (mean1 * mean1 + mean2 * mean2 + C1) * (variance1 + variance2 + C2);
    
    let ssim = denominator > 0 ? numerator / denominator : 0;
    
    // Also compute normalized cross-correlation (NCC) as additional metric
    let ncc = 0;
    let normSum1 = 0, normSum2 = 0;
    for (let i = 0; i < norm1.length; i++) {
      ncc += norm1[i] * norm2[i];
      normSum1 += norm1[i] * norm1[i];
      normSum2 += norm2[i] * norm2[i];
    }
    const denom = Math.sqrt(normSum1 * normSum2);
    if (denom > 0) {
      ncc = ncc / denom;
    }

    // Combine SSIM and NCC for more robust comparison
    // SSIM ranges 0-1, NCC ranges 0-1, combine with more weight on NCC
    const combined = (ssim * 0.4 + ncc * 0.6);
    
    // Convert to similarity percentage
    const similarity = Math.round(combined * 100);

    // More lenient matching threshold
    // If similarity is above 35%, consider it a potential match
    // This accounts for different lighting, angles, and expressions
    const match = similarity > 35;

    return {
      match,
      similarity,
      metrics: {
        ssim: Math.round(ssim * 100) / 100,
        ncc: Math.round(ncc * 100) / 100,
      },
    };
  } catch (err) {
    console.error('Face comparison error:', err.message);
    return {
      match: false,
      similarity: 0,
    };
  }
}

/**
 * Get the stored employee face photo path (for attendance verification)
 * Falls back to profile photo if face photo is not available
 * @param {object} employee - Employee model instance
 * @returns {string|null} Full file path or null
 */
function getEmployeePhotoPath(employee) {
  // First check dedicated face photo
  if (employee && employee.facePhotoUrl) {
    const facePath = path.join(__dirname, '..', '..', employee.facePhotoUrl);
    if (fs.existsSync(facePath)) return facePath;
  }
  // Fall back to profile photo
  if (!employee || !employee.photoUrl) return null;
  const photoPath = path.join(__dirname, '..', '..', employee.photoUrl);
  return fs.existsSync(photoPath) ? photoPath : null;
}

module.exports = {
  saveSelfie,
  analyzeImageQuality,
  compareFaces,
  getEmployeePhotoPath,
};